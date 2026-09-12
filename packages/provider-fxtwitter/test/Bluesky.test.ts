import assert from "node:assert/strict";
import test from "node:test";
import { FxBlueskyProvider } from "../src/index.js";
import { version } from "../src/version.js";
import { feedProviderContract } from "../../../test/contracts/feedProviderContract.js";

const payload = { code: 200, status: { id: "1234567890123456789", text: "Hello 🌍", unknown: [null, true, { value: 42 }] }, extra: "preserved" };
const ref = new URL("https://bsky.app/profile/alice.test/post/1234567890123456789");
const expected = payload;
feedProviderContract(() => new FxBlueskyProvider({ fetch: async () => Response.json(payload) }), expected, ref.href);

test("uses only the v2 status endpoint with headers and redirects disabled", async () => {
  let calls = 0;
  const provider = new FxBlueskyProvider({ fetch: async (url, options) => {
    calls++;
    assert.equal(url, `https://api.fxbsky.app/2/status/alice.test/1234567890123456789`);
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("Accept"), "application/json");
    assert.equal(new Headers(options?.headers).get("User-Agent"), `feeds-plugin/${version} (read-only)`);
    assert.equal(options?.signal, undefined);
    return Response.json(payload);
  } });
  assert.deepEqual(await provider.get(ref), expected);
  assert.equal(calls, 1);
  for (const input of ["https://localhost/a/status/123", "https://x.com/home", "https://user:pass@x.com/a/status/123", "https://x.com:444/a/status/123", "ftp://x.com/a/status/123", "https://x.com/a/status/123%2f456", "https://bsky.app/profile/alice.test/likes"]) {
    await assert.rejects(provider.get(new URL(input)), { code: "INVALID_INPUT" });
  }
  assert.equal(calls, 1);
});

test("maps HTTP errors without retries", async () => {
  for (const [status, code] of [[404, "NOT_FOUND"], [429, "RATE_LIMITED"], [500, "UPSTREAM"], [302, "UPSTREAM"]] as const) {
    let calls = 0;
    await assert.rejects(new FxBlueskyProvider({ fetch: async () => {
      calls++;
      return { status, ok: false, get body() { return assert.fail("must not read error body"); }, json: async () => assert.fail("must not parse error body") } as unknown as Response;
    } }).get(ref), { code });
    assert.equal(calls, 1);
  }
});

test("delegates parsing to response.json without inspecting the body or parsed result", async () => {
  const result = new Proxy({}, { ownKeys: () => assert.fail("must not iterate result"), get: (_target, key) => {
    if (key === "then") return undefined;
    assert.fail("must not inspect result");
  } });
  let reads = 0;
  const response = { status: 200, ok: true, json: async () => { reads++; return result; },
    get body() { return assert.fail("must not read body stream"); },
    get headers() { return assert.fail("must not inspect response headers"); } } as unknown as Response;
  assert.equal(await new FxBlueskyProvider({ fetch: async () => response }).get(ref), result);
  assert.equal(reads, 1);
});

test("uses native JSON parsing without response validation or byte limits", async () => {
  for (const value of [null, [], 123, "text", { text: "x".repeat(6 * 1024 * 1024) }]) {
    assert.deepEqual(await new FxBlueskyProvider({ fetch: async () => Response.json(value) }).get(ref), value);
  }
  await assert.rejects(new FxBlueskyProvider({ fetch: async () => new Response("{") }).get(ref), { code: "INVALID_RESPONSE" });
});

test("reports network failure and forwards caller cancellation directly", async () => {
  const original = new TypeError("network");
  await assert.rejects(new FxBlueskyProvider({ fetch: async () => { throw original; } }).get(ref), { code: "UPSTREAM", cause: original });
  const controller = new AbortController();
  const pendingFetch: typeof fetch = async (_url, options) => {
    assert.equal(options?.signal, controller.signal);
    return new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    });
  };
  const request = new FxBlueskyProvider({ fetch: pendingFetch }).get(ref, {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { code: "CANCELLED", cause: controller.signal.reason });
});

