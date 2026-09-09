# Feeds Plugin

Read social media feeds and return the complete upstream JSON response.

## MCP

For the quickest setup, install **Feeds Dev** from our marketplace in the
ChatGPT desktop app. Codex users can run:

```bash
codex plugin marketplace add edgestream/agent-marketplace --ref development
codex plugin add feeds-dev@edgestream-dev
```

Node.js 24 or later is required. See [MCP.md](docs/MCP.md#get-started) for
full setup and a local checkout MCP alternative.

## CLI

Read an X post, its context or answers:

```bash
npx feeds show 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --context 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --answers 'https://x.com/OpenAI/status/2082577277246972300'
```

Read an author's feed:

```bash
npx feeds show 'https://x.com/OpenAI'
```

## Development

```bash
npm ci
npm run build
npm run check
npm test
```

See [AGENTS.md](AGENTS.md) for repository guidance and architecture references.
