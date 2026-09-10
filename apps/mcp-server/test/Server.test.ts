import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { FeedService } from "@edgestream/feeds-application";
import { FeedError, type FeedProvider } from "@edgestream/feeds-core";
import { XPlatform } from "@edgestream/feeds-platform-x";
import { createFeedsMcpServer } from "../src/index.js";

async function connect(get: FeedProvider["get"]) {
  const feeds = new FeedService([new XPlatform()], [{ id: "fake", platform: "x", get }]);
  const server = createFeedsMcpServer({ feeds });
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
    assert.equal(tools[0]?.outputSchema, undefined);
    assert.deepEqual(Object.keys(tools[0]!.inputSchema.properties!), ["source", "context", "answers", "cursor"]);
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
    for (const option of [{ all: true }, { cursor: "" }, { cursor: 42 }, { limit: 25 }]) {
      const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/OpenAI", ...option } });
      assert.equal(result.isError, true);
    }
    assert.equal(calls, 0);
  } finally { await fixture.close(); }
});

test("returns JSON larger than the former MCP result budget", async () => {
  const payload = { text: "x".repeat(6 * 1024 * 1024) };
  const fixture = await connect(async () => payload);
  try {
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/OpenAI" } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, payload);
    assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(payload) }]);
  } finally { await fixture.close(); }
});

test("reports only code and message without traversing exceptions", async () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  Object.defineProperty(cyclic, "getter", { get() { throw new Error("must not invoke"); } });
  for (const error of [new FeedError("CANCELLED", "cancel evidence", { cause: cyclic }), new TypeError("network evidence", { cause: cyclic }), cyclic, undefined]) {
    const fixture = await connect(async () => { throw error; });
    try {
      const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "https://x.com/a/status/123" } });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent, undefined);
      assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify({
        code: error instanceof FeedError ? error.code : "UPSTREAM",
        message: error instanceof Error ? error.message : "Unexpected request failure.",
      }) }]);
    } finally { await fixture.close(); }
  }
});

test("forwards the conversation cursor through MCP and application without changing responses", async () => {
  const cursor = "next+/=&x=1#%";
  const first = { replies: [{ id: "1" }], cursor: { bottom: cursor } };
  const second = { replies: [{ id: "2" }], cursor: null };
  let calls = 0;
  const fixture = await connect(async (url, options) => {
    assert.equal(url.href, "https://x.com/a/status/123");
    assert.deepEqual(options, { context: false, answers: true, ...(calls ? { cursor } : {}) });
    return calls++ ? second : first;
  });
  try {
    const source = "https://x.com/a/status/123";
    const page = await fixture.client.callTool({ name: "get_feed", arguments: { source, answers: true } });
    assert.equal(page.isError, undefined);
    assert.deepEqual(page.structuredContent, first);
    const next = await fixture.client.callTool({ name: "get_feed", arguments: { source, answers: true, cursor: (page.structuredContent as typeof first).cursor.bottom } });
    assert.equal(next.isError, undefined);
    assert.deepEqual(next.structuredContent, second);
    assert.deepEqual(next.content, [{ type: "text", text: JSON.stringify(second) }]);
    assert.equal(calls, 2);
  } finally { await fixture.close(); }
});
