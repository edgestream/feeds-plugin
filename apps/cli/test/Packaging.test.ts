import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));

test("local npx executes the committed bundle and preserves the HTTP response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "feeds-test-"));
  try {
    const preload = join(directory, "fetch.mjs");
    await writeFile(preload, `import assert from 'node:assert/strict';
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.fxtwitter.com/2/status/123');
  assert.equal(options.redirect, 'error');
  return Response.json({ tweet: { text: 'Hello 🌍' }, unknown: [null, 42] });
};`);
    const env = { ...process.env, FEEDS_X_PROVIDER: "fxtwitter", NODE_OPTIONS: `--import=${preload}` };
    const result = await exec("npx", ["--no-install", "feeds", "show", "https://x.com/alice/status/123"], { cwd: root, env });
    assert.deepEqual(JSON.parse(result.stdout), { tweet: { text: "Hello 🌍" }, unknown: [null, 42] });
    assert.equal(result.stderr, "");
    await assert.rejects(exec(process.execPath, [join(root, "dist/feeds-cli.mjs"), "show", "123"], { env }), (error: unknown) => {
      const failure = error as { code: number; stdout: string; stderr: string };
      assert.equal(failure.code, 2);
      assert.equal(failure.stdout, "");
      assert.match(failure.stderr, /INVALID_INPUT/u);
      return true;
    });
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
    assert.equal(manifest.bin.feeds, "./dist/feeds-cli.mjs");
    assert.equal(lock.packages[""].bin.feeds, "dist/feeds-cli.mjs");
    assert.match(await readFile(join(root, "dist/feeds-cli.mjs"), "utf8"), /^#!\/usr\/bin\/env node\n/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
