import assert from "node:assert/strict";
import test from "node:test";
import { FxTwitterProvider } from "../src/index.js";
import { feedProviderContract } from "../../../test/contracts/feedProviderContract.js";

const payload = { code: 200, status: { id: "1234567890123456789", text: "Hello 🌍", unknown: [null, true, { value: 42 }] }, extra: "preserved" };
const ref = { subject: { kind: "post" as const, platform: "x", id: "1234567890123456789" } };
const expected = { posts: [{ ref: ref.subject, data: payload.status }] };
feedProviderContract(() => new FxTwitterProvider({ fetch: async () => Response.json(payload) }), expected);

test("uses only the v2 status endpoint with headers and redirects disabled", async () => {
  let calls = 0;
  const provider = new FxTwitterProvider({ fetch: async (url, options) => {
    calls++;
    assert.equal(url, `https://api.fxtwitter.com/2/status/${ref.subject.id}`);
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("Accept"), "application/json");
    assert.ok(options?.signal);
    return Response.json(payload);
  } });
  assert.deepEqual(await provider.get(ref), expected);
  assert.equal(calls, 1);
  for (const id of ["../profile", "123?x=1", "https://localhost", ""]) {
    await assert.rejects(provider.get({ subject: { kind: "post", platform: "x", id } }), { code: "INVALID_INPUT" });
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

const post = (id: string, parent?: string) => ({ type: "status", id, text: id,
  ...(parent ? { replying_to: { status: parent, screen_name: "alice" } } : {}) });
const query = (scope = {}) => ({ subject: { kind: "post" as const, platform: "x", id: "30" }, scope });

test("selects ancestors and focal descendants without including ancestor side branches", async () => {
  for (const [scope, endpoint, ids] of [
    [{ ancestors: true }, "thread", ["30", "10", "20"]],
    [{ replies: true }, "conversation", ["30", "40", "50", "70"]],
    [{ ancestors: true, replies: true }, "conversation", ["30", "10", "20", "40", "50", "70"]],
  ] as const) {
    const provider = new FxTwitterProvider({ fetch: async url => {
      assert.equal(url, `https://api.fxtwitter.com/2/${endpoint}/30`);
      return Response.json({ status: post("30", "20"), thread: [post("10", "5"), post("20", "10"), post("30", "20")],
        replies: [post("40", "30"), post("50", "40"), post("60", "10"), post("70", "65")], cursor: { bottom: "next" } });
    } });
    const page = await provider.get(query(scope));
    assert.deepEqual(page.posts.map(p => p.ref.id), ids);
    assert.equal(page.posts[0]?.parent?.id, "20");
    assert.equal(page.nextCursor, "replies" in scope ? "next" : undefined);
  }
});

test("reads author pages, flattens grouped threads, preserves data and encodes cursors", async () => {
  const data = { ...post("20", "10"), url: "http://localhost/private", custom: { preserved: true } };
  const provider = new FxTwitterProvider({ fetch: async url => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://api.fxtwitter.com");
    assert.equal(parsed.pathname, "/2/profile/alice/statuses");
    assert.equal(parsed.searchParams.get("count"), "10");
    assert.equal(parsed.searchParams.get("cursor"), "x&url=http://localhost");
    return Response.json({ results: [{ type: "thread", statuses: [post("10"), data] }, data], cursor: { bottom: "next" } });
  } });
  const page = await provider.get({ subject: { kind: "author", platform: "x", handle: "alice" }, limit: 10, cursor: "x&url=http://localhost" });
  assert.equal(page.posts.length, 2);
  assert.deepEqual(page.posts[1]?.data, data);
  assert.equal(page.nextCursor, "next");
});

test("supports empty author feeds, including the upstream empty-timeline 404", async () => {
  for (const status of [200, 404]) {
    const provider = new FxTwitterProvider({ fetch: async () => Response.json({ code: status, results: [], cursor: null }, { status }) });
    assert.deepEqual(await provider.get({ subject: { kind: "author", platform: "x", handle: "alice" } }), { posts: [] });
  }
});

test("rejects malformed feed structure and application errors", async () => {
  for (const payload of [
    { status: post("99") }, { status: { id: 30 } },
    { status: post("30", "https://localhost") },
    { status: post("30"), thread: {}, replies: [] },
    { status: post("30"), thread: [], replies: [null] },
    { status: post("30"), thread: [], replies: [], cursor: { bottom: 42 } },
    { status: post("30", "20"), thread: [post("20", "30")], replies: [] },
  ]) {
    const provider = new FxTwitterProvider({ fetch: async () => Response.json(payload) });
    await assert.rejects(provider.get(query({ ancestors: true, replies: true })), { code: "INVALID_RESPONSE" });
  }
  await assert.rejects(new FxTwitterProvider({ fetch: async () => Response.json({ code: 429 }) }).get(query()), { code: "RATE_LIMITED" });
});

test("rejects unsafe subjects and incompatible options before HTTP", async () => {
  const provider = new FxTwitterProvider({ fetch: async () => assert.fail("must not fetch") });
  for (const handle of ["../status/123", "alice?x=1", "https://localhost", ""]) {
    await assert.rejects(provider.get({ subject: { kind: "author", platform: "x", handle } }), { code: "INVALID_INPUT" });
  }
  await assert.rejects(provider.get({ ...query(), cursor: "next" }), { code: "INVALID_INPUT" });
  await assert.rejects(provider.get({ ...query(), limit: 10 }), { code: "INVALID_INPUT" });
  for (const limit of [0, 101, 1.5]) {
    await assert.rejects(provider.get({ subject: { kind: "author", platform: "x", handle: "alice" }, limit }), { code: "INVALID_INPUT" });
  }
  await assert.rejects(provider.get({ subject: { kind: "author", platform: "x", handle: "alice" }, scope: { replies: true } }), { code: "INVALID_INPUT" });
});

test("retains received bytes, original causes and abort reasons", async () => {
  const original = new TypeError("transport evidence", { cause: new Error("socket evidence") });
  await assert.rejects(new FxTwitterProvider({ fetch: async () => { throw original; } }).get(ref), (error: any) => {
    assert.equal(error.cause, original);
    assert.equal(error.diagnostics.endpoint, `https://api.fxtwitter.com/2/status/${ref.subject.id}`);
    return true;
  });
  for (const cancelled of [false, true]) {
    const controller = new AbortController();
    const reason = new Error("caller evidence");
    const provider = new FxTwitterProvider({ timeoutMs: 5, fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(original), { once: true });
      if (cancelled) controller.abort(reason);
    }) });
    await assert.rejects(provider.get(ref, { signal: controller.signal }), (error: any) => {
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
