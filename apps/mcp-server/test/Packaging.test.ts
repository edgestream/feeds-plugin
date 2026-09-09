import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, copyFile, cp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const json = async (file: string) => JSON.parse(await readFile(join(root, file), "utf8"));
test("synchronizes plugin metadata and launch configuration", async () => {
  const portable = await json("plugin.json"), codex = await json(".codex-plugin/plugin.json");
  for (const key of ["name", "version", "description", "author", "repository", "keywords"]) assert.deepEqual(portable[key], codex[key]);
  assert.equal(codex.version, (await json("package.json")).version);
  assert.equal(codex.interface.category, "Communications");
  assert.deepEqual(codex.interface.capabilities, ["Read"]);
  assert.equal(codex.mcpServers, "./.mcp.json");
  assert.equal(codex.skills, "./skills/");
  assert.equal(portable.mcpServers, undefined);
  const a = await json("mcp.json"), b = await json(".mcp.json");
  assert.deepEqual(a.mcpServers.feeds, { type: "stdio", ...b.mcpServers.feeds });
  assert.deepEqual(b.mcpServers.feeds, { command: "node", args: ["./dist/feeds-mcp.mjs"] });
  assert.match(a.$schema, /\/1\.0\.0\/mcp\.schema\.json$/);
  assert.match(portable.$schema, /\/1\.0\.0\/plugin\.schema\.json$/);
});

async function installed() {
  const directory = await mkdtemp(join(tmpdir(), "feeds-plugin-"));
  for (const name of ["plugin.json", "mcp.json", ".codex-plugin", ".mcp.json", "skills"]) {
    await cp(join(root, name), join(directory, name), { recursive: true });
  }
  await mkdir(join(directory, "dist"));
  for (const name of ["feeds-mcp.mjs", "feeds-mcp-http.mjs"]) await copyFile(join(root, "dist", name), join(directory, "dist", name));
  await writeFile(join(directory, "fetch.mjs"), `globalThis.fetch = async (url) => {
    if (String(url) !== 'https://api.fxtwitter.com/2/status/123') throw new Error('Unexpected upstream URL');
    return Response.json({status:{id:'123',text:'bundle fixture'}});
  };`);
  return directory;
}

test("installed portable and Codex layouts discover the same companion skill", async () => {
  const directory = await installed();
  try {
    const codex = JSON.parse(await readFile(join(directory, ".codex-plugin/plugin.json"), "utf8"));
    for (const skillRoot of ["skills", codex.skills]) {
      const folders = await readdir(join(directory, skillRoot));
      assert.ok(folders.includes("read-x"));
      const skill = await readFile(join(directory, skillRoot, "read-x/SKILL.md"), "utf8");
      assert.match(skill, /^---\nname: read-x\ndescription: [^\n]+\n---\n/);
      assert.equal(skill, await readFile(join(root, "skills/read-x/SKILL.md"), "utf8"));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
async function verify(client: Client) {
  assert.deepEqual((await client.listTools()).tools.map(t => t.name), ["get_feed"]);
  assert.deepEqual((await client.listResources()).resources, []);
  assert.equal((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate, "feeds://{platform}/{reference}");
  const result = await client.callTool({ name: "get_feed", arguments: { source: "feeds://x/123" } });
  assert.equal(result.isError, undefined);
  assert.match(JSON.stringify(result.structuredContent), /bundle fixture/);
  assert.equal((await client.readResource({ uri: "feeds://x/123" })).contents.length, 1);
}

test("installed stdio bundle handshakes and retrieves without node_modules", async () => {
  const directory = await installed();
  const client = new Client({ name: "bundle-test", version: "1" });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "./fetch.mjs", "./dist/feeds-mcp.mjs"], cwd: directory, env: { ...getDefaultEnvironment(), FEEDS_X_PROVIDER: "fxtwitter" }, stderr: "pipe" }));
    await verify(client);
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
});

test("installed HTTP bundle handshakes and shuts down", { timeout: 15000 }, async () => {
  const directory = await installed();
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ["--import", "./fetch.mjs", "./dist/feeds-mcp-http.mjs"], { cwd: directory, env: { ...getDefaultEnvironment(), FEEDS_X_PROVIDER: "fxtwitter", FEEDS_MCP_HTTP_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "exit");
  const client = new Client({ name: "http-bundle-test", version: "1" });
  try {
    await new Promise<void>((resolve, reject) => {
      let log = "";
      child.stderr.on("data", data => { log += data; if (log.includes("listening at")) resolve(); });
      child.once("error", reject);
      child.once("exit", () => reject(new Error(`HTTP bundle exited: ${log}`)));
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await verify(client);
  } finally {
    await client.close(); child.kill("SIGTERM");
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
  assert.equal(child.exitCode, 0);
});

test("HTTP bundle rejects invalid deployment configuration before listening", async () => {
  for (const env of [
    { FEEDS_MCP_HTTP_HOST: "0.0.0.0" },
    { FEEDS_MCP_HTTP_PORT: "0" },
    { FEEDS_MCP_HTTP_PUBLIC_URL: "https://user:secret@example.test/mcp" },
    { FEEDS_X_PROVIDER: "unknown" },
  ]) {
    const child = spawn(process.execPath, [join(root, "dist/feeds-mcp-http.mjs")], { env: { ...getDefaultEnvironment(), ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stderr.on("data", data => { log += data; });
    const [code] = await once(child, "exit");
    assert.equal(code, 1);
    assert.doesNotMatch(log, /listening at|secret|at main/);
  }
});
