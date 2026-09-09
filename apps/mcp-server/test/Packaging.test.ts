import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
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
  assert.equal(portable.mcpServers, undefined);
  const a = await json("mcp.json"), b = await json(".mcp.json");
  assert.deepEqual(a.mcpServers.feeds, { type: "stdio", ...b.mcpServers.feeds });
  assert.deepEqual(b.mcpServers.feeds, { command: "node", args: ["./dist/feeds-mcp.mjs"] });
  assert.match(a.$schema, /\/1\.0\.0\/mcp\.schema\.json$/);
  assert.match(portable.$schema, /\/1\.0\.0\/plugin\.schema\.json$/);
});

async function installed() {
  const directory = await mkdtemp(join(tmpdir(), "feeds-plugin-"));
  await mkdir(join(directory, "dist"));
  for (const name of ["feeds-mcp.mjs", "feeds-mcp-http.mjs"]) await copyFile(join(root, "dist", name), join(directory, "dist", name));
  await writeFile(join(directory, "fetch.mjs"), `const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 20000 ? 10 : ms, ...args);
  globalThis.fetch = async (url, options) => {
    const id = String(url).split('/').pop();
    if (['404', '429', '500'].includes(id)) return new Response('diagnostic body ' + id, { status: Number(id), headers: { 'x-evidence': 'upstream-header' } });
    if (id === '501') throw new TypeError('network evidence', { cause: new Error('socket evidence') });
    if (id === '502') return new Response('{malformed');
    if (id === '503') return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('partial evidence')); }, pull(c) { c.error(new Error('body read evidence', { cause: new Error('stream cause') })); } }));
    if (id === '505') return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout transport evidence')), { once: true }));
    if (id === '504') return new Response(new Uint8Array([255]));
    if (String(url) !== 'https://api.fxtwitter.com/2/status/123') throw new Error('Unexpected upstream URL');
    return Response.json({status:{id:'123',text:'bundle fixture'}});
  };`);
  return directory;
}
async function verify(client: Client) {
  assert.deepEqual((await client.listTools()).tools.map(t => t.name), ["get_feed"]);
  assert.deepEqual((await client.listResources()).resources, []);
  assert.equal((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate, "feeds://{platform}/{reference}");
  const result = await client.callTool({ name: "get_feed", arguments: { source: "feeds://x/123" } });
  assert.equal(result.isError, undefined);
  assert.match(JSON.stringify(result.structuredContent), /bundle fixture/);
  assert.equal((await client.readResource({ uri: "feeds://x/123" })).contents.length, 1);
  for (const [id, evidence] of [["404", "diagnostic body 404"], ["429", "diagnostic body 429"], ["500", "diagnostic body 500"], ["501", "socket evidence"], ["502", "SyntaxError"], ["503", "stream cause"], ["504", "TypeError"], ["505", "timeout transport evidence"]]) {
    const failed = await client.callTool({ name: "get_feed", arguments: { source: id } });
    assert.equal(failed.isError, true);
    assert.equal(failed.structuredContent, undefined);
    const data = JSON.parse((failed.content as { text: string }[])[0]!.text);
    assert.match(JSON.stringify(data), new RegExp(evidence!));
    assert.match(JSON.stringify(data), /https:\/\/api.fxtwitter.com\/2\/status\//);
    await assert.rejects(client.readResource({ uri: `feeds://x/${id}` }), (error: any) => {
      assert.equal(error.data.code, data.code);
      assert.match(JSON.stringify(error.data), new RegExp(evidence!));
      if (["404", "429", "500"].includes(id!)) {
        assert.equal(error.data.diagnostic.diagnostics.status, Number(id));
        assert.equal(error.data.diagnostic.diagnostics.headers["x-evidence"], "upstream-header");
        assert.deepEqual(error.data.diagnostic.diagnostics, data.diagnostic.diagnostics);
      }
      return true;
    });
  }
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
