import assert from "node:assert/strict";
import test from "node:test";
import { XPlatform } from "../src/index.js";

test("recognizes supported URL variants", () => {
  const platform = new XPlatform();
  for (const host of ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]) {
    for (const path of ["/alice/status/123", "/bob/status/123/", "/i/web/status/123", "/alice/status/123/photo/1"]) {
      assert.deepEqual(platform.supports(new URL(`https://${host}${path}?s=20#fragment`)), true);
    }
  }
});

test("rejects unsafe or malformed X URLs and ignores foreign hosts", () => {
  const platform = new XPlatform();
  for (const url of ["ftp://x.com/a/status/123", "https://user:pass@x.com/a/status/123", "https://x.com:444/a/status/123", "https://x.com/a/status/no", "https://x.com/home", "https://x.com/a/status/123/anything", "https://x.com/a/status/123%2f456"]) {
    assert.throws(() => platform.supports(new URL(url)), { code: "INVALID_INPUT" });
  }
  for (const host of ["x.com.evil.test", "localhost", "127.0.0.1", "fxtwitter.com"]) {
    assert.equal(platform.supports(new URL(`https://${host}/a/status/123`)), false);
  }
});

test("recognizes author URLs", () => {
  const platform = new XPlatform();
  for (const url of ["https://x.com/Alice", "https://twitter.com/ALICE/?s=20#bio"]) {
    assert.deepEqual(platform.supports(new URL(url)), true);
  }
  for (const path of ["/i", "/search", "/alice/likes", "/a%2fb", "/toolongusername123456"]) {
    assert.throws(() => platform.supports(new URL(`https://x.com${path}`)), { code: "INVALID_INPUT" });
  }
});
