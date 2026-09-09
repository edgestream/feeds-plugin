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

`apps/mcp-server` is a thin adapter over `FeedService`. Runtime composes platforms,
providers and service. `createFeedsMcpServer({ feeds })` exposes the same tool over
stdio and stateless Streamable HTTP using the MCP TypeScript SDK and Zod.

## Tool

`get_feed(source, context?, answers?)` accepts a complete public post or profile URL.
Bare handles, IDs and internal URIs are unsupported. The optional booleans select
upstream endpoints: `context` selects a thread, `answers` a conversation and takes
precedence when both are true. Both require a post URL. Profile URLs retrieve the
author's feed using upstream defaults. See [CLI.md](CLI.md) for supported URL forms.

Each call makes one upstream request. Successful results contain:

- `structuredContent`: the complete upstream JSON object;
- one text content block containing that same JSON.

The response has no added wrapper, post schema or metadata. Envelope fields,
grouped results, duplicate entries, unknown fields and upstream cursor fields are
preserved. There are no page options, local filtering, deduplication or automatic
continuation. Clients interpret the provider's response directly, including any
body-level error codes in HTTP-success responses.

The server exposes no resources, resource links or resource templates. The tool
advertises a generic JSON-object output schema and read-only, non-destructive,
idempotent and open-world annotations. Retrieved content is untrusted data.
There is no search, writing, media download, cache, subscription or background
refresh, and no upstream availability or completeness guarantee.

The companion [URL routing skill](PLUGIN.md#url-routing-skill) calls this tool with
the original public URL. A standalone MCP connection does not install the skill.

## Bounds, cancellation, errors

MCP requests have a 60-second deadline and a 10-MiB result budget, including both
text and structured content. Oversized results fail instead of returning partial
data. Cancellation propagates to upstream HTTP. A deadline reports `TIMEOUT`;
caller cancellation reports `CANCELLED`. Provider duration/response limits apply too.

Tool failures return `isError: true` and one JSON text block `{ code, diagnostic }`,
without successful structured content. Input validation rejects unsupported
parameters. Input errors include public URL examples. Original exceptions retain
names, messages, stacks, recursive causes and available HTTP endpoint/status/
headers/body diagnostics, without a debug flag. Unexpected throws retain their
evidence too. This intentionally exposes local paths and upstream content to
clients; treat diagnostic content as untrusted data. No retries or fallback occur.

Diagnostic serialization retains own properties and Error names/messages/stacks/causes,
including non-Error throws. Unsupported primitive types are tagged. Cycles/repeated
references, unevaluated accessors (except Error.stack), inspection failures, and
limits are explicit `omitted` markers. Traversal is limited to 32 levels, 10,000
values and 6 Mi UTF-16 code units. If the escaped diagnostic exceeds the result
budget (128 bytes reserved for wrapping), clients receive a serialized prefix and
an explicit omission marker. Injected result budgets must be at least 512 bytes so failure envelopes fit;
the default remains 10 MiB. Failures never contain successful structured content.

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

Tests cover URL routing, unchanged response content, rejection of removed inputs,
in-memory tool discovery/calls, error mapping, limits, and real loopback HTTP.
Packaging tests copy both bundles outside the repository without `node_modules`,
then initialize clients, discover the tool and retrieve injected upstream
data. No automated test requires live X/fxTwitter access.

A live ChatGPT account connection and deployed HTTPS/authentication endpoint are
not provisioned by this implementation. Verify actual MCP calls after configuring
that environment; a natural-language answer alone is not evidence of tool use.
