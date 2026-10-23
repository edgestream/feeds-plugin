import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readlink, mkdir, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { lifecycle } from '../scripts/on-premise.mjs';

test('pinned lifecycle stages, repeats, rejects drift, upgrades, rolls back and preserves external secrets', async () => {
  const root = await mkdtemp(`${tmpdir()}/feeds-install-`);
  const calls = [];
  const options = { root, run: async args => calls.push(args) };
  const manifest = { id: 'first', feedsCommit: 'a'.repeat(40), tunnelVersion: '0.0.17' };
  try {
    for (const name of ['node', 'feeds', 'tunnel']) {
      await writeFile(`${root}/${name}`, name);
      manifest[name] = { path: name, sha256: createHash('sha256').update(name).digest('hex') };
    }
    const source = `${root}/manifest.json`;
    const save = () => writeFile(source, JSON.stringify(manifest));
    await save();
    await lifecycle('install', source, options);
    await lifecycle('install', source, options);
    assert.deepEqual(calls, [['daemon-reload'], ['daemon-reload']]);
    await assert.rejects(lifecycle('activate', 'first', options));
    await mkdir(`${root}/etc/feeds-tunnel`);
    for (const name of ['tunnel.yaml', 'api-key']) await writeFile(`${root}/etc/feeds-tunnel/${name}`, 'external', { mode: 0o600 });
    await lifecycle('activate', 'first', options);
    assert.equal(await readlink(`${root}/opt/feeds-tunnel/current`), 'releases/first');
    await writeFile(`${root}/opt/feeds-tunnel/releases/first/node`, 'tampered');
    await assert.rejects(lifecycle('activate', 'first', options), /checksum/);
    await assert.rejects(lifecycle('install', source, options), /checksum/);
    await writeFile(`${root}/opt/feeds-tunnel/releases/first/node`, 'node');
    await writeFile(`${root}/feeds`, 'changed');
    await assert.rejects(lifecycle('install', source, options), /checksum/);
    manifest.feeds.sha256 = createHash('sha256').update('changed').digest('hex');
    await save();
    await assert.rejects(lifecycle('install', source, options), /different artifacts/);
    manifest.id = '../escape'; await save();
    await assert.rejects(lifecycle('install', source, options), /Invalid/);
    manifest.id = 'second'; await save();
    await lifecycle('install', source, options);
    let fail = true;
    await assert.rejects(lifecycle('activate', 'second', { root, run: async args => {
      if (args[0] === 'restart' && fail) { fail = false; throw new Error('failure'); }
    } }), /previous selection restored/);
    assert.equal(await readlink(`${root}/opt/feeds-tunnel/current`), 'releases/first');
    await lifecycle('activate', 'second', options);
    await lifecycle('activate', 'first', options);
    await lifecycle('uninstall', undefined, options);
    await lifecycle('uninstall', undefined, options);
    await assert.rejects(access(`${root}/opt/feeds-tunnel`));
    assert.equal(await readFile(`${root}/etc/feeds-tunnel/api-key`, 'utf8'), 'external');
    assert.ok(calls.some(args => args[0] === 'disable'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
