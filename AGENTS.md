# Repository Instructions for AI Agents

These instructions apply to the complete repository.

## Required context

Read the project documentation before changing code or public behavior:

- Read [README.md](README.md) when changing end-user setup or examples.
- Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [PROVIDER.md](docs/PROVIDER.md) when changing package
  boundaries, references, platforms, or providers.
- Read [CLI.md](docs/CLI.md) when changing CLI behavior or configuration, and the
  provider package README when changing upstream access.

If requested work conflicts with a documented invariant, point out the conflict
before implementation. Do not silently replace an architectural decision.

- Read [MCP.md](docs/MCP.md) and [PLUGIN.md](docs/PLUGIN.md) when changing MCP,
  resources, transports, manifests, or bundles.

## Project invariants

- Keep one Node/TypeScript toolchain and English code, comments, errors, and
  repository documentation.

## Documentation maintenance

Documentation is part of the implementation, not a follow-up task.

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
   the catalog contract tests.
   Provider tests should use injected upstream collaborators and cover malformed
   data and unsafe source URLs without requiring live network access.
5. Rebuild committed runtime bundles when their sources or dependencies change.
6. Update documentation before the final commit.
