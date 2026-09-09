# MCP interface

## Get started

Feeds is a read-only plugin for public social-media posts, available context,
replies, and author feeds. Install the plugin to use it; running either MCP
entry point directly is only needed for local development or a standalone MCP
connection.

### ChatGPT desktop app

1. Open the **Plugins Directory** in ChatGPT desktop.
2. Select the **Edgestream Lab** marketplace.
3. Choose **Feeds Dev** and select **Install**.
4. Start a new chat and ask, for example: “Read the feed at
   `https://x.com/OpenAI`.”

The plugin contributes both the Feeds MCP tool and its X-URL routing skill. The
skill can select Feeds for retrieval requests that contain an `https://x.com`
URL. In other requests, explicitly ask ChatGPT to use Feeds.

### Codex CLI

Add the Edgestream marketplace once, then install the plugin:

```bash
codex plugin marketplace add edgestream/agent-marketplace --ref development
codex plugin add feeds-dev@edgestream-dev
```

Confirm that it is enabled with `codex plugin list`, then start a new Codex task
and ask it to use Feeds. To update the marketplace snapshot later, run
`codex plugin marketplace upgrade edgestream-dev` and reinstall the plugin if a
new version is available.

For a checkout-local MCP server instead of the plugin, build the project and
register its stdio entry point from the repository root:

```bash
npm ci
npm run build
codex mcp add feeds -- node "$(pwd)/dist/feeds-mcp.mjs"
codex mcp get feeds
```

This standalone configuration provides the MCP server but not the plugin’s URL
routing skill.

## Architecture

`apps/mcp-server` is a thin adapter over `FeedService`, following the Recipes
plugin architecture. `createFeedsMcpServer({ feeds })` registers the same surface
for stdio and stateless Streamable HTTP. Entry points call the runtime composition
root; the adapter never constructs or names providers. Node 24, TypeScript, ESM,
the MCP TypeScript SDK 2 and Zod 4 share the existing workspace toolchain.

## Tool

`get_feed(source, context?, answers?, cursor?, limit?, all?)` reads public posts,
available ancestors, replies, and author feeds. `source` accepts a supported public
URL, a `feeds://` URI, or a bare reference when exactly one platform is configured.
With the current X configuration, `OpenAI` is an author handle;
all-digit strings such as `123456` are post IDs. Existing X handle rules apply
(1–15 ASCII letters, digits or underscores, no @, no reserved navigation names).
Malformed or unsupported URLs are rejected, never retried as handles. With zero
or multiple platforms, use an explicit URL or URI. Options have the same meaning and restrictions as the
[CLI](CLI.md): `limit` is an author page size (1–100, default 25), context/answers
require a post, and cursors require authors or answers. Defaults are false for
context, answers, and all. There is no search, writing, media download, cache,
subscription, or background refresh.

When the desired post count is unspecified, start with one page without `all`.
Use `all: true` only when the user explicitly requests full traversal of available
pages. `limit` controls author page size, not a total post count. All traversed
pages share the 60-second total request budget, without a completeness guarantee.

The tool declares read-only, non-destructive, idempotent, open-world annotations.
Its description and server instructions explain selection, paging, incomplete
upstream coverage, and treating retrieved content as untrusted data.

