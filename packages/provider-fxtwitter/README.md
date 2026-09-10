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

Responses follow the shared [provider contract](../../docs/PROVIDER.md#response-semantics).
fxTwitter may include thread groups, tombstones, and body-level error codes;
consumers interpret these upstream fields themselves.

## Transport and errors

Requests set `Accept: application/json` and a read-only Feeds User-Agent. Endpoints
are built from validated public X URLs containing numeric post IDs or author
handles. Redirects are rejected. Cancellation reports `CANCELLED`; transport injection, parsing, and signal handling
follow the [shared requirements](../../docs/PROVIDER.md#requirements).

HTTP 404 maps to `NOT_FOUND`, including empty timeline 404 responses; 429 maps to
`RATE_LIMITED`; other unsuccessful statuses/network failures map to `UPSTREAM`.
Native JSON syntax errors map to `INVALID_RESPONSE`. See [MCP error formatting](../../docs/MCP.md#response-handling-cancellation-errors)
and [CLI diagnostics](../../docs/CLI.md#input-and-output) for interface presentation.

## Limits

Availability and coverage are controlled by fxTwitter; no completeness guarantee
is made. The provider has no authentication or cache. To continue an author feed
or conversation, pass the previous response's nonempty `cursor.bottom` unchanged
with the same source and options. A missing cursor does not prove exhaustion.
Automated tests use injected responses and do not establish live availability.
The dated observations below record the verified scope and remaining upstream gap.

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

The investigation found [FxEmbed issue #2087](https://github.com/FxEmbed/FxEmbed/issues/2087),
reported on 2026-05-18 with the same failure and acknowledged by a maintainer.
A further check of post `2097786616311840853` returned 34 replies and a bottom
cursor, then the same HTTP 404 on continuation.

In the inspected revision, the [upstream route](https://github.com/FxEmbed/FxEmbed/blob/9e71a25114b9d8d00c3381d4e797e94b357f001c/src/realms/api/routes/twitter.ts#L147)
forwards the cursor, while the [conversation constructor](https://github.com/FxEmbed/FxEmbed/blob/9e71a25114b9d8d00c3381d4e797e94b357f001c/packages/atmosphere/src/providers/twitter/conversation.ts#L1341)
requires the focal post in `bucket.chainTweets`, including on continuation pages.
A missing focal post can produce this 404. This is a plausible cause, not a
confirmed live diagnosis: the deployed revision and GraphQL response were not
available, and other branches produce the same body. Confirmation requires
instrumenting the deployed service; changing plugin cursor encoding does not
resolve that uncertainty.

As a control, author-statuses pagination succeeded across three CLI calls with
58 distinct post IDs. Articles pagination returned HTTP 200 across three direct
calls but no entries. The conversation failure does not justify disabling cursor
forwarding generally or converting errors into empty successful pages.
