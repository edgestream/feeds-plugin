import assert from "node:assert/strict";
import test from "node:test";
import { feedUri, parseFeedUri } from "../src/index.js";

test("round-trips generic, encoded composite references", () => {
  for (const reference of ["123456", "MayoOhnePommes", "list/name", "a % ü ? #"]) {
    assert.deepEqual(parseFeedUri(feedUri("example", reference)), { platform: "example", reference });
  }
  for (const input of ["feeds://x", "feeds://x/", "feeds://x/a/b", "feeds://x/a?b", "feeds://x/a#b", "feeds://u@x/a", "feeds://x:3/a", "feeds://x/%", "feeds://x/..", "feeds://x/%2e", "https://x/a"]) {
    assert.throws(() => parseFeedUri(input), { code: "INVALID_INPUT" }, input);
  }
});
