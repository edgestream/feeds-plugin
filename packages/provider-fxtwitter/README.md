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
handles. Redirects are rejected. Fetch is injectable. The caller's abort signal
is forwarded directly to fetch; caller cancellation reports `CANCELLED`.

Successful responses use the built-in `Response.json()` method. There are no
provider timeouts, response byte limits, stream readers, chunk buffers, response
header iteration, body capture, UTF-8 handling or response validation. Native JSON
parsing determines decoding and syntax behavior; the returned value is not inspected.

HTTP 404 maps to `NOT_FOUND`, including empty timeline 404 responses; 429 maps to
`RATE_LIMITED`; other unsuccessful statuses/network failures map to `UPSTREAM`.
HTTP-error bodies are not read. Native JSON syntax errors map to `INVALID_RESPONSE`.
An HTTP-success body is returned even if it contains an application-level error code
or no posts. Exceptions retain their original cause internally; MCP reports only
the error code and message, without recursive diagnostics or body serialization.

## Limits

Availability and coverage are controlled by fxTwitter. No completeness guarantee
is made. There is no authentication, caching, retry, fallback, media downloading,
or pagination interface. Automated verification uses injected responses and does
not establish live API availability.
