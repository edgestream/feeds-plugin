---
name: read-feeds
description: Read public X and Bluesky posts, context, replies, and author feeds through the Feeds app.
---

Use this plugin's `get_feed` tool when the user asks to read, show, summarize, or
explain a public `https://x.com` or `https://bsky.app` post or author feed.
Discover the tool if needed. Pass the original URL unchanged as `source`; do not
rewrite an unsupported URL to bypass the tool's validation.

For a plain post or author feed, use `get_feed({source: originalUrl})`.
For requested post context, add `context: true`. For requested post replies, add
`answers: true`. For replies written by an author, use the profile URL with
`answers: true`; the result is an author timeline that includes authored replies,
not a replies-only collection. Profiles do not support `context: true`.

For continuation, pass the prior response's `cursor.bottom` as `cursor` while
keeping the same source and options. Make only the requested bounded calls; do
not automatically exhaust pages or claim complete historical coverage. Query
strings and fragments on the source URL do not set tool options.

Return the requested information with source attribution and state tool errors
accurately. Respect an explicit choice of another tool. A URL quoted only for
editing does not request retrieval. Never claim to have read private content.
