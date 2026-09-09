import assert from "node:assert/strict";
import test from "node:test";
import { XPlatform } from "../src/index.js";

test("normalizes known URL variants into the same platform identity", () => {
  const platform = new XPlatform();
  for (const host of ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]) {
    for (const path of ["/alice/status/123", "/bob/status/123/", "/i/web/status/123", "/alice/status/123/photo/1"]) {
      assert.deepEqual(platform.resolve(new URL(`https://${host}${path}?s=20#fragment`)), { kind: "post", platform: "x", id: "123" });
    }
  }
});

test("rejects unsafe or malformed X URLs and ignores foreign hosts", () => {
  const platform = new XPlatform();
  for (const url of ["ftp://x.com/a/status/123", "https://user:pass@x.com/a/status/123", "https://x.com:444/a/status/123", "https://x.com/a/status/no", "https://x.com/home", "https://x.com/a/status/123/anything", "https://x.com/a/status/123%2f456"]) {
    assert.throws(() => platform.resolve(new URL(url)), { code: "INVALID_INPUT" });
  }
  for (const host of ["x.com.evil.test", "localhost", "127.0.0.1", "fxtwitter.com"]) {
    assert.equal(platform.resolve(new URL(`https://${host}/a/status/123`)), undefined);
  }
});

test("recognizes author URLs and normalizes handles", () => {
  const platform = new XPlatform();
  for (const url of ["https://x.com/Alice", "https://twitter.com/ALICE/?s=20#bio"]) {
    assert.deepEqual(platform.resolve(new URL(url)), { kind: "author", platform: "x", handle: "alice" });
  }
  for (const path of ["/i", "/search", "/alice/likes", "/a%2fb", "/toolongusername123456"]) {
    assert.throws(() => platform.resolve(new URL(`https://x.com${path}`)), { code: "INVALID_INPUT" });
  }
});

test("interprets short internal references without provider identity", () => {
  const platform = new XPlatform();
  assert.deepEqual(platform.parseReference("123456"), { kind: "post", platform: "x", id: "123456" });
  assert.deepEqual(platform.parseReference("OpenAI"), { kind: "author", platform: "x", handle: "openai" });
  assert.deepEqual(platform.resolve(new URL("https://x.com/123456")), { kind: "author", platform: "x", handle: "123456" });
  for (const value of ["", "a/b", "a?b", "a#b", "home", "../alice", "a%2fb", "a".repeat(16)]) {
    assert.throws(() => platform.parseReference(value), { code: "INVALID_INPUT" }, value);
  }
  assert.throws(() => platform.formatReference({ kind: "post", platform: "x", id: "alice" }), { code: "INVALID_INPUT" });
  assert.throws(() => platform.formatReference({ kind: "author", platform: "other", handle: "alice" }), { code: "INVALID_INPUT" });
});
