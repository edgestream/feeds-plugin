import assert from "node:assert/strict";
import test from "node:test";
import { FeedError } from "@edgestream/feeds-core";
import { runCli } from "../src/index.js";

test("prints the full JSON response and no diagnostics on success", async () => {
  let stdout = "", stderr = "";
  const payload = { nested: { text: "Hello 🌍" }, unknown: [1, null, true] };
  const code = await runCli(["show", "https://x.com/a/status/123"], () => ({ show: async input => {
    assert.equal(input, "https://x.com/a/status/123"); return payload;
  } }), { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout), payload);
  assert.equal(stderr, "");
});

test("invalid commands never construct the runtime", async () => {
  for (const args of [[], ["show"], ["list"], ["show", "url", "extra"], ["show", "--context"]]) {
    let diagnostic = "";
    assert.equal(await runCli(args, () => { throw new Error("must not run"); }, { stdout: () => assert.fail(), stderr: text => { diagnostic = text; } }), 2);
    assert.match(diagnostic, /INVALID_INPUT/u);
  }
});

test("prints structured failures only to stderr", async () => {
  for (const [code, exit] of [["NOT_FOUND", 1], ["CANCELLED", 130], ["INVALID_INPUT", 2]] as const) {
    let diagnostic = "";
    assert.equal(await runCli(["show", "url"], () => ({ show: async () => { throw new FeedError(code, "failure"); } }), { stdout: () => assert.fail(), stderr: text => { diagnostic = text; } }), exit);
    assert.equal(diagnostic, `${code}: failure\n`);
  }
});