test("selects one endpoint and preserves envelopes, duplicates, groups and unknown structures", async () => {
  const payload = { code: 429, status: { type: "tombstone" }, thread: [{ id: 99, replying_to: { status: "unknown" } }],
    replies: [null, { id: "20" }, { id: "20" }], results: [{ type: "thread", statuses: [{ custom: true }] }],
    cursor: { bottom: "next", top: "previous" }, unknown: { url: "http://localhost/private" } };
  for (const [source, options, path] of [
    ["https://bsky.app/profile/alice.test/post/30", {}, "status/alice.test/30"],
    ["https://bsky.app/profile/alice.test/post/30/?x=1", { context: true }, "thread/alice.test/30"],
    ["https://bsky.app/profile/alice.test/post/30", { answers: true }, "conversation/alice.test/30"],
    ["https://bsky.app/profile/alice.test/post/30", { context: true, answers: true }, "conversation/alice.test/30"],
    ["https://bsky.app/profile/ALICE.test?cursor=ignored", {}, "profile/alice.test/statuses"],
    ["https://bsky.app/profile/ALICE.test?with_replies=1", { answers: false }, "profile/alice.test/statuses"],
    ["https://bsky.app/profile/ALICE.test?with_replies=0#ignored", { answers: true }, "profile/alice.test/statuses?with_replies=1"],
  ] as const) {
    let calls = 0;
    const provider = new FxBlueskyProvider({ fetch: async url => {
      calls++;
      assert.equal(url, `https://api.fxbsky.app/2/${path}`);
      return Response.json(payload);
    } });
    assert.deepEqual(await provider.get(new URL(source), options), payload);
    assert.equal(calls, 1);
  }
});

test("returns empty successful objects unchanged and treats HTTP 404 consistently", async () => {
  for (const payload of [{}, { results: [], cursor: null }]) {
    assert.deepEqual(await new FxBlueskyProvider({ fetch: async () => Response.json(payload) }).get(new URL("https://bsky.app/profile/alice.test")), payload);
  }
  await assert.rejects(new FxBlueskyProvider({ fetch: async () => Response.json({ results: [] }, { status: 404 }) }).get(new URL("https://bsky.app/profile/alice.test")), { code: "NOT_FOUND" });
  for (const options of [{ context: true }, { context: true, answers: true }]) {
    await assert.rejects(new FxBlueskyProvider({ fetch: async () => assert.fail("must not fetch") }).get(new URL("https://bsky.app/profile/alice.test"), options), { code: "INVALID_INPUT" });
  }
});

test("continues conversations with an opaque cursor and preserves each complete response", async () => {
  const cursor = "next+/=&ranking_mode=recency#% ü";
  const pages = [
    { replies: [{ id: "31" }], cursor: { bottom: cursor }, extra: [null, true] },
    { replies: [{ id: "32" }, { id: "32" }], cursor: null, extra: { preserved: true } },
  ];
  let calls = 0;
  const provider = new FxBlueskyProvider({ fetch: async input => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.fxbsky.app/2/conversation/alice.test/1234567890123456789");
    assert.deepEqual([...url.searchParams], calls ? [["cursor", cursor]] : []);
    return Response.json(pages[calls++]);
  } });
  assert.deepEqual(await provider.get(ref, { answers: true }), pages[0]);
  assert.deepEqual(await provider.get(ref, { answers: true, context: true, cursor }), pages[1]);
  assert.equal(calls, 2);
});

test("rejects malformed cursors and unsupported cursor endpoints before HTTP", async () => {
  const provider = new FxBlueskyProvider({ fetch: async () => assert.fail("must not fetch") });
  for (const options of [{ cursor: "next" }, { context: true, cursor: "next" }, { answers: true, cursor: "" }, { answers: true, cursor: 42 as unknown as string }]) {
    await assert.rejects(provider.get(ref, options), { code: "INVALID_INPUT" });
  }
  await assert.rejects(provider.get(new URL("https://bsky.app/profile/alice.test"), { cursor: "" }), { code: "INVALID_INPUT" });
});

