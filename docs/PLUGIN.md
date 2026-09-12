# Plugin packaging

This plugin packages one read-only MCP service using two manifest pairs:

| Target | Files | Contract |
| --- | --- | --- |
| Portable agent plugin | `plugin.json`, `mcp.json` | [Agent Plugin Specification 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) |
| Codex | `.codex-plugin/plugin.json`, `.mcp.json` | [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins) |

The portable manifests declare matching 1.0.0 schemas. `plugin.json` carries
metadata and the OpenAI-specific `extensions.com.openai.interface` presentation
metadata; `mcp.json` carries `mcpServers`. The Codex manifest references
`./.mcp.json` and adds install-surface metadata: a channel-specific display name,
author, `Communications`, capability `Read`, and prompts for feeds, context and replies.
Both metadata surfaces reference the same local square logo and composer icon at
`./assets/feeds-people-waves-128.png`. The asset is kept below 10 kB and
is copied with the plugin; paths resolve from the installed plugin root. The
portable manifest's OpenAI extension follows the [official plugin packaging
specification](https://developers.openai.com/plugins/build/plugins), and the
asset constraints follow the [official submission error reference](https://developers.openai.com/plugins/deploy/submission-errors#image-errors).
Both manifests use the root package version and the channel identity listed in
[README.md](../README.md#plugin), following [the release procedure](RELEASE.md).
Repository and plugin folder names need not match; installed plugin identity comes from the manifest.

Both configurations start `node ./dist/feeds-mcp.mjs`. They omit `cwd` and rely on
the plugin host starting in the installed plugin root. No
undocumented plugin-root placeholder, `tsx`, or `node_modules` is required.
Provider-selection environment variables are intentionally omitted so shared runtime defaults apply. No
persistent data or `${PLUGIN_DATA}` setting is required. HTTP is a separate
entry point documented in [MCP.md](MCP.md).

Marketplace installation, discovery, and updates are documented in
[`edgestream/agent-marketplace`](https://github.com/edgestream/agent-marketplace#installation).
This repository owns the installable package; it does not deploy a remote server.

## Skill packaging

The companion [read-x skill](../skills/read-x/SKILL.md) ships at the portable
fixed discovery path `skills/read-x/SKILL.md`. The companion
[read-bluesky skill](../skills/read-bluesky/SKILL.md) ships alongside it at
`skills/read-bluesky/SKILL.md`. The Codex manifest also declares
`skills: "./skills/"`; both layouts use the same files. Copy the `skills/` directory
along with manifests and bundles when installing outside the checkout.
See [SKILL.md](SKILL.md) for activation, argument selection, and behavioral verification.

## Verification

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

Packaging tests check both skill discovery paths and execute the committed CLI
and MCP bundles from isolated installations without `node_modules`. MCP clients
initialize, discover the tool, and retrieve injected upstream data. These tests
verify packaging and explicit calls, not automatic skill activation; that evidence
belongs in [SKILL.md](SKILL.md#recorded-status).
