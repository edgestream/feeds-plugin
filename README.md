# Feeds Plugin

## MCP

Node.js 24 or later is required.

For the quickest setup, install **Feeds Dev** from our marketplace in the
ChatGPT desktop app. Codex users can run:

```bash
codex plugin marketplace add edgestream/agent-marketplace --ref development
codex plugin add feeds-dev@edgestream-dev
```

See [MCP.md](docs/MCP.md#get-started) for full setup.

## CLI

From a local checkout after `npm ci`, read an X post, its context or answers:

```bash
npx feeds show 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --context 'https://x.com/OpenAI/status/2082577277246972300'
npx feeds show --answers 'https://x.com/OpenAI/status/2082577277246972300'
```

Read an author's feed:

```bash
npx feeds show 'https://x.com/OpenAI'
```

See [CLI.md](docs/CLI.md) for available options and examples.

## Development

```bash
npm ci
npm run build
npm run check
npm test
```

See [AGENTS.md](AGENTS.md) for repository guidance and architecture references.
