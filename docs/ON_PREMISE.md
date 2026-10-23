# On-premises Feeds for a workgroup

Run anonymous Feeds on a trusted Linux host and reach it through an outbound
Secure MCP Tunnel. Workgroup members still sign in to ChatGPT and belong to the
approved workspace; they do not create Feeds accounts or complete individual
Feeds OAuth connections. This guide describes an operator procedure, not an
instruction to publish a connection automatically.

## Prerequisites and boundaries

Use a dedicated Ubuntu 24.04 LTS x86-64 host with systemd 255, CA certificates,
Node.js 24 and administrative access. The
[installation runbook](../deploy/on-premise/README.md) specifies pinned artifacts,
external secrets, supported client version and lifecycle commands. The installer
is delivered by [the installation PR](https://github.com/edgestream/feeds-plugin/pull/82);
until it is merged, use its reviewed commit in a separate checkout. Do not run
commands from a checkout that lacks those files.

The host needs DNS and outbound HTTPS to the tunnel control plane and the provider
API origins documented in the [provider README](../packages/provider-fxembed/README.md).
No inbound internet port is needed. Feeds and tunnel-client share the host network
namespace; the target is `http://127.0.0.1:3000/mcp`, not a LAN or container address.
Feeds retrieves public upstream content and stores no feed collection. Anonymous
requests do not receive the hosted deployment's per-principal admission budgets;
workgroup use shares provider capacity. Tunnel transport limits also apply.

The existing [HTTP transport](MCP.md#transports) owns Host/Origin validation and
OAuth rules. Do not change those rules to enable this deployment. The stock
container binds to `0.0.0.0`; even with `FEEDS_MCP_HTTP_ALLOW_REMOTE=true`, an
unauthenticated non-loopback listener is rejected. Do not publish a container port
or forward the loopback listener to a network address. Every local process can
reach anonymous Feeds, so local host access is part of the trust boundary.

Three identities have separate responsibilities:

| Identity | Required access | Does not grant |
| --- | --- | --- |
| Workgroup member | ChatGPT login, workspace membership, plugin/app and tool permission | Host administration or a tunnel runtime key |
| Tunnel operator | Platform tunnel permissions and runtime API key | Workspace-wide plugin availability |
| Workspace administrator | Permission to manage custom MCP connections and intended member roles | Platform tunnel management unless separately granted |

Use the [official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
for Platform permissions, associations and network prerequisites. Tunnel creation
requires Read + Manage; running/selecting it requires Read + Use. Associate the
owning Platform organization and the actual target ChatGPT workspace. An unrelated
personal organization is insufficient. Resolve a missing association with the
organization/workspace administrators before proceeding; enterprise mappings may
require OpenAI review.

## Install and establish readiness

1. Complete the installation runbook's pinned-input preparation. Record the Feeds
   commit, Node patch version, tunnel-client version and three trusted digests.
2. Provision `/etc/feeds-tunnel/tunnel.yaml` and the external `api-key` file with
   root ownership and private permissions. Never place the key in Git, manifests,
   shell arguments, tickets or screenshots. Keep a protected recovery copy.
3. Stage and activate the reviewed release:

   ```bash
   sudo node scripts/on-premise.mjs install /secure/artifacts/manifest.json
   sudo node scripts/on-premise.mjs activate YOUR_RELEASE_ID
   sudo node scripts/on-premise.mjs status
   ```

4. Check the local listeners and readiness:

   ```bash
   ss -ltn
   curl --fail --max-time 5 http://127.0.0.1:3000/health
   curl --fail --max-time 5 http://127.0.0.1:8080/healthz
   curl --fail --max-time 5 http://127.0.0.1:8080/readyz
   ```

   Both service listeners must be loopback-only. An active process or Feeds health
   response alone does not establish a connected tunnel. Use the local tunnel UI
   at `http://127.0.0.1:8080/ui` to diagnose connection and authentication failures.
   Do not expose that UI or retain unreviewed diagnostic exports.

For a local protocol check, send `initialize` and `tools/list` without
Authorization, using the JSON-RPC shapes below and both accepted media types:

```bash
curl --fail --max-time 10 http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"on-premise-acceptance","version":"1"}}}'
curl --fail --max-time 10 http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Confirm an initialization result and a `get_feed` tool. HTTP 200 alone is not a
successful tool result; inspect JSON-RPC errors and `isError` too. These local
checks do not prove that ChatGPT can reach the service.

## Create and make the connection available

The following steps require the target workspace administrator. **Do not perform
them as part of installation.** First confirm the workspace plan and policy allow
custom MCP servers. Follow the current
[custom MCP connection procedure](https://developers.openai.com/api/docs/guides/custom-mcp-server):
create a connection in the target workspace, choose **Tunnel**, select the approved
tunnel ID, and choose **No authentication** for Feeds. The tunnel operator key
belongs only on the host, never in the Feeds connection's authentication fields.
Keep the daemon running throughout discovery and subsequent calls.

Before granting access, review `get_feed` and enable that read-only action. Use the
workspace's **Admin > Plugins**, **Workspace apps**, and **Permissions & roles**
controls to make the connection available to every intended workgroup role or
group, including ordinary members rather than only owners/developers. For an
entire-workspace workgroup, cover every intended member role; for a subset, use
its explicit group/role assignments and retain excluded accounts. Check general
plugin permissions and any Lockdown restrictions as well as this specific app.
The exact controls depend on the workspace plan; record their actual names and
selected scope during acceptance. See
[plugin access controls](https://learn.chatgpt.com/docs/enterprise/apps-and-connectors).

Workspace availability, member installation and public distribution are distinct.
Choose **Available** if members should install the workspace plugin themselves,
or **Installed** for each eligible role when the workspace offers managed
installation. This does not add Feeds OAuth: member installation/consent is not a
Feeds login. Check [installation policy](https://learn.chatgpt.com/docs/enterprise/plugin-management)
and app permissions independently. If the required control is unavailable, stop
at an unverified rollout rather than claiming access for the whole workgroup.

This is a private workspace connection. Do not submit it to the public directory.
It does not replace the hosted app referenced by the repository's existing Web
wrapper. A separate workspace connection has its own identity; do not overwrite
that app reference or import the existing wrapper expecting it to select this
tunnel. Marketplace installation/update instructions remain in the
[marketplace guide](https://github.com/edgestream/agent-marketplace#installation).
The standalone connection provides MCP tools, not automatically the companion
URL-routing skills.

## Workgroup acceptance

An authorized administrator performs this procedure only after approving the
intended access scope. Use two ordinary members A and B in separate signed-in
sessions and an excluded account C (outside the workspace, or outside the allowed
group for a subset rollout). Neither A nor B should have a prior Feeds OAuth link.
Do not share the runtime key with any test member.

1. Confirm local readiness and record the release receipt, target workspace,
   connection ID and intended role/group scope without credentials.
2. As A, install/select the workspace connection, discover `get_feed`, and request
   `get_feed({"source":"https://x.com/OpenAI"})` followed by
   `get_feed({"source":"https://bsky.app/profile/bsky.app"})`.
   Use explicit tool selection and inspect the actual tool-call records, successful
   structured content and absence of `isError`. A natural-language answer or
   discovery alone is insufficient. Do not paginate or retry repeatedly.
3. Repeat discovery and the same two bounded calls as B. Neither member should see
   a Feeds account creation or OAuth prompt. ChatGPT login and plugin consent may
   still be required. If Feeds OAuth appears, verify that this is the new tunnel
   connection rather than the existing hosted app.
4. As C, confirm the private connection cannot be installed or invoked. Merely
   hiding its listing is insufficient: check direct access to its connection URL
   and a conversation invocation. Do not grant C permission to complete the test.
5. Verify forwarded Host/Origin using protected local diagnostics that retain
   only those header values. Confirm expected loopback Host acceptance, permitted
   Origin (if present), and rejection of unrelated Host/Origin. Forwarded identity
   headers must not grant access. Never capture full headers containing tokens or
   payloads. An unexpected 403 needs a specific header diagnosis, not wildcard
   allowlists or disabled validation. See the installation runbook for this gate.
6. Repeat readiness and one bounded call after reboot, killing each service,
   a temporary outbound network interruption, and credential rotation. Verify an
   invalid/revoked runtime key fails readiness and prevents successful tunnel
   calls, then restore valid credentials. Do not confuse systemd activity with
   readiness. Restore connectivity and verify recovery before ending the exercise.

Keep the following acceptance record in the operator's deployment log. Replace
`Unverified` only with dated observations and safe evidence references:

| Check | Result as of 2026-10-23 | Required evidence |
| --- | --- | --- |
| Clean supported host and persistent services | Unverified | OS/version pins, boot and recovery observations |
| Tunnel readiness and invalid credentials | Unverified | Health statuses and safe failure category |
| Member A: discovery, X, Bluesky, no Feeds login | Unverified | Workspace role and actual tool results |
| Member B: discovery, X, Bluesky, no Feeds login | Unverified | Separate session and actual tool results |
| Excluded account C | Unverified | Installation and invocation denied |
| Forwarded Host/Origin | Unverified | Exact safe values plus rejection checks |
| Reboot/network/key rotation recovery | Unverified | Readiness and successful bounded call |

Local evidence on 2026-10-23 (Node 24.22.0, Feeds commit
`6622b16aa84802ba979fa2025a1c6d3664cefbe4`): anonymous initialization and tool
discovery succeeded; one Bluesky profile retrieval returned structured content;
one X profile retrieval returned a tool error (`isError: true`). The X check did
not pass and was not repeatedly retried. These calls used loopback directly, not
a tunnel, and do not establish workgroup acceptance.

No target workspace administration, connection publication or live tunnel
acceptance was performed while writing this guide. Repository tests and local
protocol tests are separate evidence and cannot fill these rows.

## Operate and remove

The [installation runbook](../deploy/on-premise/README.md#operations) owns restart,
health, credential rotation, network diagnostics, upgrade, rollback and uninstall
commands. Stage upgrades with a new release ID; retain the previous receipt and
external configuration for rollback. After every change, recheck readiness and
bounded tool calls. Do not log prompts, returned posts or runtime keys to diagnose
an outage.

To revoke workgroup access, disable the workspace app/plugin or remove its allowed
roles/groups first and verify member denial. Stop the tunnel service, revoke its
runtime key, and remove the workspace association or tunnel if no other consumer
uses it. Uninstall the services using the runbook. Finally remove retained host
credentials from the secret manager and filesystem according to local policy.
Member uninstall alone does not revoke other members' access; removing a local
service alone does not remove the workspace listing. Confirm both boundaries.
