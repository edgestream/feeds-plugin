import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));

test("local npx executes the committed bundle and returns the complete upstream JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "feeds-test-"));
  try {
    const preload = join(directory, "fetch.mjs");
    await writeFile(preload, `import assert from 'node:assert/strict';
globalThis.fetch = async (url, options) => {
  if (new URL(url).origin === 'https://api.fxbsky.app') {
    const parsed = new URL(url);
    assert.equal(options.redirect, 'error');
    return Response.json({ endpoint: parsed.pathname, parameters: [...parsed.searchParams], results: [{ cid: 'raw' }], cursor: null });
  }
  if (String(url).includes('/profile/')) {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://api.fxtwitter.com/2/profile/alice/statuses');
    assert.equal(parsed.searchParams.get('with_replies'), '1');
    assert.equal(parsed.searchParams.get('cursor'), 'next+/=&x=1#%');
    return Response.json({ results: [{ id: 'reply', replying_to: { status: '123' } }], cursor: null });
  }
  assert.equal(url, 'https://api.fxtwitter.com/2/status/123');
  assert.equal(options.redirect, 'error');
  return Response.json({ status: { id: '123', text: 'Hello 🌍', unknown: [null, 42] } });
};`);
    const env = { ...process.env, FEEDS_X_PROVIDER: "fxembed", NODE_OPTIONS: `--import=${preload}` };
    const result = await exec("npx", ["--no-install", "feeds", "show", "https://x.com/alice/status/123"], { cwd: root, env });
    assert.deepEqual(JSON.parse(result.stdout), { status: { id: "123", text: "Hello 🌍", unknown: [null, 42] } });
    assert.equal(result.stderr, "");
    const replies = await exec(process.execPath, [join(root, "dist/feeds-cli.mjs"), "show", "--answers", "--cursor", "next+/=&x=1#%", "https://x.com/ALICE"], { env });
    assert.deepEqual(JSON.parse(replies.stdout), { results: [{ id: "reply", replying_to: { status: "123" } }], cursor: null });
    assert.equal(replies.stderr, "");
    await assert.rejects(exec(process.execPath, [join(root, "dist/feeds-cli.mjs"), "show", "123"], { env }), (error: unknown) => {
      const failure = error as { code: number; stdout: string; stderr: string };
      assert.equal(failure.code, 2);
      assert.equal(failure.stdout, "");
      assert.match(failure.stderr, /INVALID_INPUT/u);
      return true;
    });
    const isolatedBundle = join(directory, "feeds-cli.mjs");
    await copyFile(join(root, "dist/feeds-cli.mjs"), isolatedBundle);
    for (const [args, endpoint, parameters] of [
      [["https://bsky.app/profile/bsky.app/post/abc"], "/2/status/bsky.app/abc", []],
      [["--context", "https://bsky.app/profile/bsky.app/post/abc"], "/2/thread/bsky.app/abc", []],
      [["--answers", "--cursor", "next+/=&x=1#%", "https://bsky.app/profile/bsky.app/post/abc"], "/2/conversation/bsky.app/abc", [["cursor", "next+/=&x=1#%"]]],
      [["https://bsky.app/profile/bsky.app"], "/2/profile/bsky.app/statuses", []],
      [["--answers", "--cursor", "next+/=&x=1#%", "https://bsky.app/profile/bsky.app"], "/2/profile/bsky.app/statuses", [["with_replies", "1"], ["cursor", "next+/=&x=1#%"]]],
    ] as const) {
      const result = await exec(process.execPath, [isolatedBundle, "show", ...args], { cwd: directory, env });
      assert.deepEqual(JSON.parse(result.stdout), { endpoint, parameters, results: [{ cid: "raw" }], cursor: null });
      assert.equal(result.stderr, "");
    }
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
    assert.equal(manifest.bin.feeds, "./dist/feeds-cli.mjs");
    assert.equal(lock.packages[""].bin.feeds, "dist/feeds-cli.mjs");
    assert.match(await readFile(join(root, "dist/feeds-cli.mjs"), "utf8"), /^#!\/usr\/bin\/env node\n/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
