# Feeds Plugin

<p align="left"><em>Read social media feeds.</em></p>

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

`feeds` is a [ChatGPT plugin](https://developers.openai.com/plugins),
[MCP server](https://modelcontextprotocol.io/docs/2026-07-28/learn/server-concepts)
and stand-alone command-line interface to bring social media feeds to your agents.

## Plugin

`feeds` follows the [Agent Plugins Specification](https://agent-plugins.org/specification)
compatible with various clients like [ChatGPT Desktop App](https://learn.chatgpt.com/docs/app)
and [codex](https://chatgpt.com/codex/).

```bash
codex plugin marketplace add edgestream/agent-marketplace --ref development
codex plugin add feeds-dev@edgestream-dev
```

## MCP

See [MCP.md](docs/MCP.md#get-started) for full setup.

## CLI

From a local checkout read an X post, its context or answers:

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
