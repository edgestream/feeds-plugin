# CLI

```text
npx feeds show [--context] [--answers] [--all] [--cursor CURSOR] [--limit 1-100] <url>
npx feeds --help
```

Use inside the repository after `npm ci`. The executable points to committed
`dist/feeds-cli.mjs`; bare `npx feeds` outside this unpublished checkout does not
identify this project.

## Subjects and scope

The URL identifies a post or author profile; no separate timeline command exists.

```bash
npx feeds show 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --context 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --answers 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --context --answers 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show 'https://x.com/OpenAI' --limit 25
```

Options may precede or follow the URL. `--context` includes available ancestors;
`--answers` includes available replies to the focal post. Both require a post URL.
A profile URL reads the upstream author's timeline without local author/repost
filtering. `--limit` sets its requested page size (1–100, default 25); it is not an
aggregate result cap and is unsupported for post URLs.

`--cursor` continues an author timeline or answers page. Copy `nextCursor` from the
previous result and retain the same URL/scope. `--all` follows available cursors,
deduplicates posts, and stops when no cursor remains. It fails on repeated cursors
or after 100 pages requiring further continuation. No partial result is printed
on failure. A single post/context request has no pagination.

## Input and output

Supported HTTP/HTTPS hosts: `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`,
and `mobile.twitter.com`. Post paths are `/<handle>/status/<numeric-id>` or
`/i/web/status/<numeric-id>`, optionally ending in `/photo/<number>`,
`/video/<number>`, or a trailing slash. Profile paths are `/<handle>` with an
optional trailing slash. Handles contain 1–15 ASCII letters, digits, or underscores;
known navigation paths such as `/home` and `/search` are rejected. Query strings
and fragments are ignored. Credentials, nonstandard ports, other hosts, bare IDs,
bare handles, and internal Feeds URIs are rejected by the CLI. The
[MCP interface](MCP.md) additionally accepts internal URIs and bare references
when exactly one platform is configured.

The CLI prints `FeedPage { posts, nextCursor? }` as JSON, indented with two spaces
and a trailing newline. Each post has `ref`, optional reply `parent`, and unchanged
upstream post `data`. This replaces the V1 raw response envelope. Parent posts may
be absent from a page. Neither missing parents nor absent continuation prove a
complete view of X. See architecture for ordering and JSON precision semantics.

Diagnostics use `CODE: message` on stderr. Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success or help |
| 1 | Configuration, upstream, rate limit, missing subject, timeout, or response error |
| 2 | Invalid command, URL, or unsupported query options |
| 130 | Cancelled through SIGINT |

## Configuration

`FEEDS_X_PROVIDER` selects the X provider, defaulting to `fxtwitter` when absent.
Empty/unknown values are configuration errors. Runtime configuration is shared
with MCP. No configurable API root, credentials, cache, fallback, or retries.
