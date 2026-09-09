import assert from "node:assert/strict";
import test from "node:test";
import { FxTwitterProvider } from "../src/index.js";
import { feedProviderContract } from "../../../test/contracts/feedProviderContract.js";

const payload = { code: 200, status: { id: "1234567890123456789", text: "Hello 🌍", unknown: [null, true, { value: 42 }] }, extra: "preserved" };
const ref = new URL("https://x.com/alice/status/1234567890123456789");
const expected = payload;
feedProviderContract(() => new FxTwitterProvider({ fetch: async () => Response.json(payload) }), expected);

test("uses only the v2 status endpoint with headers and redirects disabled", async () => {
  let calls = 0;
  const provider = new FxTwitterProvider({ fetch: async (url, options) => {
    calls++;
    assert.equal(url, `https://api.fxtwitter.com/2/status/1234567890123456789`);
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("Accept"), "application/json");
    assert.ok(options?.signal);
    return Response.json(payload);
  } });
  assert.deepEqual(await provider.get(ref), expected);
  assert.equal(calls, 1);
  for (const input of ["https://localhost/a/status/123", "https://x.com/home", "https://user:pass@x.com/a/status/123", "https://x.com:444/a/status/123", "ftp://x.com/a/status/123", "https://x.com/a/status/123%2f456", "https://x.com/alice/likes"]) {
    await assert.rejects(provider.get(new URL(input)), { code: "INVALID_INPUT" });
  }
  assert.equal(calls, 1);
});

test("maps HTTP errors without retries", async () => {
  for (const [status, code] of [[404, "NOT_FOUND"], [429, "RATE_LIMITED"], [500, "UPSTREAM"], [302, "UPSTREAM"]] as const) {
    let calls = 0;
    await assert.rejects(new FxTwitterProvider({ fetch: async () => {
      calls++;
      return new Response("failure", { status });
    } }).get(ref), { code });
    assert.equal(calls, 1);
  }
});

test("rejects malformed or non-object JSON", async () => {
  for (const body of ["{", "null", "[]", "123", '"text"']) {
    await assert.rejects(new FxTwitterProvider({ fetch: async () => new Response(body) }).get(ref), { code: "INVALID_RESPONSE" });
  }
});

test("limits both declared and streamed response sizes", async () => {
  for (const headers of [{}, { "content-length": "10000" }]) {
    await assert.rejects(new FxTwitterProvider({ maxResponseBytes: 8, fetch: async () => new Response(JSON.stringify(payload), { headers }) }).get(ref), { code: "INVALID_RESPONSE" });
  }
});

test("reports network failure, timeout, and cancellation separately", async () => {
  await assert.rejects(new FxTwitterProvider({ fetch: async () => { throw new TypeError("network"); } }).get(ref), { code: "UPSTREAM" });
  const pendingFetch: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await assert.rejects(new FxTwitterProvider({ fetch: pendingFetch, timeoutMs: 5 }).get(ref), { code: "TIMEOUT" });
  const controller = new AbortController();
  const request = new FxTwitterProvider({ fetch: pendingFetch }).get(ref, {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { code: "CANCELLED" });
});

test("timeout covers a stalled response body", async () => {
  const provider = new FxTwitterProvider({ timeoutMs: 5, fetch: async (_url, options) => new Response(new ReadableStream({
    start(controller) { options?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true }); },
  })) });
  await assert.rejects(provider.get(ref), { code: "TIMEOUT" });
});

test("selects one endpoint and preserves envelopes, duplicates, groups and unknown structures", async () => {
  const payload = { code: 429, status: { type: "tombstone" }, thread: [{ id: 99, replying_to: { status: "unknown" } }],
    replies: [null, { id: "20" }, { id: "20" }], results: [{ type: "thread", statuses: [{ custom: true }] }],
    cursor: { bottom: "next", top: "previous" }, unknown: { url: "http://localhost/private" } };
  for (const [source, options, path] of [
    ["https://x.com/alice/status/30", {}, "status/30"],
    ["https://x.com/alice/status/30/photo/1?x=1", { context: true }, "thread/30"],
    ["https://twitter.com/i/web/status/30", { answers: true }, "conversation/30"],
    ["https://x.com/alice/status/30", { context: true, answers: true }, "conversation/30"],
    ["https://x.com/ALICE?cursor=ignored", {}, "profile/alice/statuses"],
  ] as const) {
    let calls = 0;
    const provider = new FxTwitterProvider({ fetch: async url => {
      calls++;
      assert.equal(url, `https://api.fxtwitter.com/2/${path}`);
      return Response.json(payload);
    } });
    assert.deepEqual(await provider.get(new URL(source), options), payload);
    assert.equal(calls, 1);
  }
});

test("returns empty successful objects unchanged and treats HTTP 404 consistently", async () => {
  for (const payload of [{}, { results: [], cursor: null }]) {
    assert.deepEqual(await new FxTwitterProvider({ fetch: async () => Response.json(payload) }).get(new URL("https://x.com/alice")), payload);
  }
  await assert.rejects(new FxTwitterProvider({ fetch: async () => Response.json({ results: [] }, { status: 404 }) }).get(new URL("https://x.com/alice")), { code: "NOT_FOUND" });
  for (const options of [{ context: true }, { answers: true }]) {
    await assert.rejects(new FxTwitterProvider({ fetch: async () => assert.fail("must not fetch") }).get(new URL("https://x.com/alice"), options), { code: "INVALID_INPUT" });
  }
});

test("retains received bytes, original causes and abort reasons", async () => {
  const original = new TypeError("transport evidence", { cause: new Error("socket evidence") });
  await assert.rejects(new FxTwitterProvider({ fetch: async () => { throw original; } }).get(ref), (error: any) => {
    assert.equal(error.cause, original);
    assert.equal(error.diagnostics.endpoint, `https://api.fxtwitter.com/2/status/1234567890123456789`);
    return true;
  });
  for (const cancelled of [false, true]) {
    const controller = new AbortController();
    const reason = new Error("caller evidence");
    const provider = new FxTwitterProvider({ timeoutMs: 5, fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(original), { once: true });
      if (cancelled) controller.abort(reason);
    }) });
    await assert.rejects(provider.get(ref, {}, { signal: controller.signal }), (error: any) => {
      assert.equal(error.code, cancelled ? "CANCELLED" : "TIMEOUT");
      assert.equal(error.cause, original);
      if (cancelled) assert.equal(error.diagnostics.abortReason, reason);
      return true;
    });
  }
  await assert.rejects(new FxTwitterProvider({ maxResponseBytes: 4, fetch: async () => new Response("12345678") }).get(ref), (error: any) => {
    assert.equal(error.diagnostics.body, "1234");
    assert.match(error.diagnostics.bodyTruncated, /4 bytes/);
    return true;
  });
});
