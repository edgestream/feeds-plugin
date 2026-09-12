import assert from "node:assert/strict";
import test from "node:test";
import { createFeed, readConfiguration } from "../src/index.js";

test("shares provider defaults and explicit environment configuration", async () => {
  assert.deepEqual(readConfiguration({}), { xProvider: "fxembed", blueskyProvider: "fxembed" });
  assert.deepEqual(readConfiguration({ FEEDS_X_PROVIDER: "other" }), { xProvider: "other", blueskyProvider: "fxembed" });
  for (const xProvider of ["", "other", "constructor"]) assert.throws(() => createFeed({ xProvider }), { code: "CONFIGURATION" });
  const payload = { status: { id: "123", text: "raw" } };
  assert.deepEqual(await createFeed(readConfiguration({}), { fetch: async () => Response.json(payload) }).show("https://x.com/alice/status/123"), payload);
});


test("composes independent X and Bluesky providers without cross-routing", async () => {
  assert.deepEqual(readConfiguration({ FEEDS_BLUESKY_PROVIDER: "custom" }), { xProvider: "fxembed", blueskyProvider: "custom" });
  for (const blueskyProvider of ["", "other", "constructor"]) assert.throws(() => createFeed({ xProvider: "fxembed", blueskyProvider }), { code: "CONFIGURATION" });
  const calls: string[] = [];
  const service = createFeed({ xProvider: "fxembed" }, { fetch: async url => { calls.push(String(url)); return Response.json({ raw: url }); } });
  for (const source of ["https://bsky.app/profile/bsky.app", "https://x.com/bsky", "https://bsky.app/profile/bsky.app/post/abc"]) await service.show(source);
  assert.deepEqual(calls, ["https://api.fxbsky.app/2/profile/bsky.app/statuses", "https://api.fxtwitter.com/2/profile/bsky/statuses", "https://api.fxbsky.app/2/status/bsky.app/abc"]);
});


test("rejects AT URIs and bare Bluesky identifiers at the application boundary", async () => {
  const service = createFeed({ xProvider: "fxembed" }, { fetch: async () => assert.fail("must not fetch") });
  for (const source of ["at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/abc", "alice.bsky.social", "did:plc:z72i7hdynmk6r22z27h6tvur"]) await assert.rejects(service.show(source), { code: "INVALID_INPUT" });
});
