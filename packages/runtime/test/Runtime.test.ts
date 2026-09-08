import assert from "node:assert/strict";
import test from "node:test";
import { createFeeds, readConfiguration } from "../src/index.js";

test("shares provider defaults and explicit environment configuration", async () => {
  assert.deepEqual(readConfiguration({}), { xProvider: "fxtwitter" });
  assert.deepEqual(readConfiguration({ FEEDS_X_PROVIDER: "other" }), { xProvider: "other" });
  for (const xProvider of ["", "other", "constructor"]) assert.throws(() => createFeeds({ xProvider }), { code: "CONFIGURATION" });
  const payload = { arbitrary: "raw" };
  assert.deepEqual(await createFeeds(readConfiguration({}), { fetch: async () => Response.json(payload) }).show("https://x.com/alice/status/123"), payload);
});
