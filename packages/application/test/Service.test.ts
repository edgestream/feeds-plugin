import assert from "node:assert/strict";
import test from "node:test";
import { FeedService } from "../src/index.js";

const platform = { id: "example", supports: (url: URL) => url.hostname === "example.com" };
test("routes a URL and options once and returns the identical provider object", async () => {
  const signal = new AbortController().signal;
  const payload = { results: [{ unknown: true }, { unknown: true }], cursor: { bottom: "next" }, extra: 42 };
  let calls = 0;
  const service = new FeedService([platform], [{ id: "fake", platform: "example", get: async (url, options, context) => {
    calls++;
    assert.equal(url.href, "https://example.com/post/123?x=1");
    assert.deepEqual(options, { context: true, answers: true });
    assert.equal(context?.signal, signal);
    return payload;
  } }]);
  assert.equal(await service.show("https://example.com/post/123?x=1", { context: true, answers: true }, { signal }), payload);
  assert.equal(calls, 1);
});
test("rejects unsupported inputs, cancellation and ambiguous configuration", async () => {
  const service = new FeedService([platform], []);
  for (const input of ["123", "alice", "feeds://example/123", "https://unknown.test/123"]) {
    await assert.rejects(service.show(input), { code: "INVALID_INPUT" });
  }
  assert.throws(() => new FeedService([platform, platform], []), { code: "CONFIGURATION" });
  const provider = { id: "fake", platform: "example", get: async () => ({}) };
  assert.throws(() => new FeedService([platform], [provider, provider]), { code: "CONFIGURATION" });
  assert.throws(() => new FeedService([], [provider]), { code: "CONFIGURATION" });
  await assert.rejects(service.show("https://example.com/123"), { code: "CONFIGURATION" });
  await assert.rejects(service.show("https://example.com/123", {}, { signal: AbortSignal.abort() }), { code: "CANCELLED" });
});
