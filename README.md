# Feeds Plugin

*Social media feeds for agents.*

Feeds lets agents read public posts, conversation context, replies, and author
feeds from X and Bluesky. Use it as a plugin in ChatGPT or Codex, connect it to other agents over
MCP, or run it from the command line.

## Plugin

Install the release version from the Edgestream marketplace with Codex CLI:

```bash
codex plugin marketplace add edgestream/agent-marketplace
codex plugin add feeds@edgestream
```

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
