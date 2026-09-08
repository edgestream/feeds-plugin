# CLI

```text
npx feeds show <post-url>
npx feeds --help
```

Use these commands inside the repository after `npm ci`. The root manifest's
`feeds` executable points to `dist/feeds-cli.mjs`. Outside the checkout, the bare
`npx feeds` command does not identify this unpublished project.

## Input and output

`show` accepts HTTP or HTTPS post URLs on `x.com`, `www.x.com`, `twitter.com`,
`www.twitter.com`, and `mobile.twitter.com`. Supported paths are
`/<handle>/status/<numeric-id>` and `/i/web/status/<numeric-id>`, optionally with
a trailing slash or `/photo/<number>` or `/video/<number>` suffix. Query strings
and fragments are ignored. Credentials, nonstandard ports, other hosts, and other
path shapes are rejected. Bare IDs and internal Feeds URIs are not supported.

The CLI prints the entire upstream JSON object, indented with two spaces and a
trailing newline. It adds no metadata and does not filter or rename fields.
Provider changes may change that object's shape. See the architecture document
for JavaScript JSON precision limits.

Diagnostics use `CODE: message` on stderr. Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success or help |
| 1 | Configuration, upstream, rate limit, missing post, timeout, or response error |
| 2 | Invalid command or post URL |
| 130 | Cancelled through SIGINT |

## Configuration

`FEEDS_X_PROVIDER` selects the X provider and defaults to `fxtwitter` when absent.
An empty or unknown value is a configuration error. Runtime configuration is
shared with the future MCP frontend. V1 has no configurable API root, credentials,
cache, fallback, or automatic retries.
