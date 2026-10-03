# Plugin packaging

This repository packages one read-only MCP service for desktop and portable
clients, plus a Web wrapper for the already-approved workspace app:

| Target | Files | Contract |
| --- | --- | --- |
| Portable agent plugin | `plugin.json`, `mcp.json` | [Agent Plugin Specification 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) |
| Codex | `.codex-plugin/plugin.json`, `.mcp.json` | [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins) |
| ChatGPT Web | `web/.codex-plugin/plugin.json`, `web/.app.json` | Existing workspace app reference |

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

## ChatGPT Web packaging

`web/` is a separate native source root using the stable `feeds` identity. Its
developer name, version, description, license, repository, keywords, and
interface metadata remain aligned with stable **Feeds**. It contains no
`mcp.json`, `.mcp.json`, inline MCP declaration, or bundled server. Instead,
`.app.json` references the approved hosted workspace app
`asdk_app_6ac0a8553c4481918b9d9782300f52db` as required, and its manifest sets
`apps` to that file. This prevents another MCP registration and avoids the
Desktop-only classification for an imported workspace plugin.

The existing stable Marketplace `feeds` entry must use the `web` subdirectory as
its native plugin root. It must not create an additional Marketplace entry. The
root package retains the stable hosted MCP connection for Codex/desktop and the
local `Feeds Dev` channel. The release preparation script synchronizes the
wrapper version with the root release metadata.

Release preparation selects both MCP configurations with the channel identity.
Stable `Feeds` uses the hosted Streamable HTTP endpoint
`https://feeds.mcp.edgestream.cloud/mcp`: portable `mcp.json` declares its
`streamable-http` type and URL, while Codex `.mcp.json` declares the URL in its
compatibility format. The hosted server supplies protected-resource metadata and
OAuth challenges; no manifest includes OAuth credentials or a copied
authorization configuration.

`Feeds Dev` keeps the local stdio configuration in both forms, starting
`node ./dist/feeds-mcp.mjs`. It omits `cwd` and relies on the plugin host starting
in the installed plugin root. No undocumented plugin-root placeholder, `tsx`, or
`node_modules` is required. Provider-selection environment variables are
intentionally omitted so shared runtime defaults apply. A developer-marketplace
installation remains local or self-hosted and does not grant hosted-service
access. HTTP is a separate entry point documented in [MCP.md](MCP.md).

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

Keep identity, version, descriptions, author, repository, keywords, and
channel-selected MCP settings synchronized. Packaging tests enforce this and start the bundles
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

For the Web wrapper, tests also assert the exact required app ID and that its
manifest has no MCP declaration. Workspace import, role availability, individual
OAuth connections, and bounded live X/Bluesky calls are operational acceptance
evidence; record the source revision, import report, intended roles, and redacted
results before treating the wrapper as accepted.
