# Architecture

Feeds uses Node.js 24, TypeScript, ESM, and npm workspaces. TypeScript project
references check package boundaries. Node's test runner executes TypeScript tests
through tsx; esbuild produces the committed CLI and MCP bundles.

## Dependency direction

```text
apps/cli --------+
apps/mcp-server -+--> packages/runtime --> packages/application --> packages/core
                  |--> packages/platform-x ------------------> core
                  |--> packages/provider-fxtwitter ------------> core
```

- `core` defines subjects, feed queries, feed pages, platform/provider contracts,
  cancellation, JSON values, and typed errors. Platforms also parse and format
  platform-owned references for internal resource URIs. It imports no Node or frontend code.
- `application` depends only on core. `FeedService.show(url, options, context)`
  resolves a subject and dispatches to the selected `FeedProvider.get(query, context)`.
  Optional all-page traversal deduplicates post identities and detects cursor loops.
- `apps/mcp-server` exposes `get_feed` and `feeds://{platform}/{reference}` through
  stdio and Streamable HTTP. It constructs no providers or platforms.
- `platform-x` recognizes public post/profile URLs and owns X identity; it performs
  no HTTP calls and knows no provider.
- `provider-fxtwitter` translates queries, responses, and reply relationships using
  an injected HTTP client. It depends only on core.
- `runtime` reads configuration and explicitly composes platforms, providers, and
  service. There is no dynamic discovery.
- `apps/cli` parses arguments, calls the service, formats JSON, and handles process
  output and SIGINT. It constructs no providers or platforms.

## Subjects, selection, and response

`FeedSubject` is a discriminated union of `PostRef { kind: "post", platform, id }`
and `AuthorRef { kind: "author", platform, handle }`. IDs remain strings. X post
identity ignores the input username; X author handles are case-insensitive.
Subjects remain independent of the selected provider.

`FeedQuery` separates the subject from `scope.ancestors`, `scope.replies`, `cursor`,
and `limit`. The URL chooses the entry point; scope chooses related posts. Answers
are relative to the focal post, even when ancestors are requested too.

`FeedPage { posts, nextCursor? }` contains zero or more flat
`FeedPost { ref, parent?, data }` values. Parent references represent replies,
including parents absent from this page. Chronological neighbors, quotes, and
reposts are not parent relationships. Consumers can construct trees without
requiring every parent on every page. Page order is provider order, not a
promised chronological or topological ordering.

This replaces V1's complete upstream response passthrough: identity and reply
relationships are normalized, while each post's `data` preserves its upstream
JSON object. Upstream response envelopes and grouped thread wrappers are not
returned. There is no normalized text/media schema. Standard JavaScript JSON
parsing and serialization apply, including numeric precision limits.

Cursors are opaque provider-owned strings; use them with the same subject and
selection. Absence of a cursor means no continuation was supplied, not that all
posts on the platform are visible. Missing parent references likewise do not
prove the absence of upstream context. `--all` follows at most 100 pages and
fails on cursor cycles or the bound without emitting a partial success. Duplicate
post identities retain their first position and latest data.

## Extensions and verification

New platforms implement `Platform`, including URL resolution and internal reference
parsing/formatting; new providers implement `FeedProvider`. Register them explicitly
in runtime. `FeedService.get(subject, options, context)` routes direct references
through the same retrieval implementation used by `show`. The application URI
codec owns `feeds://{platform}/{encoded-reference}`; the platform owns meaning.
`FeedService.resolveSource` resolves MCP URLs, internal URIs, and bare references
through the sole configured platform; URL syntax never falls back to reference
parsing. CLI `show` remains URL-only. X numeric references mean posts; author handles canonicalize to lowercase. Numeric
authors remain accessible by public URL but cannot have an unambiguous internal URI.
Composite collections can receive platform-specific semantics in future; X lists
are not implemented.

MCP translates `FeedError` codes without assuming normalized post content. It adds
resource links and explicit null continuation at its presentation boundary, and
supplies a cumulative result budget to application traversal. See [MCP.md](MCP.md)
for schemas, limits, transports, and [PLUGIN.md](PLUGIN.md) for packaging.

Provider contracts live in `test/contracts/feedProviderContract.ts`. Adapter tests
inject responses and cover malformed structures, unsafe inputs, pagination,
limits, and cancellation. CLI tests cover output and exit codes. Packaging tests
invoke local `npx feeds` against the committed bundle with injected fetch and no
live API requests. Rebuild the bundle after runtime source/dependency changes.
