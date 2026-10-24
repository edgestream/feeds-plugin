#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, rm, symlink, readlink, chmod, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = '/opt/feeds-tunnel';
const units = ['feeds-private', 'feeds-tunnel'];
const files = { node: 'node', feeds: 'feeds-mcp-http.mjs', tunnel: 'tunnel-client' };
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// The root and service runner are injected only by offline lifecycle tests.
export async function lifecycle(command, argument, { root = '', run = (args) => execFileSync('systemctl', args, { stdio: 'ignore' }) } = {}) {
  const path = value => `${root}${value}`;
  const current = path(`${base}/current`);
  const service = action => run([action, ...units]);
  if (command === 'install') {
    const manifest = JSON.parse(await readFile(argument, 'utf8'));
    if (!validId(manifest.id) || !/^[a-f0-9]{40}$/.test(manifest.feedsCommit ?? '') || manifest.tunnelVersion !== '0.0.17') throw new Error('Invalid release ID, Feeds commit, or tunnel version (expected 0.0.17).');
    const contents = {};
    for (const name of Object.keys(files)) {
      const artifact = manifest[name];
      if (!artifact || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '') || typeof artifact.path !== 'string') throw new Error('Each artifact requires a path and SHA-256 pin.');
      contents[name] = await readFile(resolve(dirname(resolve(argument)), artifact.path));
      if (digest(contents[name]) !== artifact.sha256) throw new Error('Artifact checksum mismatch.');
    }
    const release = path(`${base}/releases/${manifest.id}`);
    const receipt = JSON.stringify({ id: manifest.id, feedsCommit: manifest.feedsCommit, tunnelVersion: manifest.tunnelVersion, hashes: Object.fromEntries(Object.keys(files).map(name => [name, digest(contents[name])])) }, null, 2) + '\n';
    let installed;
    try { installed = await readFile(`${release}/receipt.json`, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (installed !== undefined && installed !== receipt) throw new Error('Release ID already exists with different artifacts.');
    if (installed !== undefined) {
      for (const [name, filename] of Object.entries(files)) {
        if (digest(await readFile(`${release}/${filename}`)) !== digest(contents[name])) throw new Error('Installed artifact checksum mismatch.');
      }
    }
    if (installed === undefined) {
      await mkdir(path(`${base}/releases`), { recursive: true, mode: 0o755 });
      const stage = `${release}.staging`;
      await rm(stage, { recursive: true, force: true });
      await mkdir(stage, { mode: 0o755 });
      try {
        for (const [name, filename] of Object.entries(files)) {
          await writeFile(`${stage}/${filename}`, contents[name], { mode: name === 'feeds' ? 0o644 : 0o755 });
          await chmod(`${stage}/${filename}`, name === 'feeds' ? 0o644 : 0o755);
        }
        await writeFile(`${stage}/receipt.json`, receipt, { mode: 0o644 });
        await rename(stage, release);
      } finally { await rm(stage, { recursive: true, force: true }); }
    }
    await mkdir(path('/etc/systemd/system'), { recursive: true });
    for (const unit of units) await writeFile(path(`/etc/systemd/system/${unit}.service`), await readFile(new URL(`../deploy/on-premise/${unit}.service`, import.meta.url)), { mode: 0o644 });
    await run(['daemon-reload']);
    return; // Staging never starts or publishes a connection.
  }
  if (command === 'activate') {
    if (!validId(argument)) throw new Error('Invalid release ID.');
    const release = path(`${base}/releases/${argument}`);
    const receipt = JSON.parse(await readFile(`${release}/receipt.json`, 'utf8'));
    for (const [name, filename] of Object.entries(files)) {
      if (digest(await readFile(`${release}/${filename}`)) !== receipt.hashes[name]) throw new Error('Installed artifact checksum mismatch.');
    }
    for (const name of ['tunnel.yaml', 'api-key']) {
      const info = await stat(path(`/etc/feeds-tunnel/${name}`));
      if (!info.isFile() || info.mode & 0o077 || (!root && info.uid !== 0)) throw new Error('Tunnel configuration and key must be root-owned private files (0600).');
    }
    let previous;
    try { previous = await readlink(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const select = async target => {
      await rm(`${current}.next`, { force: true });
      await symlink(target, `${current}.next`);
      await rename(`${current}.next`, current);
    };
    await select(`releases/${argument}`);
    try {
      await run(['enable', ...units]);
      await service('restart');
    } catch {
      if (previous) { await select(previous); await service('restart'); }
      else { await service('stop'); await rm(current, { force: true }); }
      throw new Error('Activation failed; previous selection restored. Check service and readiness status.');
    }
    return;
  }
  if (command === 'restart') return service('restart');
  if (command === 'status') {
    await service('is-active');
    for (const url of ['http://127.0.0.1:3000/health', 'http://127.0.0.1:8080/healthz', 'http://127.0.0.1:8080/readyz']) {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error('A local health/readiness check failed.');
    }
    return;
  }
  if (command === 'uninstall') {
    const present = [];
    for (const unit of units) {
      try { await stat(path(`/etc/systemd/system/${unit}.service`)); present.push(unit); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (present.length) await run(['disable', '--now', ...present]);
    for (const unit of units) await rm(path(`/etc/systemd/system/${unit}.service`), { force: true });
    await run(['daemon-reload']);
    await rm(path(base), { recursive: true, force: true });
    return; // External configuration and credentials are deliberately retained.
  }
  throw new Error('Usage: on-premise.mjs install MANIFEST | activate ID | restart | status | uninstall');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== 'linux' || process.getuid() !== 0) throw new Error('Run as root on Linux with systemd.');
    await lifecycle(process.argv[2], process.argv[3]);
    console.log('Operation completed. Run status and workspace acceptance separately.');
  } catch (error) {
    // Do not print third-party output, file contents, or paths supplied as secrets.
    console.error(error.code ? 'Operation failed: check prerequisites and protected configuration.' : error.message);
    process.exitCode = 1;
  }
}
