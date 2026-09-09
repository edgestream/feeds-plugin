import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { FeedService } from "@edgestream/feeds-application";
import { FeedError, type FeedProvider, type FeedQuery } from "@edgestream/feeds-core";
import { XPlatform } from "@edgestream/feeds-platform-x";
import { createFeedsMcpServer, type FeedsMcpOptions } from "../src/index.js";

const post = { ref: { kind: "post" as const, platform: "x", id: "123456" }, parent: { kind: "post" as const, platform: "x", id: "123455" }, data: { text: "hello", custom: [1, null, true] } };
async function connect(get: FeedProvider["get"], options: Partial<Omit<FeedsMcpOptions, "feeds">> = {}) {
  const feeds = new FeedService([new XPlatform()], [{ id: "fake", platform: "x", get }]);
  const server = createFeedsMcpServer({ feeds, ...options });
  const client = new Client({ name: "feeds-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  return { client, feeds, close: async () => { await client.close(); await server.close(); } };
}

test("discovers get_feed and generic resources and preserves provider data", async () => {
  const queries: FeedQuery[] = [];
  const fixture = await connect(async query => { queries.push(query); return { posts: [post], nextCursor: "opaque" }; });
  try {
    const { client, feeds } = fixture;
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(tool => tool.name), ["get_feed"]);
    assert.equal(tools[0]?.annotations?.readOnlyHint, true);
    assert.ok(tools[0]?.outputSchema);
    assert.deepEqual((await client.listResources()).resources, []);
    assert.deepEqual((await client.listResourceTemplates()).resourceTemplates.map(t => t.uriTemplate), ["feeds://{platform}/{reference}"]);
    const result = await client.callTool({ name: "get_feed", arguments: { source: "feeds://x/123456", context: true, answers: true, cursor: "previous" } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { posts: [{ ...post, uri: "feeds://x/123456" }], nextCursor: "opaque" });
    assert.deepEqual(queries[0], { subject: post.ref, scope: { ancestors: true, replies: true }, cursor: "previous" });
    const resource = await client.readResource({ uri: "feeds://x/123456" });
    assert.equal(resource.contents[0]?.mimeType, "application/json");
    assert.ok("text" in resource.contents[0]!);
    assert.deepEqual(JSON.parse(resource.contents[0].text), result.structuredContent);
    await client.callTool({ name: "get_feed", arguments: { source: "feeds://x/MayoOhnePommes", limit: 12 } });
    assert.deepEqual(queries.at(-1)?.subject, { kind: "author", platform: "x", handle: "mayoohnepommes" });
    await client.callTool({ name: "get_feed", arguments: { source: "https://x.com/123456" } });
    assert.equal(queries.at(-1)?.subject.kind, "author");
    assert.throws(() => feeds.uri({ kind: "author", platform: "x", handle: "123456" }), { code: "INVALID_INPUT" });
  } finally { await fixture.close(); }
});

test("rejects unsafe inputs before provider access and maps resource errors", async () => {
  let calls = 0;
  const fixture = await connect(async () => { calls++; throw new FeedError("NOT_FOUND", "Post not found."); });
  try {
    for (const source of ["feeds://other/123", "feeds://x/a/b", "feeds://x/%2F", "feeds://x/a?b", "https://evil.test/123", "https://", "x.com/OpenAI", "https:OpenAI", "@OpenAI", "OpenAI?x", "OpenAI#x", "OpenAI%20", " OpenAI", "a-b", "abcdefghijklmnop", "home", "feeds://x/home"]) {
      const result = await fixture.client.callTool({ name: "get_feed", arguments: { source } });
      assert.equal(result.isError, true, source);
      assert.match(JSON.stringify(result.content), /INVALID_INPUT/);
      assert.match(JSON.stringify(result.content), /https:\/\/x.com\/OpenAI/);
    }
    assert.equal(calls, 0);
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "feeds://x/123" } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /NOT_FOUND/);
    await assert.rejects(fixture.client.readResource({ uri: "feeds://x/123" }), /NOT_FOUND/);
    await assert.rejects(fixture.client.readResource({ uri: "feeds://other/123" }), /INVALID_INPUT/);
  } finally { await fixture.close(); }
});

