# Repository Instructions for AI Agents

These instructions apply to the complete repository.

## Required context

Read the project documentation before changing code or public behavior:

- Read [README.md](README.md) when changing end-user setup or examples.
- Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) when changing package boundaries,
  dependency direction, composition, or cross-package data flow.
- Read [PROVIDER.md](docs/PROVIDER.md) and the provider package README when changing
  a provider; read the shared contract when changing platform/provider interaction.
- Read [CLI.md](docs/CLI.md) when changing CLI behavior or configuration.
- Read [MCP.md](docs/MCP.md) when changing MCP tools, resources, or transports.
- Read [PLUGIN.md](docs/PLUGIN.md) when changing manifests, bundles, or installation
  packaging.
- Read [RELEASE.md](docs/RELEASE.md) when changing release tooling, versioning,
  publication, or maintenance branches.
- Read [SKILL.md](docs/SKILL.md) and the relevant executable skill instructions when
  changing skill behavior or its verification.

Reading a document for context does not require editing it. Use the ownership
rules below to select documentation changes.

If requested work conflicts with a documented invariant, point out the conflict
before implementation. Do not silently replace an architectural decision.

## Project invariants

- Keep one Node/TypeScript toolchain and English code, comments, errors, and
  repository documentation.

## Documentation maintenance

Documentation is part of the implementation, not a follow-up task.

### Ownership and change scope

| Document | Owns; update when this changes |
| --- | --- |
| [README.md](README.md) | End-user introduction, quick setup, and minimal examples. Update for changes to getting started, not every new option or provider capability. |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Package responsibilities, dependency direction, composition, shared runtime configuration, and cross-package data-flow invariants. Provider endpoint or option support alone is not an architectural change. |
| [PROVIDER.md](docs/PROVIDER.md) | Shared provider contract, extension requirements, and reusable verification obligations. Update when requirements for providers change, not when one provider supports another option combination. |
| Provider package README (`packages/provider-<name>/README.md`) | That provider's supported combinations, upstream endpoint mapping, response details, and upstream limitations. This is the authoritative home for provider-specific behavior. |
| [CLI.md](docs/CLI.md) | CLI syntax, supported public URL forms shared with MCP, user-visible option semantics, examples, output, and exit codes. Link to shared runtime configuration. Describe how users invoke affected behavior; link to provider details. |
| [MCP.md](docs/MCP.md) | MCP setup, tool inputs and results, user-visible option semantics, errors, and transports. Describe how clients invoke affected behavior; link to provider details. |
| [PLUGIN.md](docs/PLUGIN.md) | Manifests, plugin identity, packaging, discovery, and installation layout. Rebuilding bundles alone does not require a documentation edit. |
| [RELEASE.md](docs/RELEASE.md) | Release preparation, version synchronization, branches and tags, publication gates, marketplace promotion, and backports. |
| [SKILL.md](docs/SKILL.md) | Skill activation scope, tool/argument routing, evaluation procedure, and recorded evidence. Executable model instructions live in `skills/<name>/SKILL.md`; packaging stays in PLUGIN.md. |
| [AGENTS.md](AGENTS.md), [REPOSITORY.md](docs/REPOSITORY.md), [ISSUES.md](docs/ISSUES.md) | Agent workflow, Git conventions, and GitHub issue/PR conventions, respectively. |

- Update only documents whose owned behavior or requirements change, or whose
  existing statements become incorrect. A small change may need only one document;
  there is no required minimum set of documentation edits.
- Keep detailed behavior in its authoritative document. Other documents should
  describe only their own interface implications and link to that detail instead
  of repeating endpoint mappings, limitations, or capability lists.
- For example, allowing authored replies in one provider's profile feed belongs in
  its README, plus CLI/MCP documentation where the meaning or supported use of
  `--answers`/`answers` changes. Update skill instructions only if argument selection
  changes. Leave architecture, shared provider contract, and packaging documentation
  unchanged unless their own statements or contracts are affected.
- If a broader document contains a provider-specific statement made stale by the
  change, replace it with a stable contract statement or a link to the provider
  README. Do not expand duplicated detail. Keep unrelated documentation cleanup
  and restructuring separate from the change.

### Maintenance

- Keep [README.md](README.md) concise and end-user-oriented. Link or route deeper knowledge
  through this file and [AGENTS.md](AGENTS.md) instead of duplicating architecture prose in
  the README.
- Record known implementation gaps in the relevant document. Remove the gap note
  in the same change that closes it.
- When code and documentation disagree, resolve the disagreement before pushing.

## GitHub issues

For every GitHub issue or pull request, follow [ISSUES.md](docs/ISSUES.md).
It is the mandatory source of truth for issue structure, metadata, labels,
dependencies, pull request titles, linking, and verification.

## Git commits

For every commit, follow [REPOSITORY.md](docs/REPOSITORY.md).
It is the mandatory source of truth for commit message conventions.

## Implementation workflow

1. Inspect the branch, worktree, and user-owned changes before editing.
2. Read the relevant documents listed above.
3. Make the smallest coherent change that preserves the documented boundaries.
4. Add or update tests at the lowest useful layer. Reusable adapters should run
   the shared provider contract tests described in [PROVIDER.md](docs/PROVIDER.md).
   Provider tests should use injected upstream collaborators and cover malformed
   data and unsafe source URLs without requiring live network access.
5. Rebuild committed runtime bundles when their sources or dependencies change.
6. Update only the affected documentation according to the ownership rules above
   before the final commit. Check that each edited document has a concrete reason
   to change within its responsibility; documentation edits are unnecessary when
   existing documentation remains accurate and sufficient.
