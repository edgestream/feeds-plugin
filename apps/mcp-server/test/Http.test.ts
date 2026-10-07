import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createFeed } from "@edgestream/feeds-runtime";
import { createFeedsMcpHttpServer, createFeedsMcpServer } from "../src/index.js";

test("protects hosted feed calls before runtime or FxEmbed access", async () => {
  let providerCalls = 0;
  let factoryCalls = 0;
  let seenPrincipal: unknown;
  const verifier = {
    async verify(token: string) {
      if (["revoked", "unavailable"].includes(token)) throw new Error("not active");
      return {
        issuer: token === "wrong-issuer" ? "https://other.example/" : "https://auth.example/",
        subject: token === "expired" ? "account-expired" : "account-a",
        scopes: token === "insufficient" ? ["other:read"] : ["feeds:read"],
        expiresAt: token === "expired" ? Math.floor(Date.now() / 1_000) - 1 : Math.floor(Date.now() / 1_000) + 60,
      };
    },
  };
  const server = createFeedsMcpHttpServer((context) => {
    factoryCalls++;
    seenPrincipal = context.authInfo?.extra?.feedsPrincipal;
    const feeds = createFeed({ xProvider: "fxembed" }, { fetch: async () => { providerCalls++; return Response.json({ status: { id: "123" } }); } });
    return createFeedsMcpServer({ feeds });
  }, {
    host: "127.0.0.1", port: 0, allowedHosts: ["127.0.0.1", "feeds.example"], allowedOrigins: ["trusted.example"],
    authentication: { resource: "https://feeds.example/mcp", issuer: "https://auth.example/", verifier },
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_feed", arguments: { source: "https://x.com/a/status/123" } } });
  try {
    for (const headers of [
      { "content-type": "application/json", accept: "application/json" }, { authorization: "Basic forged", "content-type": "application/json", accept: "application/json" },
      { authorization: "Bearer expired", "content-type": "application/json", accept: "application/json" }, { authorization: "Bearer revoked", "content-type": "application/json", accept: "application/json" },
      { authorization: "Bearer unavailable", "content-type": "application/json", accept: "application/json" }, { authorization: "Bearer wrong-issuer", "content-type": "application/json", accept: "application/json" },
      { authorization: "Bearer revoked", "x-feeds-subject": "account-a", "x-forwarded-user": "account-a", "content-type": "application/json", accept: "application/json" },
    ]) {
      const response = await fetch(`${origin}/mcp`, { method: "POST", headers, body: call });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.result.isError, true);
      assert.deepEqual(result.result._meta["mcp/www_authenticate"], ['Bearer resource_metadata="https://feeds.example/.well-known/oauth-protected-resource", error="invalid_token", error_description="Sign in required"']);
    }
    const insufficient = await fetch(`${origin}/mcp`, { method: "POST", headers: { authorization: "Bearer insufficient", "content-type": "application/json", accept: "application/json" }, body: call });
    assert.equal(insufficient.status, 200);
    assert.deepEqual((await insufficient.json()).result._meta["mcp/www_authenticate"], ['Bearer resource_metadata="https://feeds.example/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Feeds read permission is required", scope="feeds:read"']);
    assert.equal(factoryCalls, 0);
    assert.equal(providerCalls, 0);

    const metadata = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);
    assert.deepEqual(await metadata.json(), { resource: "https://feeds.example/mcp", authorization_servers: ["https://auth.example/"], scopes_supported: ["openid", "offline_access", "feeds:read"] });
    const schemas = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) });
    assert.equal(schemas.status, 200);
    assert.match(await schemas.text(), /"securitySchemes":\[\{"type":"oauth2","scopes":\["openid","offline_access","feeds:read"\]\}\]/u);
    assert.equal(providerCalls, 0);

    const spoofedHost = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(`${origin}/mcp`, { method: "POST", headers: { host: "attacker.example", "x-forwarded-host": "feeds.example", "x-forwarded-proto": "https", "content-type": "application/json" } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
      request.on("error", reject); request.end(call);
    });
    assert.equal(spoofedHost, 403);
    const spoofedOrigin = await fetch(`${origin}/mcp`, { method: "POST", headers: { authorization: "Bearer accepted", origin: "https://attacker.example", "content-type": "application/json" }, body: call });
    assert.equal(spoofedOrigin.status, 403);
    assert.equal(providerCalls, 0);

    const accepted = await fetch(`${origin}/mcp`, { method: "POST", headers: { authorization: "Bearer accepted", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: call });
    assert.equal(accepted.status, 200);
    assert.deepEqual(seenPrincipal, { issuer: "https://auth.example/", subject: "account-a", scopes: ["feeds:read"], expiresAt: (seenPrincipal as { expiresAt: number }).expiresAt });
    assert.equal(providerCalls, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("HTTP protocol discovery, retrieval, validation and bounded bodies", async () => {
  let calls = 0;
  const feeds = createFeed({ xProvider: "fxembed" }, { fetch: async () => { calls++; return Response.json({ status: { id: "123", text: "hello" } }); } });
  const server = createFeedsMcpHttpServer(() => createFeedsMcpServer({ feeds }), { host: "127.0.0.1", port: 0, allowedHosts: ["127.0.0.1"], allowedOrigins: [], bodyLimit: 4096 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const endpoint = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
  const client = new Client({ name: "http-test", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint));
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ["get_feed"]);
    assert.equal((await client.callTool({ name: "get_feed", arguments: { source: "https://x.com/a/status/123" } })).isError, undefined);
    assert.equal(calls, 1);
    for (const args of [{ source: "https://x.com/a/status/123", limit: 2 }, { source: "https://x.com/alice", context: true }, { source: "https://x.com/a/status/123", cursor: "x" }, { source: "https://x.com/a/status/123", limit: 0 }]) {
      // Invalid schemas may be protocol errors; unsupported provider combinations are tool errors.
      try { assert.equal((await client.callTool({ name: "get_feed", arguments: args })).isError, true); }
      catch (error) { assert.match(String(error), /[Ii]nvalid|[Ll]imit|[Ss]chema/); }
    }
    assert.equal(calls, 1);
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
    assert.equal(calls, 1);
  } finally { await client.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("disconnecting an HTTP caller aborts upstream work", { timeout: 5000 }, async () => {
  let started!: () => void, aborted!: () => void;
  const didStart = new Promise<void>(resolve => { started = resolve; });
  const didAbort = new Promise<void>(resolve => { aborted = resolve; });
  const feeds = createFeed({ xProvider: "fxembed" }, { fetch: async (_url, options) => new Promise((_resolve, reject) => {
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
    const pending = client.callTool({ name: "get_feed", arguments: { source: "https://x.com/a/status/123" } });
    const failed = assert.rejects(pending);
    await didStart;
    controller.abort();
    await didAbort;
    await failed;
  } finally { await client.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
