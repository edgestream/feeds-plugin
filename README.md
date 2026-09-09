# Feeds Plugin

Read social media feeds.

## CLI

Read an X post, its context or answers:

```bash
npx feeds show 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --context 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --answers 'https://x.com/OpenAI/status/2082577277246972300'
```

Read an authors feed:

```bash
npx feeds show 'https://x.com/OpenAI'
```

## MCP

Use `get_feed` to read posts, context, replies or author feeds from ChatGPT or
another MCP client. Sources include public URLs, resource URIs such as
`feeds://x/OpenAI`, and bare X handles (`OpenAI`) or post IDs (`123456`) when only
X is configured. Start with one page; use `all` only for explicitly requested full
traversal and continue individual pages using `nextCursor`.

```bash
node ./dist/feeds-mcp.mjs       # Local stdio plugin
node ./dist/feeds-mcp-http.mjs  # HTTP at http://127.0.0.1:3000/mcp
```

Node.js 24 or later is required. See [MCP setup and interface](docs/MCP.md) for
remote ChatGPT connection and [plugin packaging](docs/PLUGIN.md) for installation
metadata. Development failures expose detailed upstream diagnostics and stack
traces to MCP clients; see the [error contract](docs/MCP.md#bounds-cancellation-errors).

## Development

```bash
npm ci
npm run build
npm run check
npm test
```

See [AGENTS.md](AGENTS.md) for repository guidance and architecture references.
