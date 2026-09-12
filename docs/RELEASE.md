# Release procedure

This document defines the release process. Adding or changing release tooling is
ordinary development work on `main`, not a release PR or authorization to publish.
Commit and PR conventions remain in [REPOSITORY.md](REPOSITORY.md) and
[ISSUES.md](ISSUES.md); installation packaging belongs to [PLUGIN.md](PLUGIN.md).

## Branches, versions, and channels

| Purpose | Branch | Channel | Version example |
| --- | --- | --- | --- |
| Development | `main` | Development | `0.2.0` |
| Maintenance of the 0.1 line | `release/0.1` | Stable | `0.1.0`, then `0.1.1` |

Channel identities are listed once in [README.md](../README.md#plugin) and set
by the preparation script. Guides describe both channels and stay unchanged
when cutting a release or advancing development.

Use plain `major.minor.patch` versions, without a `v` prefix, prerelease suffix,
or build metadata. Create one maintenance branch per released minor line during
0.x development. Tags identify individual releases: `0.1.0` and `0.1.1` point to
different, fully prepared commits on `release/0.1`. Never move or reuse a published
tag. A branch can advance; a published version cannot.

After cutting `release/0.1`, advance all development versions on `main` to `0.2.0`
in a separate maintenance PR. Do not merge the stable identity change into `main`.
The development version identifies the next target, not a published release.
Patch releases contain compatible fixes; intentionally incompatible changes and
new features belong in the next minor line. Record supported maintenance lines
and their end-of-support dates in release notes before publication; none are
declared supported by this preparatory document.

## Version inventory and preparation script

The root `package.json` records the current repository version. Use the script
to set the next version consistently; do not replace version strings globally.
It manages:

- Root `package.json` and all package manifests discovered through its workspace
  patterns, currently `apps/*` and `packages/*`.
- `package-lock.json`: top-level version, root package, and local workspace
  entries. External dependency versions and integrity metadata remain unchanged.
- `plugin.json` and `.codex-plugin/plugin.json`: version, plugin name, and
  matching display names selected by channel.
- `apps/mcp-server/src/version.ts`: the default MCP initialization version.
  The server's explicit version override remains available to callers.
- `packages/provider-fxembed/src/version.ts`: the version in the upstream
  `feeds-plugin/<version> (read-only)` User-Agent.

Both TypeScript version files are generated, committed, and imported locally.
This keeps package dependencies unchanged and embeds the version into standalone
bundles without reading package metadata at runtime. Rebuild all three committed
`dist/feeds-*.mjs` bundles after preparing either channel.

Plugin/MCP schema version `1.0.0`, dependency constraints, protocol identifiers,
test-client versions, and historical documentation examples are independent
versions. Do not bump them with the product version. Review release notes and
documentation for actual behavior changes; a version or
channel change alone does not require documentation edits. The script does not
rewrite documentation.

```bash
# Preview the initial stable release preparation; no writes.
npm run release -- 0.1.0 --channel stable

# Apply on a preparation branch targeting release/0.1.
npm run release -- 0.1.0 --channel stable --write

# Verify metadata without changing files; drift returns exit code 1.
npm run release -- 0.1.0 --channel stable --check

# Independently prepare the next development version in a PR targeting main.
npm run release -- 0.2.0 --channel dev --write

# Later, prepare a patch on the maintenance line.
npm run release -- 0.1.1 --channel stable --write
```

Run with Node.js 24 or later. The script locates the repository relative to its
own file. Preview lists files that would change. `--write` applies local metadata
changes and is repeatable; `--check` validates exactly the supplied version and
channel. Malformed arguments or missing/inconsistent lockfile packages fail
before writing. Files are written sequentially, not as a filesystem transaction;
inspect the diff and rerun after an interrupted write.

The script does not select or validate a Git branch, enforce increasing versions,
build, test, commit, tag, push, create GitHub releases, or update the marketplace.
The maintainer must select the correct branch/version and complete the gates
below. Use a clean checkout or isolated worktree so release changes cannot absorb
unrelated work.

## Initial release and subsequent minor releases

1. Select an explicit, reviewed commit on `main` containing the intended release
   scope and the release tooling. Resolve outstanding release blockers.
2. Create `release/0.1` at that commit. Prepare changes on a short-lived
   `codex/` branch targeting it; use the next minor line for later minor releases.
3. Run the stable preparation script. Review the diff and build bundles.
   Update documentation only for changed behavior, and include known provider
   limitations and user-visible changes in release notes.
4. Run the verification gates below. Review and merge the preparation PR, then
   rerun the gates on the exact merged commit in a clean checkout.
5. Tag that verified commit with the exact version, e.g. annotated tag `0.1.0`.
   Create the matching GitHub release with notes and any intended assets. Enable
   immutable releases before publishing; finish assets in a draft first.
6. Promote the published tag through a separate marketplace PR and verify a real
   installation. A published GitHub release alone is not marketplace promotion.
7. Independently open the development version PR for `0.2.0` on `main` using
   the development channel, rebuild and verify it. This can proceed as soon as the release line
   has been cut; marketplace publication need not block development.

## Verification gates

Use a clean install with a recorded Node/npm version and committed lockfile:

```bash
npm ci
npm run release -- 0.1.0 --channel stable --check
npm run build
npm run check
npm test
git diff --check
```

During preparation, review and commit regenerated bundles. On the final candidate,
require `git diff --exit-code` after the build and tests and no untracked release
inputs. Any generated difference requires a new commit and another verification
before tagging. Check that the candidate belongs to the intended maintenance
line, all versions match the tag, and the tag is absent or already points to the
same verified commit on a resumed publication. A conflicting tag is an error.

Tests cover workspace/lockfile/manifest/runtime version synchronization, both
channels, patch preparation, read-only preview/check, repeatability, and failure
before writes for malformed metadata. Packaging tests initialize both standalone
MCP transports and compare their reported version with the root package version.
Provider tests check the User-Agent through injected HTTP; shared contract tests
and existing CLI/MCP tests require no live upstream service.

Required automation, not yet implemented: GitHub Actions checks on PRs and on
`main`/`release/*`, required branch checks, a deliberately triggered publication
workflow bound to an exact commit and version, immutable release configuration,
and serialized publication/promotion. Until these exist, maintainers must execute
and record the same gates manually. The local script is preparation tooling, not
an automated publishing pipeline. When adding Actions, pin the build toolchain
and actions, limit write permissions to publication, and provision narrowly scoped
credentials for the separate marketplace repository.

## Marketplace promotion and installation

Follow the [marketplace promotion guide](https://github.com/edgestream/agent-marketplace/blob/main/docs/PROMOTION.md)
for listing changes, channel policy, installation/update verification, and
marketplace recovery. Hand over the published tag and exact verified commit.
Host skill behavior evidence remains in [SKILL.md](SKILL.md).

## Backports, retries, and rollback

Fix on `main` first where practical, then cherry-pick only the required fix commits
into a PR targeting `release/0.1`. Resolve conflicts and test on that line. Urgent
maintenance-first fixes must also reach `main`. Do not merge all of `main` into a
maintenance branch or carry development identity/version changes with a backport.
Prepare `0.1.1` with the same script, gates, notes, tag, release, and promotion
procedure as `0.1.0`.

Serialize publication for a maintenance line and promotion for the stable channel.
On retry, inspect existing tags, releases, and marketplace PRs; reuse matching
objects and fail on conflicting commits or versions. Do not recreate or overwrite
a published release. If marketplace promotion fails after publication, retry only
promotion against the existing release.

For a defective release, document the problem and publish the correction under a
new patch version. Follow the marketplace promotion guide for listing rollback
and client recovery. Keep published tags and release history intact.
