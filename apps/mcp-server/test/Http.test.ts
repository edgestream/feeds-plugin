import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createFeed } from "@edgestream/feeds-runtime";
import { createFeedsMcpHttpServer, createFeedsMcpServer } from "../src/index.js";

test("HTTP protocol discovery, retrieval, validation and bounded bodies", async () => {
  let calls = 0;
  const feeds = createFeed({ xProvider: "fxtwitter" }, { fetch: async () => { calls++; return Response.json({ status: { id: "123", text: "hello" } }); } });
  const server = createFeedsMcpHttpServer(() => createFeedsMcpServer({ feeds }), { host: "127.0.0.1", port: 0, allowedHosts: ["127.0.0.1"], allowedOrigins: [], bodyLimit: 4096 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const endpoint = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
  const client = new Client({ name: "http-test", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint));
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ["get_feed"]);
    assert.equal((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate, "feeds://{platform}/{reference}");
    assert.equal((await client.callTool({ name: "get_feed", arguments: { source: "feeds://x/123" } })).isError, undefined);
    assert.equal((await client.readResource({ uri: "feeds://x/123" })).contents.length, 1);
    assert.equal(calls, 2);
    for (const args of [{ source: "feeds://x/123", limit: 2 }, { source: "feeds://x/alice", context: true }, { source: "feeds://x/123", cursor: "x" }, { source: "feeds://x/123", limit: 0 }]) {
      // Invalid schemas may be protocol errors; unsupported provider combinations are tool errors.
      try { assert.equal((await client.callTool({ name: "get_feed", arguments: args })).isError, true); }
      catch (error) { assert.match(String(error), /[Ii]nvalid|[Ll]imit|[Ss]chema/); }
    }
    assert.equal(calls, 2);
    assert.deepEqual(await (await fetch(new URL("/health", endpoint))).json(), { status: "ok" });
    assert.equal((await fetch(endpoint, { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" })).status, 403);
    const rejectedHost = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(endpoint, { method: "POST", headers: { host: "evil.test" } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
      request.on("error", reject); request.end("{}");
    });
    assert.equal(rejectedHost, 403);
    assert.equal((await fetch(endpoint, { method: "POST", body: "x".repeat(4097) })).status, 413);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(endpoint, { method: "POST", headers: { "transfer-encoding": "chunked" } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
      request.on("error", reject);
      request.write("x".repeat(2048)); request.end("x".repeat(2049));
    });
    assert.equal(status, 413);
    assert.equal(calls, 2);
  } finally { await client.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("disconnecting an HTTP caller aborts upstream work", { timeout: 5000 }, async () => {
  let started!: () => void, aborted!: () => void;
  const didStart = new Promise<void>(resolve => { started = resolve; });
  const didAbort = new Promise<void>(resolve => { aborted = resolve; });
  const feeds = createFeed({ xProvider: "fxtwitter" }, { fetch: async (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener("abort", () => { aborted(); reject(new Error("aborted")); }, { once: true });
    started();
  }) });
  const server = createFeedsMcpHttpServer(() => createFeedsMcpServer({ feeds }), { host: "127.0.0.1", port: 0, allowedHosts: ["127.0.0.1"], allowedOrigins: [] });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const endpoint = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
  const controller = new AbortController();
  const client = new Client({ name: "disconnect-test", version: "1" });
  const transport = new StreamableHTTPClientTransport(endpoint, { fetch: (url, init) => fetch(url, { ...init, signal: controller.signal }) });
  try {
    await client.connect(transport);
    const pending = client.callTool({ name: "get_feed", arguments: { source: "feeds://x/123" } });
    const failed = assert.rejects(pending);
    await didStart;
    controller.abort();
    await didAbort;
    await failed;
  } finally { await client.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
