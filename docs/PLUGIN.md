# Plugin packaging

This plugin packages one read-only MCP service using two manifest pairs:

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
The repository root also contains `.app.json`, the reference to the registered
hosted Feeds app. It is intentionally unreferenced by the development manifest.
The Web package has its own copy because a package that declares an MCP server is
classified as Desktop-only by Workspace import.
Both metadata surfaces reference the same local square logo and composer icon at
`./assets/feeds-people-waves-128.png`. The asset is kept below 10 kB and
is copied with the plugin; paths resolve from the installed plugin root. The
portable manifest's OpenAI extension follows the [official plugin packaging
specification](https://developers.openai.com/plugins/build/plugins), and the
asset constraints follow the [official submission error reference](https://developers.openai.com/plugins/deploy/submission-errors#image-errors).
Both manifests use the root package version and the channel identity listed in
[README.md](../README.md#plugin), following [the release procedure](RELEASE.md).
Repository and plugin folder names need not match; installed plugin identity comes from the manifest.

Release preparation selects both MCP configurations with the channel identity.
Stable `Feeds` uses the hosted Streamable HTTP endpoint
`https://feeds.mcp.edgestream.cloud/mcp`: portable `mcp.json` declares its
`streamable-http` type and URL, while Codex `.mcp.json` declares the URL in its
compatibility format. It also adds `apps: "./.app.json"` to the Codex manifest,
activating the registered hosted app. The hosted server supplies protected-resource
metadata and OAuth challenges; no manifest includes OAuth credentials or a copied
authorization configuration.

`Feeds Dev` keeps the local stdio configuration in both forms, starting
`node ./dist/feeds-mcp.mjs`. It omits `cwd` and relies on the plugin host starting
in the installed plugin root. No undocumented plugin-root placeholder, `tsx`, or
`node_modules` is required. Provider-selection environment variables are
intentionally omitted so shared runtime defaults apply. A developer-marketplace
installation remains local or self-hosted, has no `apps` field, and does not grant
hosted-service access. HTTP is a separate entry point documented in [MCP.md](MCP.md).

Marketplace installation, discovery, and updates are documented in
[`edgestream/agent-marketplace`](https://github.com/edgestream/agent-marketplace#installation).
This repository owns the installable package; it does not deploy a remote server.

## ChatGPT Web packaging

`web/` is a deliberately separate, MCP-free native plugin package. Its technical
name matches the existing app-generated workspace plugin,
`dev-6ac49879ccc481918f51562ec1d84797`; it still displays as **Feeds**.
Its developer, version, descriptions, and interface metadata remain aligned with
the release. The root Codex/Desktop package retains the `feeds` name.
Its `.app.json` references the hosted Feeds app
`asdk_app_6ac49879ccc481918f51562ec1d84797` as required, and its manifest sets
`apps` to that file. It contains no `mcp.json`, `.mcp.json`, inline server, or
bundled MCP implementation.

The Web package includes one [read-feeds skill](../web/skills/read-feeds/SKILL.md)
at `skills/read-feeds/SKILL.md` and declares `skills: "./skills/"` in its native
manifest. This path is inside the `web/` source selected for workspace import.
The root Edgestream Marketplace contains the Feeds entry with the existing
workspace `pluginId`. Its first import failed without a detailed diagnostic;
the app-generated technical name and the package name differed. A corrected
release must keep the displayed Feeds name and verify that the same workspace
plugin ID is retained on the next real root Marketplace sync.
Release preparation synchronizes the wrapper version with the root package
version. Do not replace the root package with the wrapper: the root retains the
Codex/Desktop manifests and the local `Feeds Dev` channel.

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

For the Web wrapper, tests also assert the exact required app ID and the absence
of an MCP declaration. They verify its native skill path. Workspace import,
role availability, individual OAuth
connections, and bounded live X/Bluesky calls are operational acceptance evidence.
