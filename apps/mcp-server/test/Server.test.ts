import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { FeedService } from "@edgestream/feeds-application";
import { FeedError, type FeedProvider } from "@edgestream/feeds-core";
import { XPlatform } from "@edgestream/feeds-platform-x";
import { createFeedsMcpServer, type FeedsMcpOptions } from "../src/index.js";

async function connect(get: FeedProvider["get"], options: Partial<Omit<FeedsMcpOptions, "feeds">> = {}) {
  const feeds = new FeedService([new XPlatform()], [{ id: "fake", platform: "x", get }]);
  const server = createFeedsMcpServer({ feeds, ...options });
  const client = new Client({ name: "feeds-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  return { client, feeds, close: async () => { await client.close(); await server.close(); } };
}

test("advertises only a URL tool and returns complete provider JSON without resource links", async () => {
  const payload = { status: { custom: true }, results: [{ type: "thread", statuses: [null, null] }], cursor: { bottom: "next" }, extra: 42 };
  let calls = 0;
  const fixture = await connect(async (url, options) => {
    calls++;
    assert.equal(url.href, "https://x.com/a/status/123");
    assert.deepEqual(options, { context: true, answers: true });
    return payload;
  });
  try {
    const tools = (await fixture.client.listTools()).tools;
    assert.deepEqual(tools.map(tool => tool.name), ["get_feed"]);
    assert.equal(tools[0]?.annotations?.readOnlyHint, true);
    assert.deepEqual(Object.keys(tools[0]!.inputSchema.properties!), ["source", "context", "answers"]);
    assert.equal(fixture.client.getServerCapabilities()?.resources, undefined);
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/a/status/123", context: true, answers: true } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, payload);
    assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(payload) }]);
    assert.equal(calls, 1);
  } finally { await fixture.close(); }
});

test("rejects references and removed page options before provider access", async () => {
  let calls = 0;
  const fixture = await connect(async () => { calls++; return {}; });
  try {
    for (const source of ["feeds://x/123", "OpenAI", "123", "https://evil.test/123", "https://", "x.com/OpenAI", "https://x.com/home"]) {
      const result = await fixture.client.callTool({ name: "get_feed", arguments: { source } });
      assert.equal(result.isError, true, source);
      assert.match(JSON.stringify(result.content), /INVALID_INPUT/);
    }
    for (const option of [{ all: true }, { cursor: "next" }, { limit: 25 }]) {
      const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/OpenAI", ...option } });
      assert.equal(result.isError, true);
    }
    assert.equal(calls, 0);
  } finally { await fixture.close(); }
});

test("enforces the result budget without emitting a partial success", async () => {
  const fixture = await connect(async () => ({ text: "x".repeat(600) }), { resultBytes: 512 });
  try {
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/OpenAI" } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.match(JSON.stringify(result.content), /INVALID_RESPONSE/);
  } finally { await fixture.close(); }
});

test("deadline aborts the upstream request and reports TIMEOUT", async () => {
  let aborted = false;
  const fixture = await connect(async (_url, _options, context) => {
    await new Promise<void>(resolve => context!.signal!.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    throw new FeedError("CANCELLED", "Cancelled.");
  }, { timeoutMs: 25 });
  try {
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/OpenAI" } });
    assert.equal(aborted, true);
    assert.match(JSON.stringify(result.content), /TIMEOUT/);
    assert.equal(result.structuredContent, undefined);
  } finally { await fixture.close(); }
});

test("unexpected errors and cyclic non-Error throws survive tool serialization", async () => {
  const cyclic: Record<string, unknown> = { detail: "original non-Error evidence", number: 10n };
  cyclic.self = cyclic;
  Object.defineProperty(cyclic, "getter", { get() { throw new Error("must not invoke"); } });
  for (const error of [new FeedError("CANCELLED", "cancel evidence", { cause: new Error("abort evidence") }), new FeedError("TIMEOUT", "timeout evidence", { cause: new Error("deadline evidence") }), new TypeError("application exploded", { cause: new Error("root cause") }), cyclic, undefined]) {
    const fixture = await connect(async () => { throw error; });
    try {
      const tool = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/a/status/123" } });
      assert.equal(tool.isError, true);
      assert.equal(tool.structuredContent, undefined);
      const data = JSON.parse((tool.content as { text: string }[])[0]!.text);
      if (error instanceof Error) {
        assert.equal(data.diagnostic.name, error.name);
        assert.equal(data.diagnostic.stack, error.stack);
        assert.equal(data.diagnostic.cause.message, (error.cause as Error).message);
      } else if (error === cyclic) {
        assert.match(data.diagnostic.self.omitted, /Cyclic/);
        assert.match(data.diagnostic.getter.omitted, /Accessor/);
      }
    } finally { await fixture.close(); }
  }
});

test("oversized failure diagnostics explicitly report truncation within the result budget", async () => {
  const fixture = await connect(async () => { throw new Error("🧪".repeat(100_000)); }, { resultBytes: 4096 });
  try {
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/a/status/123" } });
    assert.equal(result.isError, true);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 4096);
    assert.match(JSON.stringify(result), /omitted.*budget/);
  } finally { await fixture.close(); }
});