test("paginates, deduplicates, detects loops and enforces result budget", async () => {
  for (const loop of [false, true]) {
    const fixture = await connect(async query => ({ posts: [post], ...(!query.cursor || loop ? { nextCursor: "next" } : {}) }));
    try {
      const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "feeds://x/alice", all: true } });
      if (loop) assert.equal(result.isError, true);
      else assert.deepEqual(result.structuredContent, { posts: [{ ...post, uri: "feeds://x/123456" }], nextCursor: null });
    } finally { await fixture.close(); }
  }
  const fixture = await connect(async () => ({ posts: [post] }), { resultBytes: 80 });
  try {
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "feeds://x/123456" } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /INVALID_RESPONSE/);
    await assert.rejects(fixture.client.readResource({ uri: "feeds://x/123456" }), /INVALID_RESPONSE/);
  } finally { await fixture.close(); }
});

test("total traversal deadline exposes TIMEOUT and individual pages can resume", async () => {
  let aborted = false;
  const fixture = await connect(async (query, context) => {
    if (!query.cursor) return { posts: [post], nextCursor: "next" };
    if (aborted) return { posts: [] };
    await new Promise<void>(resolve => context!.signal!.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    throw new FeedError("CANCELLED", "Cancelled.");
  }, { timeoutMs: 25 });
  try {
    const result = await fixture.client.callTool({ name: "get_feed", arguments: { source: "OpenAI", all: true } });
    assert.equal(aborted, true);
    assert.match(JSON.stringify(result.content), /TIMEOUT/);
    assert.match(JSON.stringify(result.content), /without all/);
    assert.match(JSON.stringify(result.content), /nextCursor as cursor/);
    assert.equal(result.structuredContent, undefined);
    const first = await fixture.client.callTool({ name: "get_feed", arguments: { source: "OpenAI" } });
    assert.deepEqual(first.structuredContent, { posts: [{ ...post, uri: "feeds://x/123456" }], nextCursor: "next" });
    const next = await fixture.client.callTool({ name: "get_feed", arguments: { source: "OpenAI", cursor: "next" } });
    assert.deepEqual(next.structuredContent, { posts: [], nextCursor: null });
  } finally { await fixture.close(); }
});


test("bare X references preserve response shapes and default to one page with continuation", async () => {
  const queries: FeedQuery[] = [];
  const fixture = await connect(async query => { queries.push(query); return { posts: [post], nextCursor: "next" }; });
  try {
    for (const [source, subject] of [
      ["OpenAI", { kind: "author", platform: "x", handle: "openai" }],
      ["author_name", { kind: "author", platform: "x", handle: "author_name" }],
      ["_", { kind: "author", platform: "x", handle: "_" }],
      ["00123456", { kind: "post", platform: "x", id: "00123456" }],
    ] as const) {
      const count = queries.length;
      const result = await fixture.client.callTool({ name: "get_feed", arguments: { source } });
      assert.equal(queries.length, count + 1);
      assert.deepEqual(queries.at(-1)?.subject, subject);
      const expected = { posts: [{ ...post, uri: "feeds://x/123456" }], nextCursor: "next" };
      assert.deepEqual(result.structuredContent, expected);
      assert.deepEqual(result.content, [
        { type: "text", text: JSON.stringify(expected) },
        { type: "resource_link", uri: "feeds://x/123456", name: "x/123456", mimeType: "application/json" },
      ]);
    }
    await fixture.client.callTool({ name: "get_feed", arguments: { source: "OpenAI", cursor: "next" } });
    assert.equal(queries.at(-1)?.cursor, "next");
    const tool = (await fixture.client.listTools()).tools[0]!;
    assert.match(tool.description!, /one page.*unspecified/);
    assert.match(tool.description!, /explicitly requested full traversal/);
    assert.match(tool.description!, /60-second total budget/);
    const metadata = JSON.stringify(tool.inputSchema);
    assert.match(metadata, /not an aggregate cap/);
    assert.match(metadata, /Does not guarantee completeness/);
  } finally { await fixture.close(); }
});
