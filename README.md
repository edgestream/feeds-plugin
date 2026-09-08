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
another MCP client. Sources include public URLs and short resource URIs such as
`feeds://x/MayoOhnePommes` and `feeds://x/123456`.

```bash
node ./dist/feeds-mcp.mjs       # Local stdio plugin
node ./dist/feeds-mcp-http.mjs  # HTTP at http://127.0.0.1:3000/mcp
```

Node.js 24 or later is required. See [MCP setup and interface](docs/MCP.md) for
remote ChatGPT connection and [plugin packaging](docs/PLUGIN.md) for installation
metadata.

## Development

```bash
npm ci
npm run build
npm run check
npm test
```

See [AGENTS.md](AGENTS.md) for repository guidance and architecture references.
