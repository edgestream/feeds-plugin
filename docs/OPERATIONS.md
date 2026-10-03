# Hosted Feeds operations

This runbook covers the stable, workspace-hosted **Feeds** plugin and its
separate ChatGPT Web wrapper. It records
the operating contract for the current release without duplicating the
[marketplace promotion procedure](https://github.com/edgestream/agent-marketplace/blob/main/docs/PROMOTION.md)
or the [Feeds GitOps manifests](https://github.com/edgestream/infrastructure/tree/main/k8s/feeds-mcp/overlays/development).

## Release and publication

Stable **Feeds** is the Marketplace entry `feeds`, currently pinned to the
published `0.2.2` tag. That tag resolves to source commit
`5121262dbf4d1c47df8ea004be8155842ee30d0c`; it is distinct from a moving
release branch. The stable manifest connects only to
`https://feeds.mcp.edgestream.cloud/mcp`.

The deployed GitOps application is `feeds-mcp`. Its current recorded revision
is `a7f627eae20cdb55220c6a9640cd1aad73c44a78`, which pins the Feeds image
`ghcr.io/edgestream/feeds-mcp@sha256:4904068be2fe63e1290be55f0955716aed12ffd3a92b1d7dccadeb60e064f93f`
and OAuth-adapter image
`ghcr.io/edgestream/infrastructure/mcp-resource-adapter@sha256:bfc71f83477d988c1d092d02a2e287b89eca51159bfef61bbe942234657b68ec`.
Record the exact Marketplace tag, source commit, GitOps revision, image digests,
and Argo CD health for every later release or incident.

Publish a new stable version through the repository [release procedure](RELEASE.md)
and then the Marketplace promotion guide. Do not point the stable entry at a
branch or an unpublished commit. The GitOps manifests are operator-controlled;
review their pinned digests and perform the documented Argo CD sync and health
checks rather than editing deployment state from this repository.

## Install, link, relink, and remove

Use the Marketplace's [installation guide](https://github.com/edgestream/agent-marketplace#installation)
to add **Feeds** to the workspace and assign the intended users. It installs one
hosted MCP connection; do not add a raw MCP server, a second Marketplace entry,
or a custom app for the same service.

Each person links their own Edgestream identity when the client follows the
OAuth challenge. The service does not share a workspace credential or retain
social-network credentials. A protected `get_feed` request requires the
person's resource-bound `feeds:read` access token.

To relink, remove the connection's authorization in the client, then invoke the
plugin again and complete the OAuth flow with the intended identity. If the
client cannot offer that control, remove and reinstall **Feeds** from the
Marketplace, then authorize again. To remove access, remove **Feeds** from the
client or workspace assignment and revoke the client authorization when its UI
offers revocation. Removal is per client/account; it does not delete shared
service data because Feeds does not store feed data.

## ChatGPT Web wrapper

The Web wrapper is the MCP-free `web/` package in this repository. It references
the already registered workspace app
`asdk_app_6ac0a8553c4481918b9d9782300f52db`; it does not create an app, carry an
OAuth credential, or declare another MCP server. Before import, a workspace
administrator must confirm that this app resolves to
`https://feeds.mcp.edgestream.cloud/mcp`, has the intended role assignments, and
has not been replaced by a duplicate connection.

Import or sync the wrapper as a native plugin whose source path is `web`, then
inspect the saved import report. Configure the wrapper's installation policy for
the intended roles and leave the app's existing role, action, and service
controls in force. Each intended person starts a new Web conversation, selects
**Feeds**, completes their own OAuth connection, and performs one bounded `get_feed`
call for an X URL and one for a Bluesky URL. Record only redacted success/failure
evidence; never record tokens, authorization codes, or feed contents. Unlinked
use must stop at the OAuth challenge and must not reach FxEmbed.

For an update, merge a reviewed wrapper change, then select **Sync now** for the
workspace marketplace and review its report. Sync preserves workspace policies;
do not create a replacement app or raw MCP registration. To withdraw the wrapper,
set its plugin availability to unavailable for the assigned roles or remove its
marketplace entry after confirming the existing stable desktop package remains
available. Removing a marketplace deletes all plugins it imported, so do not use
that action to remove only this wrapper. Revoke individual authorizations through
the client when access itself must be withdrawn.

## Clients and OAuth callbacks

The supported packaged paths are the workspace ChatGPT client and local or
remote Codex chats. Both use the hosted stable endpoint and discover OAuth from
its protected-resource metadata and challenges. The web client uses its
registered callback. Codex is a native OAuth client whose validated metadata
permits its session-specific loopback callback.

For a remote Codex chat, forward the loopback port displayed by the OAuth flow
over SSH to the machine running Codex, then finish authorization in the browser.
Forward only that displayed local port for the active session; never expose the
loopback callback publicly or substitute a different callback URL. Local Codex
requires no tunnel. ChatGPT Web support remains separately tracked and is not a
requirement for operating the confirmed Codex paths.

**Feeds Dev** is different: it is the `feeds-dev` developer-marketplace identity
and starts the bundled local stdio MCP server. It is for local or self-hosted
development and has no access to the hosted endpoint, deployment, or personal
OAuth grant. It must not be used as evidence that hosted **Feeds** works.

## Provider limits and hosted budgets

Feeds reads public X and Bluesky data through FxEmbed. FxEmbed controls coverage,
availability, rate limiting, and response shape. It can return upstream errors
or incomplete content; in particular, continuing an X answer conversation can
return `404` after a successful first page. See the authoritative
[FxEmbed provider limitations](../packages/provider-fxembed/README.md#upstream-limitations)
and [URL/option rules](CLI.md).

The hosted deployment accepts only the fixed FxEmbed API origins, does not
follow redirects, never forwards MCP credentials, and applies a 10-second
upstream deadline. Its current request and concurrency budgets are not set, so
there is no configured per-principal or global request cap. If a later deployment
sets a positive `FEEDS_HOSTED_MAX_*` value, admission is denied before an
upstream call; record the exact values with that GitOps revision. Successful
upstream JSON is returned unchanged and is not size-limited or truncated.

## Diagnose an incident

1. Confirm the installed identity is **Feeds**, version/tag `0.2.2` (or the
   intended later stable release), and that it resolves only to the hosted MCP
   URL. Remove duplicate raw MCP registrations, apps, or dev installations.
2. Check the GitOps revision and that Argo CD `feeds-mcp` is **Synced** and
   **Healthy** with a completed operation. At the recorded revision this is
   `a7f627e…`; do not treat an old running operation as current state.
3. Check the hosted protected-resource metadata and public `initialize` /
   `tools/list`. A missing or rejected token should receive an OAuth challenge;
   do not test with copied bearer tokens or record tokens, authorization codes,
   state, PKCE values, or personal feed content in tickets.
4. For an OAuth failure, relink the individual account. For remote Codex, first
   verify the SSH loopback forwarding for the displayed port. Escalate server
   logs and the adapter's client-validation decision with secrets redacted.
5. For an authenticated tool failure, distinguish an MCP/OAuth failure from an
   FxEmbed upstream error. Record only request time, client, platform, HTTP/error
   code, release mapping, and redacted correlation evidence. Respect upstream
   rate limits; do not retry a rejected hosted budget request.

## Rollback

Use the Marketplace promotion guide's rollback procedure to restore the prior
known-good stable tag through a Marketplace PR; a listing rollback does not
downgrade existing installations. Use the GitOps repository's review and sync
process to restore the prior known-good pinned image revision, then confirm
Argo CD health and OAuth/tool discovery. Do not move or overwrite published
tags, replace release history, or roll back by pointing the stable Marketplace
entry at a branch. Publish a corrected patch release after the incident.
