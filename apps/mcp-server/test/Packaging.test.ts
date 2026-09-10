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
  assert.ok(codex.interface.defaultPrompt.length > 0);
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
  await writeFile(join(directory, "fetch.mjs"), `globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/2/conversation/123' || parsed.pathname === '/2/profile/openai/statuses') {
      const cursor = parsed.searchParams.get('cursor');
      if (cursor !== null && cursor !== 'next+/=&x=1#%') throw new Error('Unexpected cursor');
      return Response.json({ [parsed.pathname.includes('/profile/') ? 'results' : 'replies']: [{ id: cursor === null ? '1' : '2' }], cursor: cursor === null ? { bottom: 'next+/=&x=1#%' } : null });
    }
    const id = String(url).split('/').pop();
    if (['404', '429', '500'].includes(id)) return new Response('diagnostic body ' + id, { status: Number(id), headers: { 'x-evidence': 'upstream-header' } });
    if (id === '501') throw new TypeError('network evidence', { cause: new Error('socket evidence') });
    if (id === '502') return new Response('{malformed');
    if (id === '503') return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('partial evidence')); }, pull(c) { c.error(new Error('body read evidence', { cause: new Error('stream cause') })); } }));
    if (id === '504') return new Response(new Uint8Array([255]));
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
  assert.equal(client.getServerCapabilities()?.resources, undefined);
  assert.ok((await client.listTools()).tools[0]!.inputSchema.properties?.cursor);
  const source = "https://x.com/a/status/123";
  const first = await client.callTool({ name: "get_feed", arguments: { source, answers: true } });
  assert.equal(first.isError, undefined);
  assert.deepEqual(first.structuredContent, { replies: [{ id: "1" }], cursor: { bottom: "next+/=&x=1#%" } });
  const next = await client.callTool({ name: "get_feed", arguments: { source, answers: true, cursor: (first.structuredContent as { cursor: { bottom: string } }).cursor.bottom } });
  assert.equal(next.isError, undefined);
  assert.deepEqual(next.structuredContent, { replies: [{ id: "2" }], cursor: null });
  const profile = "https://x.com/OpenAI";
  const authorFirst = await client.callTool({ name: "get_feed", arguments: { source: profile } });
  assert.equal(authorFirst.isError, undefined);
  assert.deepEqual(authorFirst.structuredContent, { results: [{ id: "1" }], cursor: { bottom: "next+/=&x=1#%" } });
  const authorNext = await client.callTool({ name: "get_feed", arguments: { source: profile, cursor: (authorFirst.structuredContent as { cursor: { bottom: string } }).cursor.bottom } });
  assert.equal(authorNext.isError, undefined);
  assert.deepEqual(authorNext.structuredContent, { results: [{ id: "2" }], cursor: null });
  const result = await client.callTool({ name: "get_feed", arguments: { source: "https://x.com/a/status/123" } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, { status: { id: "123", text: "bundle fixture" } });
  for (const [id, evidence] of [["404", "NOT_FOUND"], ["429", "RATE_LIMITED"], ["500", "UPSTREAM"], ["501", "UPSTREAM"], ["502", "INVALID_RESPONSE"], ["503", "UPSTREAM"], ["504", "INVALID_RESPONSE"]]) {
    const failed = await client.callTool({ name: "get_feed", arguments: { source: `https://x.com/a/status/${id}` } });
    assert.equal(failed.isError, true);
    assert.equal(failed.structuredContent, undefined);
    const data = JSON.parse((failed.content as { text: string }[])[0]!.text);
    assert.equal(data.code, evidence);
    assert.equal(typeof data.message, "string");
    assert.deepEqual(Object.keys(data).sort(), ["code", "message"]);
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
