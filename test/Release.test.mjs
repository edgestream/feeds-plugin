import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseArguments, planRelease, prepareRelease } from "../scripts/release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async (directory, file) => JSON.parse(await readFile(join(directory, file), "utf8"));

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "feeds-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of ["package.json", "package-lock.json", "plugin.json", "mcp.json", ".mcp.json", ".app.json", ".codex-plugin", "apps", "packages", "web"]) {
    await cp(join(root, file), join(directory, file), {
      recursive: true,
      filter: source => !source.split(/[\\/]/u).some(part => ["dist", "node_modules"].includes(part)),
    });
  }
  await prepareRelease(directory, { version: "0.1.0", channel: "dev", mode: "write" });
  return directory;
}

test("committed versions and channel metadata agree", async () => {
  const { version } = await json(root, "package.json");
  const { name } = await json(root, "plugin.json");
  assert.ok(["feeds", "feeds-dev"].includes(name));
  assert.deepEqual(await planRelease(root, { version, channel: name === "feeds" ? "stable" : "dev" }), []);
  assert.deepEqual(await json(root, ".app.json"), {
    apps: {
      feeds: {
        id: "asdk_app_6ac49879ccc481918f51562ec1d84797",
        required: true,
      },
    },
  });
  const web = await json(root, "web/.codex-plugin/plugin.json");
  assert.equal(web.name, "dev-6ac49879ccc481918f51562ec1d84797");
  assert.equal(web.version, version);
  assert.equal(web.apps, "./.app.json");
  assert.equal(web.skills, "./skills/");
  assert.equal(web.mcpServers, undefined);
  assert.deepEqual(await json(root, "web/.app.json"), await json(root, ".app.json"));
  assert.match(await readFile(join(root, "web/skills/read-feeds/SKILL.md"), "utf8"), /get_feed/u);
});

test("release arguments reject ambiguous modes and invalid versions", () => {
  assert.deepEqual(parseArguments(["0.1.0", "--channel", "stable"]), { version: "0.1.0", channel: "stable", mode: "preview" });
  for (const args of [[], ["0.1.0"], ["0.1.0", "--channel", "other"],
    ["0.1.0", "--channel", "dev", "--write", "--check"],
    ["0.1.0", "--channel", "dev", "--unknown"],
    ...["v0.1.0", "0.2.0-dev.0", "01.0.0", "1.0", "1.0.0\n"].map(v => [v, "--channel", "dev"])]) {
    assert.throws(() => parseArguments(args), /Usage/);
  }
});

test("preview is read-only; stable, patch and development preparation are repeatable", async t => {
  const directory = await fixture(t);
  const originalLock = await json(directory, "package-lock.json");
  const before = await readFile(join(directory, "plugin.json"), "utf8");
  const options = { version: "0.1.0", channel: "stable", mode: "preview" };
  const preview = await prepareRelease(directory, options);
  assert.ok(preview.some(change => change.file === "plugin.json"));
  assert.equal(await readFile(join(directory, "plugin.json"), "utf8"), before);
  await assert.rejects(prepareRelease(directory, { ...options, mode: "check" }), /metadata differs/);
  for (const [version, channel] of [["0.1.0", "stable"], ["0.1.1", "stable"], ["0.2.0", "dev"]]) {
    const target = { version, channel, mode: "write" };
    await prepareRelease(directory, target);
    assert.deepEqual(await prepareRelease(directory, target), []);
    assert.deepEqual(await prepareRelease(directory, { ...target, mode: "check" }), []);
    const lock = await json(directory, "package-lock.json");
    assert.equal(lock.version, version);
    for (const [key, value] of Object.entries(lock.packages)) {
      if (key.split("/").includes("node_modules")) assert.deepEqual(value, originalLock.packages[key]);
      else {
        assert.equal(value.version, version);
        assert.equal((await json(directory, join(key, "package.json"))).version, version);
      }
    }
    const portable = await json(directory, "plugin.json");
    const codex = await json(directory, ".codex-plugin/plugin.json");
    assert.equal(portable.name, channel === "stable" ? "feeds" : "feeds-dev");
    assert.equal(codex.name, portable.name);
    const displayName = channel === "stable" ? "Feeds" : "Feeds Dev";
    assert.equal(portable.extensions["com.openai"].interface.displayName, displayName);
    assert.equal(codex.interface.displayName, displayName);
    assert.equal(portable.version, version);
    assert.equal(codex.version, version);
    const web = await json(directory, "web/.codex-plugin/plugin.json");
    assert.equal(web.version, version);
    assert.equal(web.name, "dev-6ac49879ccc481918f51562ec1d84797");
    assert.equal(web.apps, "./.app.json");
    assert.equal(web.skills, "./skills/");
    assert.equal(web.mcpServers, undefined);
    if (channel === "stable") assert.equal(codex.apps, "./.app.json");
    else assert.equal(codex.apps, undefined);
    const portableMcp = await json(directory, "mcp.json");
    const codexMcp = await json(directory, ".mcp.json");
    assert.match(portableMcp.$schema, /\/1\.0\.0\/mcp\.schema\.json$/);
    if (channel === "stable") {
      assert.deepEqual(portableMcp.mcpServers.feeds, { type: "streamable-http", url: "https://feeds.mcp.edgestream.cloud/mcp" });
      assert.deepEqual(codexMcp.mcpServers.feeds, { url: "https://feeds.mcp.edgestream.cloud/mcp" });
    } else {
      assert.deepEqual(portableMcp.mcpServers.feeds, { type: "stdio", command: "node", args: ["./dist/feeds-mcp.mjs"] });
      assert.deepEqual(codexMcp.mcpServers.feeds, { command: "node", args: ["./dist/feeds-mcp.mjs"] });
    }
    assert.match(portable.$schema, /\/1\.0\.0\//);
    for (const file of ["apps/mcp-server/src/version.ts", "packages/provider-fxembed/src/version.ts"]) {
      assert.ok((await readFile(join(directory, file), "utf8")).includes(`export const version = "${version}";`));
    }
  }
});

test("check rejects drift in either channel-controlled MCP manifest", async t => {
  const directory = await fixture(t);
  const target = { version: "0.1.0", channel: "stable", mode: "write" };
  await prepareRelease(directory, target);
  const portable = await json(directory, "mcp.json");
  portable.mcpServers.feeds.command = "node";
  await writeFile(join(directory, "mcp.json"), JSON.stringify(portable, null, 2));
  await assert.rejects(prepareRelease(directory, { ...target, mode: "check" }), /mcp\.json/);
  await prepareRelease(directory, target);
  const codex = await json(directory, ".mcp.json");
  codex.mcpServers.feeds.args = ["./dist/feeds-mcp.mjs"];
  await writeFile(join(directory, ".mcp.json"), JSON.stringify(codex, null, 2));
  await assert.rejects(prepareRelease(directory, { ...target, mode: "check" }), /\.mcp\.json/);
});

test("invalid lockfile fails before any metadata is written", async t => {
  const directory = await fixture(t);
  const lock = await json(directory, "package-lock.json");
  delete lock.packages["apps/mcp-server"];
  await writeFile(join(directory, "package-lock.json"), JSON.stringify(lock));
  const before = await readFile(join(directory, "package.json"), "utf8");
  await assert.rejects(prepareRelease(directory, { version: "0.2.0", channel: "dev", mode: "write" }), /lockfile package/);
  assert.equal(await readFile(join(directory, "package.json"), "utf8"), before);
});