test("continuation retains empty pages, body-level errors and HTTP failures", async () => {
  for (const payload of [{ replies: [], cursor: { bottom: "more" } }, { replies: [], cursor: null }, { code: 404, message: "unavailable" }]) {
    const provider = new FxBlueskyProvider({ fetch: async () => Response.json(payload) });
    assert.deepEqual(await provider.get(ref, { answers: true, cursor: "next" }), payload);
  }
  const provider = new FxBlueskyProvider({ fetch: async () => new Response(null, { status: 404 }) });
  await assert.rejects(provider.get(ref, { answers: true, cursor: "next" }), { code: "NOT_FOUND" });
});

test("continues author statuses with an encoded cursor and preserves duplicate entries", async () => {
  const cursor = "next+/=&count=1#%";
  const pages = [{ results: [{ id: "1" }], cursor: { bottom: cursor } }, { results: [{ id: "1" }, { id: "2" }], cursor: null }];
  let calls = 0;
  const provider = new FxBlueskyProvider({ fetch: async input => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.fxbsky.app/2/profile/openai.test/statuses");
    assert.deepEqual([...url.searchParams], calls ? [["cursor", cursor]] : []);
    return Response.json(pages[calls++]);
  } });
  const source = new URL("https://bsky.app/profile/OpenAI.test?cursor=ignored");
  assert.deepEqual(await provider.get(source), pages[0]);
  assert.deepEqual(await provider.get(source, { cursor }), pages[1]);
  assert.equal(calls, 2);
  for (const options of [{ cursor, context: true }, { cursor, context: true, answers: true }]) {
    await assert.rejects(provider.get(source, options), { code: "INVALID_INPUT" });
  }
  assert.equal(calls, 2);
});

test("continues authored replies without filtering mixed timeline results", async () => {
  const cursor = "next+/=&with_replies=0#% ü";
  const reply = { id: "2", replying_to: { status: "1" } };
  const pages = [
    { results: [{ id: "1" }, reply, reply, { type: "thread", statuses: [reply] }], cursor: { bottom: cursor }, extra: true },
    { results: [], cursor: { bottom: "more" } },
  ];
  let calls = 0;
  const provider = new FxBlueskyProvider({ fetch: async input => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.fxbsky.app/2/profile/alice.test/statuses");
    assert.deepEqual([...url.searchParams], [["with_replies", "1"], ...(calls ? [["cursor", cursor]] : [])]);
    return Response.json(pages[calls++]);
  } });
  const source = new URL("https://bsky.app/profile/ALICE.test?cursor=ignored");
  assert.deepEqual(await provider.get(source, { answers: true }), pages[0]);
  assert.deepEqual(await provider.get(source, { answers: true, cursor }), pages[1]);
  assert.equal(calls, 2);
  await assert.rejects(provider.get(source, { answers: true, cursor: "" }), { code: "INVALID_INPUT" });
  await assert.rejects(provider.get(new URL("https://x.com.evil.test/alice"), { answers: true }), { code: "INVALID_INPUT" });
  assert.equal(calls, 2);
});

import { validBlueskyUrls, invalidBlueskyUrls } from "../../../test/contracts/blueskyUrls.js";

test("independently validates public URLs and encodes actor and record key", async () => {
  const paths = ["profile/bsky.app/statuses", "profile/alice.bsky.social/statuses", "status/xn--bcher-kva.example/AbC_~%3A.-09", "profile/did%3Aplc%3Az72i7hdynmk6r22z27h6tvur/statuses", "status/did%3Aplc%3Az72i7hdynmk6r22z27h6tvur/3l6xyz", "status/did%3Aweb%3AExample.com/AbC"];
  let calls = 0;
  const provider = new FxBlueskyProvider({ fetch: async url => {
    assert.equal(url, "https://api.fxbsky.app/2/" + paths[calls++]);
    return Response.json(payload);
  } });
  assert.equal(provider.id, "fxtwitter");
  assert.equal(provider.platform, "bluesky");
  for (const source of validBlueskyUrls) await provider.get(new URL(source));
  for (const source of invalidBlueskyUrls) await assert.rejects(provider.get(new URL(source)), { code: "INVALID_INPUT" }, source);
  assert.equal(calls, validBlueskyUrls.length);
});
