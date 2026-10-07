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

### Plugin channels

Stable **Feeds** connects to `https://feeds.mcp.edgestream.cloud/mcp`. Clients
discover OAuth only from that hosted MCP service's protected-resource metadata
and authorization challenges; plugin manifests contain neither credentials nor
an authorization configuration. **Feeds Dev** instead starts the bundled local
stdio process, `node ./dist/feeds-mcp.mjs`. Installing a local developer
marketplace package does not connect it to the hosted service.

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
| `FEEDS_MCP_HTTP_PUBLIC_URL` | local `/mcp` URL | Public HTTP(S) endpoint when OAuth is not configured; also allows its Host header. |
| `FEEDS_MCP_HTTP_ALLOWED_ORIGINS` | loopback hostnames | Whitespace-separated trusted browser origin hostnames. |
| `FEEDS_MCP_OAUTH_RESOURCE` | unset | Canonical protected HTTPS `/mcp` resource. Enables hosted token verification. |
| `FEEDS_MCP_OAUTH_ISSUER` | — | Canonical downstream OAuth adapter issuer; required with `FEEDS_MCP_OAUTH_RESOURCE`. |
| `FEEDS_MCP_INTROSPECTION_URL` | — | Cluster-private adapter verification endpoint; required with `FEEDS_MCP_OAUTH_RESOURCE`. |
| `FEEDS_MCP_INTROSPECTION_CLIENT_ID` | — | Private verifier client ID; required with `FEEDS_MCP_OAUTH_RESOURCE`. |
| `FEEDS_MCP_INTROSPECTION_CLIENT_SECRET` | — | Private verifier client secret; required with `FEEDS_MCP_OAUTH_RESOURCE`. |
| `FEEDS_HOSTED_UPSTREAM_TIMEOUT_MS` | `10000` | Hosted FxEmbed request deadline in milliseconds. |
| `FEEDS_HOSTED_MAX_REQUESTS_PER_PRINCIPAL` | unset | Optional hosted request budget for one verified principal. |
| `FEEDS_HOSTED_MAX_REQUESTS_GLOBAL` | unset | Optional process-wide hosted request budget. |
| `FEEDS_HOSTED_MAX_CONCURRENT_PER_PRINCIPAL` | unset | Optional hosted concurrent-request limit for one verified principal. |
| `FEEDS_HOSTED_MAX_CONCURRENT_GLOBAL` | unset | Optional process-wide hosted concurrent-request limit. |

Provider selection uses the shared [runtime configuration](ARCHITECTURE.md#runtime-configuration).

Requests validate Host and Origin before dispatch and do not trust forwarded or
identity headers. Both declared and chunked bodies are limited to 1 MiB. Headers
and incoming requests use bounded timeouts; disconnected clients abort active MCP
work. SIGINT/SIGTERM stop the listener, with a ten-second grace period before
closing active connections. HTTP operational errors do not log upstream content,
credentials, or stack traces.

Hosted FxEmbed retrieval accepts only the fixed X and Bluesky API origins,
rejects redirects, never forwards MCP credentials, and applies the configured
deadline. Optional positive budget values reserve work before connecting and
release concurrent reservations on completion, cancellation, and failure.
Rejected admission performs no upstream call. Successful JSON is read in full
and returned unchanged: Feeds has no response-size limit or truncation policy.

## Hosted authentication

Setting `FEEDS_MCP_OAUTH_RESOURCE` makes the HTTP MCP endpoint protected. It
must be the canonical HTTPS resource URL ending in `/mcp`; the configured resource
host is the accepted canonical Host. A non-loopback listener requires this
configuration as well as `FEEDS_MCP_HTTP_ALLOW_REMOTE=true`. The server publishes
RFC 9728 protected-resource metadata at both
`/.well-known/oauth-protected-resource` and
`/.well-known/oauth-protected-resource/mcp`, naming the exact resource, the
configured authorization issuer, and the sole supported scope, `feeds:read`.

The hosted `get_feed` tool requests `openid`, `offline_access`, and
`feeds:read` during authorization. Only `feeds:read` authorizes a Feeds call;
the OIDC scopes let a conforming client retain and renew its connection. A
connection created before those scopes were published must be reauthorized once
so the client can receive a refresh token. The adapter retains exact resource,
issuer, subject, expiry, and `feeds:read` checks for every renewed access token.

The only public MCP protocol calls are `initialize` and `tools/list`, so a client
can establish the connection and discover the authorization-aware tool schema.
`GET /health` and protected-resource metadata are also public. Every other MCP
request, including every `get_feed` call, requires a Bearer access token. Missing,
invalid, expired, revoked, wrong-resource, wrong-issuer, service, and ID tokens
receive a `401` OAuth challenge; a verified token without `feeds:read` receives
the standards-compatible `403 insufficient_scope` challenge. Verification uses the
private adapter endpoint with a five-second deadline and fails closed on errors.

The adapter accepts only an active token with one exact audience equal to the
configured resource, the configured issuer, a nonempty human subject, a future
expiry, and an access-token Bearer type when a type is reported. It stores no
identity and does not accept identity from MCP arguments, sessions, proxy headers,
or forwarded headers. Its immutable verified `(issuer, subject)` principal is
attached only to the current MCP request for future hosted request-budget work.
It is not a storage namespace or a quota implementation.

For remote ChatGPT use, expose `/mcp` over HTTPS with the configured OAuth adapter;
TLS, OAuth-adapter deployment and account setup remain external to this package.
The stable plugin manifest uses the hosted endpoint; the development manifests
launch stdio. CLI/stdio usage is unchanged and unauthenticated as local-process
use. See the official
[ChatGPT developer-mode guide](https://developers.openai.com/api/docs/guides/developer-mode)
for connection setup and actual tool-call verification.

## Verification and remaining deployment work

Tests cover input validation, unchanged response content, in-memory tool
discovery/calls, large unchanged responses, simple error messages, caller
cancellation, protected-resource metadata, OAuth rejection paths, and real
loopback HTTP. They prove denied requests do not invoke the configured provider.
See [packaging verification](PLUGIN.md#verification) for isolated bundle checks.
Automated MCP tests require no live upstream access.

A live ChatGPT account connection and deployed HTTPS/authentication endpoint are
not provisioned by this implementation. Verify actual MCP calls after configuring
that environment; a natural-language answer alone is not evidence of tool use.
