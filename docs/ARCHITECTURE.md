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

- `core` defines the small platform/provider contracts, request options,
  cancellation, JSON values, and typed errors. It imports no Node or frontend code.
- `application` parses the public URL, selects its platform and configured provider,
  and returns the provider result unchanged.
- `platform-x` recognizes supported public X post/profile URLs. It performs no HTTP
  calls and has no reference or identity model.
- `provider-fxtwitter` selects a fixed upstream endpoint from the URL and options,
  makes one request through an injected HTTP client, and returns the complete JSON object.
  It depends only on core and validates URLs independently for direct callers.
- `runtime` reads configuration and explicitly composes platforms, providers, and
  service. There is no dynamic discovery.
- `apps/cli` parses arguments, calls the service, formats JSON, and handles process
  output and SIGINT. It constructs no providers or platforms.
- `apps/mcp-server` exposes only `get_feed` through stdio and Streamable HTTP.
  It constructs no providers or platforms.

## Retrieval contract

`FeedService.show(url, options, context)` selects a platform using
`Platform.supports(URL)` and calls `FeedProvider.get(URL, options, context)` once.
`FeedOptions` contains `context`, `answers`, and an optional opaque `cursor`. Providers return `JsonObject`.
Providers translate these options into upstream requests and validate supported
subject/option combinations. The application does not select or filter posts.
Provider-specific behavior belongs in each provider package's README.

The entire upstream JSON object is preserved, including its envelope, grouped
results, duplicates, unknown fields, and any upstream cursor fields. There is no
post model, identity/parent normalization, filtering, deduplication, page traversal,
automatic continuation, or resource URI. Manual author-feed and conversation continuation forwards
an explicit cursor to the provider without interpreting response fields. Only complete public URLs are accepted.
JSON parsing/serialization preserves JSON values, not original bytes or whitespace;
standard JavaScript numeric precision limits apply. Providers use built-in
`Response.json()`; MCP uses `JSON.stringify()` and forwards structured content.
There is no response traversal, output-schema validation, custom deadline, byte
budget or recursive diagnostic serializer. HTTP status checks do not read the body.

This contract replaces the previous normalized feed/page model. Consumers now
interpret the upstream response directly. The CLI pretty-prints that response;
MCP places it in structured content and a JSON text block without adding fields.

## Extensions and verification

New platforms implement URL recognition; new providers implement the URL-to-JSON
contract. Register them explicitly in runtime. Runtime selects one provider per
platform. Provider replacement may change the returned JSON structure.

Adapter tests inject HTTP responses and cover complete response preservation,
endpoint selection, malformed JSON, unsafe URLs, native parsing and cancellation.
Run the reusable provider contract in `test/contracts/feedProviderContract.ts`.
CLI and MCP tests verify the same raw result, removed input options, and error
behavior. Packaging tests invoke the committed bundles from isolated installations
without live API access. Rebuild bundles after runtime source/dependency changes.
See [MCP.md](MCP.md) for transports and diagnostics and [PLUGIN.md](PLUGIN.md)
for packaging.
