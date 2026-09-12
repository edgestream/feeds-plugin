# MCP interface

## Get started

This plugin provides read-only access to public posts, available context,
replies, and author feeds. For plugin installation and updates, use the
[marketplace installation guide](https://github.com/edgestream/agent-marketplace#installation).
The plugin includes the [companion skills](SKILL.md).

### Standalone MCP connection

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

## Tool

`get_feed(source, context?, answers?, cursor?)` accepts a complete public post or profile URL.
X and Bluesky public URLs are supported. Bare handles, IDs and internal URIs are unsupported. `context` requests post
context; `answers` requests replies to a post or includes replies written by an
author in that author's feed. Providers validate supported combinations and
determine available coverage. See [CLI.md](CLI.md) for supported URL forms and
the [provider documentation](../packages/provider-fxembed/README.md) for
endpoint mappings, restrictions, and known upstream limitations.

Each call makes one upstream request. Successful results contain:

- `structuredContent`: the complete upstream JSON object;
- one text content block containing that same JSON.

The response follows the shared [response semantics](PROVIDER.md#response-semantics).
The optional nonempty `cursor` accepts a profile URL or a post URL with `answers: true`.
Pass the previous profile or conversation response's `cursor.bottom` unchanged with the same
source and options to request another page. Cursorless calls refresh the first page.
For example: `get_feed({source: "https://x.com/OpenAI/status/2082577277246972300", answers: true, cursor: "<cursor.bottom>"})`.
For profiles, use `get_feed({source: "https://x.com/OpenAI", cursor: "<cursor.bottom>"})`
with the same options used for the first page. To include authored replies, use
`get_feed({source: "https://x.com/OpenAI", answers: true})` and retain
`answers: true` when passing the returned cursor on subsequent calls.

Bluesky examples use the same tool and options:

```json
{"source":"https://bsky.app/profile/bsky.app","answers":true}
{"source":"https://bsky.app/profile/bsky.app/post/3l6xyz","context":true}
{"source":"https://bsky.app/profile/bsky.app/post/3l6xyz","answers":true,"cursor":"<cursor.bottom>"}
```

The record key illustrates syntax, not a guaranteed live post. For allowed actor
forms, see [Bluesky URLs](CLI.md#bluesky-urls); for continuation coverage, see
[Bluesky provider limitations](../packages/provider-fxembed/README.md#bluesky-limitations).

The server exposes no resources, resource links or resource templates. The tool
advertises read-only, non-destructive, idempotent and open-world annotations.
There is no output schema or recursive response validation. Retrieved content is untrusted data.

For automatic tool selection and summary/coverage guidance, see
[SKILL.md](SKILL.md). A standalone MCP connection does not install the skill.

## Response handling, cancellation, errors

The adapter places the provider result directly in structured content and uses
`JSON.stringify()` for the text block. It does not traverse, validate, measure or
truncate responses. There are no application deadlines or response byte budgets;
Node and MCP client/SDK transport behavior still applies. The caller's signal is
passed through to the provider and fetch.

Tool failures return `isError: true` and one JSON text block `{ code, message }`,
without successful structured content. Input validation rejects unsupported
parameters. The adapter reads only the error code and message; it does not traverse
exceptions or serialize stacks, causes, response headers or bodies. Non-Error
throws receive `UPSTREAM` with a generic message.

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
| `FEEDS_MCP_HTTP_HOST` | `127.0.0.1` | Listener address. |
| `FEEDS_MCP_HTTP_PORT` | `3000` | Port from 1 to 65535. |
| `FEEDS_MCP_HTTP_ALLOW_REMOTE` | unset | Must be `true` to bind outside loopback. |
| `FEEDS_MCP_HTTP_PUBLIC_URL` | local `/mcp` URL | Public HTTP(S) endpoint; also allows its Host header. |
| `FEEDS_MCP_HTTP_ALLOWED_ORIGINS` | loopback hostnames | Whitespace-separated trusted browser origin hostnames. |

Provider selection uses the shared [runtime configuration](ARCHITECTURE.md#runtime-configuration).

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

Tests cover input validation, unchanged response content,
in-memory tool discovery/calls, large unchanged responses, simple error messages,
caller cancellation, and real loopback HTTP.
See [packaging verification](PLUGIN.md#verification) for isolated bundle checks.
Automated MCP tests require no live upstream access.

A live ChatGPT account connection and deployed HTTPS/authentication endpoint are
not provisioned by this implementation. Verify actual MCP calls after configuring
that environment; a natural-language answer alone is not evidence of tool use.