Plugin installations also include the [URL routing skill](PLUGIN.md#url-routing-skill)
for retrieval requests containing `https://x.com` URLs. It selects the installed
Feeds tool before generic X-page retrieval and preserves the original URL and
one-page defaults. A standalone MCP connection does not expose that skill.
Explicitly requesting Feeds is a workaround for missed automatic selection;
missing tools and provider errors remain failures, and host activation is not
guaranteed.

Successful results contain:

- `structuredContent: { posts: [{ ref, parent?, data, uri }], nextCursor }`;
- a text content block containing that same JSON;
- one `resource_link` per returned post, with a stable identity-based name and
  `application/json` MIME type.

`data` preserves each upstream JSON object. `uri` is presentation metadata and
never replaces a source URL inside `data`. No normalized text/media schema is
assumed. `nextCursor` is explicitly `null` when absent internally. Consumers keep
parent references even when those parents are outside the page. Result schemas
are advertised and validated; error results contain `isError: true` and a JSON
text block `{ code, diagnostic }` instead of the success payload.

## Resource identity

One non-enumerated resource template serves every configured platform:

```text
feeds://{platform}/{reference}
feeds://x/OpenAI
feeds://x/123456
```

The application codec owns the scheme, lowercase platform authority and exactly
one percent-encoded reference segment. Credentials, ports, query strings,
fragments, empty or dot references, and malformed escapes are rejected. A
composite reference can be encoded as one segment; its semantics belong entirely
to its platform. X currently supports posts and individual authors, not lists.

Platforms parse and format references. For X, all-digit references identify posts;
other valid handles identify authors and canonicalize to lowercase. Numeric author
handles are available through public profile URLs, e.g. `https://x.com/123456`.
They cannot be serialized as unambiguous internal author URIs. Post IDs remain
strings. Provider replacement does not change these platform identities.

`resources/read` returns the same JSON shape as tool structured content. An author
resource reads its current first page, not a stored profile or snapshot. Use
`get_feed` with the source URI and cursor for continuation or additional scope.
`resources/list` returns no instances: there is no global catalog of public posts
or authors. Resource links are resolved on their originating server connection;
a shared scheme does not provide routing between independent MCP servers.

## Bounds, cancellation, errors

MCP requests have a 60-second total deadline and a 10-MiB result budget. The
application checks cumulative serialized post bytes during traversal (including
duplicates); MCP also checks the complete content/structured-content envelope.
Oversized results fail rather than truncate. Request individual pages or a smaller
author limit if necessary. `all` additionally retains the application limit of
100 pages, deduplication, and cursor-cycle detection. Cursor exhaustion does not
prove a complete view of the platform.

Cancellation propagates through `RequestContext.signal` to upstream HTTP. A total
MCP deadline reports `TIMEOUT` with instructions to retry without `all` (or with
`all: false`), then pass each returned `nextCursor` as `cursor` with the same source
and scope; caller cancellation reports `CANCELLED`. Other
`FeedError` codes remain observable as supplemental classification. Development
failures expose original names, messages, stacks, recursive causes, and available
HTTP endpoint/status/headers/body in `diagnostic`, without a debug flag. Unexpected
throws retain their evidence too. This intentionally exposes local paths and
upstream content to clients; treat diagnostic content as untrusted data. Tool input is validated before execution. Invalid or missing
resources report MCP Invalid Params with `{ code, diagnostic }` in error data; other
resource failures report Internal Error with the same data. Tool and resource
diagnostics use the same serializer over both transports. Input errors retain their codes and include correction hints and valid source
examples. No upstream retry or provider fallback is introduced. Existing provider duration and response limits still apply.

Diagnostic serialization retains own properties and Error names/messages/stacks/causes,
including non-Error throws. Unsupported primitive types are tagged. Cycles/repeated
references, unevaluated accessors (except Error.stack), inspection failures, and
limits are explicit `omitted` markers. Traversal is limited to 32 levels, 10,000
values and 6 Mi UTF-16 code units. If the escaped diagnostic exceeds the result
budget (128 bytes reserved for wrapping), clients receive a serialized prefix and
an explicit omission marker. Injected result budgets must be at least 512 bytes so failure envelopes fit;
the default remains 10 MiB. Failures never contain successful posts or cursor exhaustion.

## Transports

```bash
node ./dist/feeds-mcp.mjs
node ./dist/feeds-mcp-http.mjs
```

The committed bundles run without development dependencies. stdio reserves stdout
for protocol traffic and sends operational messages to stderr. HTTP exposes
`/mcp` and `GET /health`, with JSON responses and request-scoped streaming when
required by the SDK. It has no persistent MCP sessions or legacy SSE endpoint.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `FEEDS_X_PROVIDER` | `fxtwitter` | Shared runtime selection. |
| `FEEDS_MCP_HTTP_HOST` | `127.0.0.1` | Listener address. |
| `FEEDS_MCP_HTTP_PORT` | `3000` | Port from 1 to 65535. |
| `FEEDS_MCP_HTTP_ALLOW_REMOTE` | unset | Must be `true` to bind outside loopback. |
| `FEEDS_MCP_HTTP_PUBLIC_URL` | local `/mcp` URL | Public HTTP(S) endpoint; also allows its Host header. |
| `FEEDS_MCP_HTTP_ALLOWED_ORIGINS` | loopback hostnames | Whitespace-separated trusted browser origin hostnames. |

Requests validate Host and Origin before dispatch. Both declared and chunked
bodies are limited to 1 MiB. Headers and incoming requests use bounded timeouts;
disconnected clients abort active MCP work. SIGINT/SIGTERM stop the listener, with
a ten-second grace period before closing active connections. HTTP operational
errors do not log upstream content, credentials, or stack traces.

For remote ChatGPT use, expose `/mcp` over HTTPS through a compatible authenticated
proxy or Secure MCP Tunnel. TLS, OAuth, hosting and account setup are external to
this package; binding a public listener alone does not configure authentication.
The local plugin manifests launch stdio, not HTTP. See the official
[ChatGPT developer-mode guide](https://developers.openai.com/api/docs/guides/developer-mode)
for connection setup and actual tool-call verification.

## Verification and remaining deployment work

Tests cover URI codecs, platform interpretation, shared service behavior, in-memory
MCP discovery/calls/resource reads, error mapping, limits, and real loopback HTTP.
Packaging tests copy both bundles outside the repository without `node_modules`,
then initialize clients, discover tools/resources and retrieve injected upstream
data. No automated test requires live X/fxTwitter access.

A live ChatGPT account connection and deployed HTTPS/authentication endpoint are
not provisioned by this implementation. Verify actual MCP calls after configuring
that environment; a natural-language answer alone is not evidence of tool use.
