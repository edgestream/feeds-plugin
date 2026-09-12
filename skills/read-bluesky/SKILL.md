---
name: read-bluesky
description: Use Feeds when asked to read, show, summarize, or explain a https://bsky.app URL.
---

Use the installed Feeds plugin's `get_feed` before generic web retrieval.
Discover the tool if needed. For plain post/profile retrieval, call
`get_feed({source: originalUrl})` with the unchanged URL.
For post context, set `context: true`; for replies to a post, set `answers: true`.
When explicitly asked for replies written by an author, use that profile URL
with `answers: true`. This returns the timeline including authored replies,
not all replies received from other users or a replies-only collection.
For continuation, pass the previous response's `cursor.bottom` as `cursor`,
retaining the same source and options. Do not automatically fetch every page or
claim complete historical coverage. Profiles do not support `context: true`.
Feeds validates URLs; source query strings and fragments do not set tool options.
Return the requested content with its source, or report the tool's failure.
Respect explicit user tool choices; URLs merely quoted for editing do not request retrieval.
