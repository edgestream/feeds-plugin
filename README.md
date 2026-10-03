# Feeds Plugin

*Social media feeds for agents.*

This plugin lets agents read public posts, conversation context, replies, and author
feeds from X and Bluesky. Use it as a plugin in ChatGPT or Codex, connect it to other agents over
MCP, or run it from the command line.

## Plugin

The stable desktop identity is `feeds` / **Feeds** and connects to the hosted
MCP service. ChatGPT Web uses the separate technical identity `feeds-web`, also
displayed as **Feeds**, and references the same registered app without declaring
another MCP server.
Development uses `feeds-dev` / **Feeds Dev** and starts the bundled local stdio
MCP server. The development channel does not reference the hosted app; a local
developer-marketplace installation does not provide access to the hosted service.

See the [marketplace installation guide](https://github.com/edgestream/agent-marketplace#installation)
for installation, channel selection, and updates.

## CLI

The CLI requires *Node.js 24* or later. From the repository root of a local
checkout, install the dependencies:

```bash
npm ci
```

Run the following commands from the same directory. These examples use X and Bluesky:

```bash
# Read a post.
npx feeds show 'https://x.com/OpenAI/status/2082577277246972300'

# Read its available conversation context.
npx feeds show --context 'https://x.com/OpenAI/status/2082577277246972300'

# Read its available replies.
npx feeds show --answers 'https://x.com/OpenAI/status/2082577277246972300'

# Read an author's feed.
npx feeds show 'https://x.com/OpenAI'

# Read a Bluesky author's feed.
npx feeds show 'https://bsky.app/profile/bsky.app'
```

Results are returned as JSON. See the [CLI guide](docs/CLI.md) for supported URLs,
options, and pagination.

## Development

After installing the dependencies with `npm ci`, build and verify the project:

```bash
npm run build
npm run check
npm test
```

See [AGENTS.md](AGENTS.md) for contribution guidance, architecture, and instructions
for adding platforms and providers.
