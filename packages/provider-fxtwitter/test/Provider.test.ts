import assert from "node:assert/strict";
import test from "node:test";
import { FxTwitterProvider } from "../src/index.js";
import { postProviderContract } from "../../../test/contracts/postProviderContract.js";

const payload = { code: 200, tweet: { text: "Hello 🌍", unknown: [null, true, { value: 42 }] }, extra: "preserved" };
const ref = { platform: "x", id: "1234567890123456789" };
postProviderContract(() => new FxTwitterProvider({ fetch: async () => Response.json(payload) }), payload);

test("uses only the v2 status endpoint with headers and redirects disabled", async () => {
  let calls = 0;
  const provider = new FxTwitterProvider({ fetch: async (url, options) => {
    calls++;
    assert.equal(url, `https://api.fxtwitter.com/2/status/${ref.id}`);
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("Accept"), "application/json");
    assert.ok(options?.signal);
    return Response.json(payload);
  } });
  assert.deepEqual(await provider.get(ref), payload);
  assert.equal(calls, 1);
  for (const id of ["../profile", "123?x=1", "https://localhost", ""]) {
    await assert.rejects(provider.get({ platform: "x", id }), { code: "INVALID_INPUT" });
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
  const request = new FxTwitterProvider({ fetch: pendingFetch }).get(ref, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { code: "CANCELLED" });
});

test("timeout covers a stalled response body", async () => {
  const provider = new FxTwitterProvider({ timeoutMs: 5, fetch: async (_url, options) => new Response(new ReadableStream({
    start(controller) { options?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true }); },
  })) });
  await assert.rejects(provider.get(ref), { code: "TIMEOUT" });
});
