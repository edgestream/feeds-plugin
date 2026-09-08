import assert from "node:assert/strict";
import test from "node:test";
import { createFeed, readConfiguration } from "../src/index.js";

test("shares provider defaults and explicit environment configuration", async () => {
  assert.deepEqual(readConfiguration({}), { xProvider: "fxtwitter" });
  assert.deepEqual(readConfiguration({ FEEDS_X_PROVIDER: "other" }), { xProvider: "other" });
  for (const xProvider of ["", "other", "constructor"]) assert.throws(() => createFeed({ xProvider }), { code: "CONFIGURATION" });
  const payload = { status: { id: "123", text: "raw" } };
  assert.deepEqual(await createFeed(readConfiguration({}), { fetch: async () => Response.json(payload) }).show("https://x.com/alice/status/123"), { posts: [{ ref: { kind: "post", platform: "x", id: "123" }, data: payload.status }] });
});
