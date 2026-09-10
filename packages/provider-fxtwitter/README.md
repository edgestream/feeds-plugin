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
| Author profile with `answers` | `profile/{handle}/statuses?with_replies=1` |

For posts, `answers` takes precedence over `context`. Profiles reject `context: true`
regardless of `answers`. Profile `answers: true` includes replies written by the
author in the timeline; it does not filter to replies only or retrieve all
replies received from others. Omitted/false `answers` keeps the default timeline.
Author handles are lowercased when building endpoints. Source query strings and
fragments are ignored; no count or ordering parameters are added. An explicit
nonempty `cursor` option accepts a profile or a post with `answers: true` and is
encoded with `URLSearchParams` as the selected author-statuses or conversation
endpoint's `cursor` query parameter, retaining `with_replies=1` for profile answers. Other
endpoint/cursor combinations are rejected before HTTP. The token is not decoded
or otherwise interpreted. See the [conversation API documentation](https://docs.fxembed.com/api/twitter/operations/2conversationid/).
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
or automatic pagination. Manual author-feed and conversation continuation uses the previous
response's `cursor.bottom` with the same source and options, including the profile
`answers` value. Profiles require `context` to be omitted or false. Automated verification uses injected responses and does
not establish live API availability.

### Confirmed live author-replies continuation (2026-09-10)

The rebuilt CLI retrieved `https://x.com/MayoOhnePommes` with `--answers`, then
continued with the returned `cursor.bottom` and the same option. Both responses
had code 200, with 27 and 28 result entries respectively and nonempty bottom
cursors. This confirms two live profile pages with `with_replies=1`, not complete
historical coverage or a count of distinct authored replies. Automated tests
separately verify the exact endpoint, query parameters, and unchanged payloads.

### Confirmed live continuation failure (2026-09-10)

Live requests for post `2082577277246972300` returned HTTP 200 with 35 replies
and a nonempty bottom cursor. Immediately passing that cursor directly to
`/2/conversation/{id}?cursor=...` returned HTTP 404, as did the CLI with the
same token. Explicit `ranking_mode=likes` (35 replies) and `recency` (31 replies)
each reproduced the first-page success / second-page failure with their own
fresh cursors. A second post, `2082577278450676080`, returned 17 replies and a
cursor, then the same 404 on continuation. The HTTP-error body was:

```json
{"status":null,"thread":null,"replies":null,"author":null,"cursor":null,"code":404}
```

This establishes a live upstream failure independent of CLI cursor handling;
it does not establish exhaustion. Injected pagination tests verify request
forwarding and response preservation, not working live continuation.

The inspected [upstream implementation](https://github.com/FxEmbed/FxEmbed/blob/9e71a25114b9d8d00c3381d4e797e94b357f001c/packages/atmosphere/src/providers/twitter/conversation.ts#L1341)
passes the cursor to its GraphQL requests but requires the focal post in
`bucket.chainTweets` even on continuation pages. A missing focal post returns
the null-filled 404 above before replies are returned. This is a plausible cause,
not confirmed: the deployed revision and underlying X GraphQL response were not
available, and other branches return the same body. No automatic retry, fallback,
or conversion of this error to an empty successful page is implemented.

Further investigation found the existing open [FxEmbed issue #2087](https://github.com/FxEmbed/FxEmbed/issues/2087),
reported on 2026-05-18 with the same first-page success and null-filled continuation
404. A maintainer acknowledged that the documented request should work. A fresh
check of post `2097786616311840853` also returned 34 replies and a bottom cursor,
then HTTP 404 when that cursor was passed immediately.

The [upstream route](https://github.com/FxEmbed/FxEmbed/blob/9e71a25114b9d8d00c3381d4e797e94b357f001c/src/realms/api/routes/twitter.ts#L147)
reads `query.cursor` and passes it into `constructTwitterConversation`.
`fetchTweetDetail` forwards it to both eligible GraphQL methods. The response
processor separates chain tweets from reply modules, but the constructor rejects
any page without a matching focal chain tweet before building replies or exposing
the next cursor. The public HTTP response cannot distinguish this branch from
missing GraphQL instructions or other upstream failures. Confirming the exact
live branch requires instrumentation of the deployed FxEmbed service and its
GraphQL response; changing cursor encoding in this plugin does not address that
uncertainty.

As a control, author-statuses pagination succeeded across three CLI calls with
58 distinct post IDs. Articles pagination returned HTTP 200 across three direct
calls but no entries. The confirmed conversation limitation therefore does not
justify disabling cursor forwarding generally. Status and thread endpoints still
reject cursor options before any HTTP request.
