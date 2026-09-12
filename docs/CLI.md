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
see the [provider documentation](../packages/provider-fxembed/README.md) for
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

Supported X HTTP/HTTPS hosts: `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`,
and `mobile.twitter.com`. Post paths are `/<handle>/status/<numeric-id>` or
`/i/web/status/<numeric-id>`, optionally ending in `/photo/<number>`,
`/video/<number>`, or a trailing slash. Profile paths are `/<handle>` with an
optional trailing slash. Handles contain 1–15 ASCII letters, digits, or underscores;
known navigation paths such as `/home` and `/search` are rejected. Query strings
and fragments are ignored. Credentials, nonstandard ports, other hosts, bare IDs,
bare handles, and internal plugin URIs are rejected. The [MCP interface](MCP.md)
accepts the same public URLs. Bluesky forms are listed [below](#bluesky-urls).

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

## Bluesky URLs

Use the same command/options with `http://bsky.app` or `https://bsky.app`:

```bash
npx feeds show 'https://bsky.app/profile/bsky.app'
npx feeds show --answers 'https://bsky.app/profile/bsky.app'
npx feeds show 'https://bsky.app/profile/bsky.app/post/3l6xyz'
npx feeds show --context 'https://bsky.app/profile/bsky.app/post/3l6xyz'
npx feeds show --answers --cursor '<cursor.bottom>' 'https://bsky.app/profile/bsky.app/post/3l6xyz'
npx feeds show --answers --cursor '<cursor.bottom>' 'https://bsky.app/profile/bsky.app'
```

The post key above illustrates syntax; it is not a guaranteed live post.
Paths are `/profile/<actor>` or `/profile/<actor>/post/<rkey>`, optionally with a
trailing slash. Actors accept ASCII domain handles (2 or more labels, at most 253
characters, labels of 1–63 letters/digits/hyphens, no leading/trailing hyphen,
final label beginning with a letter), `did:plc:` plus 24 lowercase base32
characters (`a-z2-7`), or `did:web:` plus a domain with the same syntax as handles.
DID paths/ports and other DID methods are unsupported. Punycode handles are
accepted; Unicode and percent-encoded actor input are unsupported. Handles are
lowercased, while DID and record-key case is preserved.

Record keys contain 1–512 ASCII letters, digits, `.`, `-`, `_`, `:`, or `~`, excluding
`.` and `..`. URL parsing follows standard WHATWG URL normalization before path
validation. Query strings/fragments are ignored. Credentials, nonstandard ports,
other hosts (including `www.bsky.app`), encoded path separators, post media
suffixes, custom feed URLs, bare actors, and `at://` URIs are unsupported.
These rules follow the [handle](https://atproto.com/specs/handle),
[DID](https://atproto.com/specs/did), and [record-key](https://atproto.com/specs/record-key)
syntax relevant to public Bluesky URLs; they do not verify that an account exists.

Context, replies, and explicit continuation have the same invocation rules as X.
See the [Bluesky provider details](../packages/provider-fxembed/README.md#bluesky)
for endpoint mapping and upstream coverage limitations.
