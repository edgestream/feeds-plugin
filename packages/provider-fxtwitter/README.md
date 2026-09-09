# FxTwitter provider

Implements `FeedProvider` for platform `x`, provider ID `fxtwitter`. This is a
third-party API, not the official X Developer API.

## Requests and responses

Each call makes one GET request to a fixed `https://api.fxtwitter.com/2/` endpoint:

| URL/options | Endpoint |
| --- | --- |
| Post | `status/{id}` |
| Post with `context` | `thread/{id}` |
| Post with `answers`, optionally `context` | `conversation/{id}` |
| Author profile | `profile/{handle}/statuses` |

`answers` takes precedence over `context`; both flags are rejected for profiles.
Author handles are lowercased when building endpoints. Source query strings and
fragments are ignored; no count, cursor or ordering parameters are added.
The upstream defaults determine the returned scope and amount of data.

Successful responses return the complete parsed JSON object. Envelopes, thread
groups, duplicate entries, tombstones, unknown fields and upstream cursors remain
untouched. There is no post/parent validation, local filtering, deduplication,
body-level status-code interpretation or automatic continuation. Quote, media and
source URLs in the response are never fetched.

## Transport and errors

Requests set `Accept: application/json` and a read-only Feeds User-Agent. Endpoints
are built from validated public X URLs containing numeric post IDs or author
handles. Redirects are rejected. Timeout is 20 seconds per request, covering
headers and body; response size is limited to 5 MiB, checking declared and streamed
bytes. Fetch and limits are injectable. Caller cancellation aborts HTTP and reports
`CANCELLED`.

HTTP 404 maps to `NOT_FOUND`, including empty timeline 404 responses; 429 maps to
`RATE_LIMITED`; other unsuccessful statuses/network failures map to `UPSTREAM`.
Invalid JSON, invalid UTF-8, non-object JSON, and oversized bodies map to
`INVALID_RESPONSE`. Timeout maps to `TIMEOUT`. An HTTP-success body is returned as
received even if it contains an application-level error code or no posts.

Exceptions retain their causes; failures include the requested endpoint and
available HTTP status, status text, headers and body, including 404/429/500 bodies.
Body capture uses the same 5-MiB bound: oversized declared bodies are explicitly
omitted, oversized streamed bodies retain a marked prefix, and interrupted reads
retain received bytes. Invalid UTF-8 is preserved as base64. Timeout/cancellation
preserve the underlying exception and abort reason. MCP exposes this development
evidence without a debug flag; see [MCP.md](../../docs/MCP.md).

## Limits

Availability and coverage are controlled by fxTwitter. No completeness guarantee
is made. There is no authentication, caching, retry, fallback, media downloading,
or pagination interface. Automated verification uses injected responses and does
not establish live API availability.
