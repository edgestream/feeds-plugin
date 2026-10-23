# Private Linux installation

This deployment targets Ubuntu 24.04 LTS, systemd 255, x86-64, Node.js 24 and
`tunnel-client` 0.0.17. It uses native services in the same host network namespace.
No inbound firewall rule, reverse proxy, container, or OAuth change is needed.
Only trusted local users may use this host: any local process can call anonymous
Feeds. The stock container binds outside loopback and still requires OAuth.

## Prepare pinned inputs

On a build machine, select a reviewed full Feeds commit, run `npm ci`,
`npm run build`, `npm run check`, and `npm test`. Copy
`dist/feeds-mcp-http.mjs` and the deployment scripts to the host. Obtain a Node 24
Linux x64 distribution, verify its publisher checksums, and extract `bin/node`.
Obtain the Linux amd64 0.0.17 archive via the
[upstream release page](https://github.com/openai/tunnel-client/releases/latest),
verify `SHA256SUMS.txt`, and extract `tunnel-client`. This arrangement uses polling,
not managed cloudflared. Retain upstream licenses with the installation records.
A newer tunnel release needs separate compatibility verification before changing
the installer version gate.

Record your reviewed full commit, exact Node patch version, upstream release and
trusted SHA-256 values in a deployment manifest. All three digests are mandatory;
calculating a digest from an unverified download is not publisher verification.
Paths resolve relative to the manifest; use local files, not download URLs:

```json
{
  "id": "feeds-REVIEWED_COMMIT-node-24.PATCH-tunnel-0.0.17",
  "feedsCommit": "REPLACE_WITH_FULL_40_CHARACTER_COMMIT",
  "tunnelVersion": "0.0.17",
  "node": { "path": "node", "sha256": "REPLACE_WITH_SHA256" },
  "feeds": { "path": "feeds-mcp-http.mjs", "sha256": "REPLACE_WITH_SHA256" },
  "tunnel": { "path": "tunnel-client", "sha256": "REPLACE_WITH_SHA256" }
}
```

Keep release IDs short (at most 80 letters, digits, dots, underscores or hyphens,
starting with a letter or digit). No credentials belong in this manifest.
The script installs only local verified bytes and does not install OS packages.
The host needs CA certificates, outbound DNS/HTTPS, and an existing Node 24 to run
the installer. The services use the separately pinned Node artifact.

## Configure and install

A privileged operator supplies the tunnel ID in a private copy of
[tunnel.example.yaml](tunnel.example.yaml), following the
[official tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
Provision the runtime API key through your secret manager into
`/etc/feeds-tunnel/api-key` (raw key only, never a command-line argument).
Create `/etc/feeds-tunnel` as root, mode 0700. Set both `api-key` and `tunnel.yaml`
to root ownership and mode 0600. Keep the example minimal; do not enable payload
logging, tracing, extra MCP channels, managed cloudflared, or remote admin access.
systemd passes private copies through `LoadCredential`; Feeds never receives them.

From the reviewed checkout containing `scripts/` and `deploy/`:

```bash
sudo node scripts/on-premise.mjs install /secure/artifacts/manifest.json
sudo node scripts/on-premise.mjs activate YOUR_RELEASE_ID
sudo node scripts/on-premise.mjs status
```

Installation stages an immutable directory under `/opt/feeds-tunnel/releases/`
and installs two units without starting them. Repeating an identical release is
safe; reuse of an ID with different hashes fails before changing services.
Activation selects `current`, enables both services for boot, and restarts them.
A synchronous restart failure restores the previous selection (or stops the first
installation). Activation success means systemd accepted the restart, not tunnel
readiness: run `status` until ready before acceptance. An asynchronous failure or
failed readiness requires explicit rollback. Run one lifecycle command at a time;
installation/activation is not a multi-operator transaction. No script creates,
publishes, or changes a workspace connection.

## Operations

- Restart: `sudo node scripts/on-premise.mjs restart`. Both units retry indefinitely
  every five seconds after exit, including credentials failures; network reconnection
  is handled by tunnel-client. Alert on prolonged readiness failure.
- Check: `sudo node scripts/on-premise.mjs status` checks service activity, Feeds
  `/health`, and tunnel `/healthz` and `/readyz`, each with a five-second deadline.
  Feeds health alone proves neither provider internet access nor tunnel readiness.
- Diagnose locally: `systemctl status feeds-private feeds-tunnel`, Feeds journal,
  and `http://127.0.0.1:8080/ui`. Tunnel stdout/stderr are discarded to avoid retaining
  secrets or payloads. The local UI can contain operational data; do not publish it
  or paste exports into issues. A 401/403 control-plane error points to the key,
  organization or permissions; DNS/TLS/timeouts point to connectivity/CA/proxy
  settings. Inspect locally with the pinned client's `doctor --help` and
  `sudo /opt/feeds-tunnel/current/tunnel-client doctor --config /etc/feeds-tunnel/tunnel.yaml --control-plane.api-key file:/etc/feeds-tunnel/api-key`. Never enable raw HTTP tracing for diagnostics.
- Rotate credentials: provision a replacement key atomically at the same external
  path, restart, verify readiness and a real tool call, then revoke the old key.
  Invalid/revoked keys must leave readiness failing; process activity is insufficient.
- Upgrade: stage a new manifest with a new ID, activate, check readiness and bounded
  tool calls. Keep the previous directory and receipt. Roll back with
  `activate PREVIOUS_RELEASE_ID`; configuration/credentials are not versioned and
  must remain compatible. Back up external configuration in your secret manager.
- Uninstall: `sudo node scripts/on-premise.mjs uninstall` disables/stops both units
  and removes units and all installed versions. It retains `/etc/feeds-tunnel`.
  Remove those files separately after revoking the key and removing the workspace
  connection/tunnel associations. Repeating uninstall is supported by systemd's
  disable behavior; inspect any reported service-manager failure before retrying.

Validate recovery on the supported host: reboot, terminate each process, interrupt
outbound connectivity, restore it, rotate to an invalid key and back, and confirm
readiness plus bounded calls after every recovery. Verify `ss -ltn` shows only
127.0.0.1:3000 and 127.0.0.1:8080 for these services and no public ingress.
For tunnel discovery, call `initialize`, `tools/list`, then `get_feed` for
`https://x.com/OpenAI` and `https://bsky.app/profile/bsky.app` once each, without an
Authorization header. Record Host/Origin observed locally without payloads or
credentials. The tunnel target is explicitly loopback; if headers differ, test the
exact values against [MCP validation](../../docs/MCP.md#transports) before adding
one trusted hostname/origin. Never disable validation or allow wildcards. The
installer intentionally supplies no broad Host/Origin exception.

## Verification status

Offline lifecycle tests exercise staging, repeat installs, checksum rejection,
release ID conflicts, activation, failed activation recovery, upgrade, rollback,
and removal with external credential retention. Existing HTTP/OAuth tests cover
the anonymous protocol and remote binding protection. CLI flags and configuration
were inspected using the actual upstream 0.0.17 Linux amd64 binary.

**Unverified:** a clean Ubuntu installation, actual systemd boot/process recovery,
network recovery, invalid-key readiness behavior, tunnel-forwarded Host/Origin,
real X/Bluesky requests through a tunnel, and target-workspace access. These need
an operator-controlled host, tunnel and workspace credentials. No workspace
connection has been published by this implementation.
