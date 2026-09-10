# CLI

```text
npx feeds show [--context] [--answers] [--cursor <cursor>] <url>
npx feeds --help
```

Use inside the repository after `npm ci`. The executable points to committed
`dist/feeds-cli.mjs`; bare `npx feeds` outside this unpublished checkout does not
identify this project.

## URLs and options

The URL identifies a post or author profile; no separate timeline command exists.

```bash
npx feeds show 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --context 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --answers 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --context --answers 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show 'https://x.com/OpenAI'
```

Options may precede or follow the URL. `--context` requests context for a post.
`--answers` requests replies to a post or includes replies written by an author
in that author's feed. These options request available content, not complete
coverage or a replies-only result. Providers validate supported combinations;
see the [provider documentation](../packages/provider-fxtwitter/README.md) for
endpoint mappings and restrictions.
Use `--cursor` with `--answers` and the same post URL to continue a conversation:

```bash
npx feeds show --answers --cursor '<cursor.bottom>' 'https://x.com/OpenAI/status/2082577277246972300'
```

Copy the nonempty `cursor.bottom` value from the previous JSON response unchanged.
For an author feed, retain the same `--answers` setting as the first page:

```bash
npx feeds show --cursor '<cursor.bottom>' 'https://x.com/OpenAI'
npx feeds show --answers --cursor '<cursor.bottom>' 'https://x.com/OpenAI'
```

Each invocation makes one request. Context-only post cursors are rejected;
source URL query strings cannot substitute for `--cursor`. A cursorless call
refreshes the first page. There are no `--all` or `--limit` options.

## Input and output

Supported HTTP/HTTPS hosts: `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`,
and `mobile.twitter.com`. Post paths are `/<handle>/status/<numeric-id>` or
`/i/web/status/<numeric-id>`, optionally ending in `/photo/<number>`,
`/video/<number>`, or a trailing slash. Profile paths are `/<handle>` with an
optional trailing slash. Handles contain 1–15 ASCII letters, digits, or underscores;
known navigation paths such as `/home` and `/search` are rejected. Query strings
and fragments are ignored. Credentials, nonstandard ports, other hosts, bare IDs,
bare handles, and internal Feeds URIs are rejected. The [MCP interface](MCP.md)
accepts the same public URLs.

The CLI prints the provider result, indented with two spaces and a trailing
newline, without adding a wrapper. See the shared
[response semantics](PROVIDER.md#response-semantics) for preservation and coverage.

Diagnostics use `CODE: message` on stderr. Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success or help |
| 1 | Configuration, upstream, rate limit, missing subject, or response error |
| 2 | Invalid command, URL, or unsupported query options |
| 130 | Cancelled through SIGINT |

## Configuration

Provider selection uses the shared
[runtime configuration](ARCHITECTURE.md#runtime-configuration).
