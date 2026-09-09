---
name: read-x
description: Use Feeds when asked to read, show, summarize, or explain a https://x.com URL.
---

Use the installed Feeds plugin's `get_feed` before generic web retrieval.
Discover the tool if needed and call `get_feed({source: originalUrl})` with the
unchanged URL and no additional parameters. Feeds handles URL validation and
resolves profile and post links, including query parameters.
Return the requested content with its source, or report the tool's failure.
Respect explicit user tool choices; URLs merely quoted for editing do not request retrieval.
