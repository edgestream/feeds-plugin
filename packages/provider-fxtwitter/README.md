# FxTwitter provider

Implements `FeedProvider` for platform `x`, provider ID `fxtwitter`. This is a
third-party API, not the official X Developer API.

## Requests and mapping

All GET requests use fixed `https://api.fxtwitter.com/2/` endpoints:

| Subject/scope | Endpoint |
| --- | --- |
| Post | `status/{id}` |
| Post with ancestors | `thread/{id}` |
| Post with replies, optionally ancestors | `conversation/{id}` |
| Author | `profile/{handle}/statuses` |

A query uses one endpoint, including combined context/answers. Author pages set
`count` (default 25); author/conversation pages pass `cursor` through URLSearchParams.
Conversation ordering uses the upstream default. Post limits and author scope flags
are rejected. Cursor is supported only for author/conversation requests.

V2 `status`, `thread`, `replies`, and `results` become flat posts; grouped timeline
`statuses` are flattened. `id` identifies each post and `replying_to.status`
identifies its parent. Unknown post fields remain in `data`; quote/media/source
URLs are never fetched. Available ancestors are selected by parent references;
replies are restricted to the focal post's descendants. Reply-page entries with
missing parents are retained because preceding pages may contain those parents.
This cannot independently verify their entire ancestry. Duplicates are merged by
ID. Identifiable tombstones remain as data; focal tombstones can use the requested
ID. Unidentifiable entries are invalid responses.

The mapping follows the [upstream OpenAPI specification](https://github.com/FxEmbed/FxEmbed/blob/main/docs/specs/fxtwitter-openapi.json).
Pagination uses `cursor.bottom`. No extra request is needed to combine scopes.
An empty `results` response yields zero posts, including the upstream 404 empty
 timeline response (which cannot distinguish an empty timeline from an unknown
user). No local date, author, reply, or repost filtering is applied to timelines.

## Transport and errors

Requests set `Accept: application/json` and a read-only Feeds User-Agent. Endpoints
are built from validated numeric IDs or handles. Redirects are rejected. Timeout
is 20 seconds per request, covering headers and body; response size is limited to
5 MiB, checking declared and streamed bytes. Fetch and limits are injectable.
Caller cancellation aborts HTTP and reports `CANCELLED`.

HTTP 404 maps to `NOT_FOUND` except validated empty author pages; 429 maps to
`RATE_LIMITED`; other unsuccessful statuses/network failures map to `UPSTREAM`.
Application-level error codes are also checked. Invalid JSON, UTF-8, feed structure,
IDs, parent references, cursors, and oversized bodies map to `INVALID_RESPONSE`.
Timeout maps to `TIMEOUT`. Missing focal posts map to `NOT_FOUND`.

These codes supplement the original diagnostic evidence. Exceptions retain their
causes; failures include the requested endpoint and available HTTP status, status
text, headers and body, including 404/429/500 bodies. Body capture uses the same
5-MiB bound: oversized declared bodies are explicitly omitted, oversized streamed
bodies retain a marked prefix, and interrupted reads retain received bytes.
Invalid UTF-8 is preserved as base64. Mapping failures also retain response details.
Timeout/cancellation preserve the underlying exception and abort reason. The
validated empty-author 404 compatibility behavior above remains unchanged.
MCP exposes this development evidence, including stacks and potentially sensitive
response content and local paths, without a debug flag; its serialization limits
and explicit omission markers are documented in [MCP.md](../../docs/MCP.md).

## Limits

Availability, context depth, reply coverage, and cursor behavior are controlled by
fxTwitter. No completeness guarantee is made, including after cursor exhaustion.
There is no authentication, caching, retry, fallback, or media downloading.
Automated verification uses injected responses and does not establish live API
availability. See the architecture document for all-page traversal bounds.
