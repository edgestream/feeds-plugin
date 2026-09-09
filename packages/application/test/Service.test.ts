import assert from "node:assert/strict";
import test from "node:test";
import { FeedService } from "../src/index.js";

test("routes platform identity to the selected interchangeable provider and preserves its payload", async () => {
  const platform = { id: "example", parseReference: () => ({ kind: "post" as const, platform: "example", id: "123" }), formatReference: () => "123", resolve: () => ({ kind: "post" as const, platform: "example", id: "123" }) };
  const signal = new AbortController().signal;
  for (const id of ["first", "replacement"]) {
    const payload = { posts: [] };
    const service = new FeedService([platform], [{ id, platform: "example", get: async (ref, context) => {
      assert.deepEqual(ref.subject, { kind: "post", platform: "example", id: "123" });
      assert.equal(context?.signal, signal);
      return payload;
    } }]);
    assert.deepEqual(await service.show("https://example.com/post/123", {}, { signal }), payload);
  }
});

test("rejects invalid inputs and ambiguous configuration", async () => {
  const service = new FeedService([], []);
  await assert.rejects(service.show("123"), { code: "INVALID_INPUT" });
  await assert.rejects(service.show("https://unknown.test/post/123"), { code: "INVALID_INPUT" });
  const platform = { id: "x", parseReference: () => ({ kind: "post" as const, platform: "x", id: "123" }), formatReference: () => "123", resolve: () => ({ kind: "post" as const, platform: "x", id: "123" }) };
  assert.throws(() => new FeedService([platform, platform], []), { code: "CONFIGURATION" });
  await assert.rejects(new FeedService([platform], []).show("https://x.com/a/status/123"), { code: "CONFIGURATION" });
});

test("passes author subjects and options to providers and merges all pages", async () => {
  const subject = { kind: "author" as const, platform: "x", handle: "alice" };
  const calls: unknown[] = [];
  const post = { ref: { kind: "post" as const, platform: "x", id: "123" }, data: { text: "hello" } };
  const service = new FeedService([{ id: "x", parseReference: () => ({ kind: "post" as const, platform: "x", id: "123" }), formatReference: () => "123", resolve: () => subject }], [{ id: "fake", platform: "x", get: async query => {
    calls.push(query);
    return { posts: [post], ...(query.cursor ? {} : { nextCursor: "next" }) };
  } }]);
  assert.deepEqual(await service.show("https://x.com/alice", { all: true, limit: 10 }), { posts: [post] });
  assert.deepEqual(calls, [{ subject, limit: 10 }, { subject, limit: 10, cursor: "next" }]);
});

test("all-pages traversal detects cursor loops, bounds requests and supports cancellation", async () => {
  const platform = { id: "x", parseReference: () => ({ kind: "post" as const, platform: "x", id: "123" }), formatReference: () => "123", resolve: () => ({ kind: "author" as const, platform: "x", handle: "alice" }) };
  for (const repeated of [true, false]) {
    let calls = 0;
    const service = new FeedService([platform], [{ id: "fake", platform: "x", get: async () => ({ posts: [], nextCursor: repeated ? "same" : String(++calls) }) }]);
    await assert.rejects(service.show("https://x.com/alice", { all: true }), { code: repeated ? "INVALID_RESPONSE" : "UPSTREAM" });
    if (!repeated) assert.equal(calls, 100);
  }
  const controller = new AbortController();
  const service = new FeedService([platform], [{ id: "fake", platform: "x", get: async () => {
    controller.abort(); return { posts: [], nextCursor: "next" };
  } }]);
  await assert.rejects(service.show("https://x.com/alice", { all: true }, { signal: controller.signal }), { code: "CANCELLED" });
});
