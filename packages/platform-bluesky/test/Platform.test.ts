import assert from "node:assert/strict";
import test from "node:test";
import { BlueskyPlatform } from "../src/index.js";
import { validBlueskyUrls, invalidBlueskyUrls } from "../../../test/contracts/blueskyUrls.js";

test("recognizes public Bluesky URLs and rejects invalid inputs on its host", () => {
  const platform = new BlueskyPlatform();
  assert.equal(platform.id, "bluesky");
  for (const source of validBlueskyUrls) assert.equal(platform.supports(new URL(source)), true, source);
  for (const source of invalidBlueskyUrls) {
    const url = new URL(source);
    if (url.hostname === "bsky.app") assert.throws(() => platform.supports(url), { code: "INVALID_INPUT" }, source);
    else assert.equal(platform.supports(url), false, source);
  }
});
