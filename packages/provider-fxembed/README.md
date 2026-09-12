# FxEmbed provider

The FxEmbed provider exposes `FxTwitterProvider` for X and `FxBlueskyProvider`
for Bluesky. Both use provider ID `fxembed`, implement the shared
[`FeedProvider` contract](../../docs/PROVIDER.md), and return the complete
upstream JSON response unchanged.

## X

`FxTwitterProvider` requests `https://api.fxtwitter.com/2/`.

| URL/options | Endpoint |
| --- | --- |
| Post | `status/{id}` |
| Post with `context` | `thread/{id}` |
| Post with `answers`, optionally `context` | `conversation/{id}` |
| Author profile | `profile/{handle}/statuses` |
| Author profile with `answers` | `profile/{handle}/statuses?with_replies=1` |

Post `answers` takes precedence over `context`; profiles reject `context`.
Profiles with `answers` include replies written by the author, rather than only
replies. A nonempty `cursor` is supported for profiles and answer conversations.
See the [FxEmbed X API](https://docs.fxembed.com/api/twitter/).

## Bluesky

`FxBlueskyProvider` requests `https://api.fxbsky.app/2/`.

| URL/options | Endpoint |
| --- | --- |
| Post | `status/{actor}/{rkey}` |
| Post with `context` | `thread/{actor}/{rkey}` |
| Post with `answers`, optionally `context` | `conversation/{actor}/{rkey}` |
| Author profile | `profile/{actor}/statuses` |
| Author profile with `answers` | `profile/{actor}/statuses?with_replies=1` |

The option and cursor rules match X. Handles are lowercased; DIDs and record
keys retain their case. See the [FxEmbed Bluesky API](https://docs.fxembed.com/api/bluesky/).

## Upstream limitations

FxEmbed controls availability, coverage, and response shape. X answer-conversation
continuation can return HTTP 404 when the cursor from a successful first page is
used; this is an upstream issue ([#2087](https://github.com/FxEmbed/FxEmbed/issues/2087)).
Profiles and Bluesky continuation are unaffected by that X-specific failure.
