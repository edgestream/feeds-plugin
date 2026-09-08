# Plugin packaging

Feeds follows Recipes with two manifest pairs for one read-only MCP service:

| Target | Files | Contract |
| --- | --- | --- |
| Portable agent plugin | `plugin.json`, `mcp.json` | [Agent Plugin Specification 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) |
| Codex | `.codex-plugin/plugin.json`, `.mcp.json` | [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins) |

The portable manifests declare matching 1.0.0 schemas. `plugin.json` carries
metadata; `mcp.json` carries `mcpServers`. The Codex manifest references
`./.mcp.json` and adds install-surface metadata: Feeds Dev, Edgestream,
`Communications`, capability `Read`, and prompts for feeds, context and replies.
The package identity is `feeds-dev`, version 0.1.0. Repository and plugin folder
names need not match; installed plugin identity comes from the manifest.

Both configurations start `node ./dist/feeds-mcp.mjs`. They omit `cwd` and rely on
the plugin host starting in the installed plugin root, as in Recipes. No
undocumented plugin-root placeholder, `tsx`, or `node_modules` is required.
`FEEDS_X_PROVIDER` is intentionally omitted so shared runtime defaults apply. No
persistent data or `${PLUGIN_DATA}` setting is required. HTTP is a separate
entry point documented in [MCP.md](MCP.md).

Keep identity, version, descriptions, author, repository, keywords, and shared
launch settings synchronized. Packaging tests enforce this and start the bundles
from an isolated installation directory. Rebuild all committed bundles when
runtime sources or dependencies change. Validate manifests and run:

```bash
npm run build
npm run check
npm test
git diff --check
```

These files prepare installation; they do not publish a marketplace entry, deploy
a remote server, or install the plugin into a user's account.
