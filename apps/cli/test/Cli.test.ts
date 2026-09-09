import assert from "node:assert/strict";
import test from "node:test";
import { FeedError } from "@edgestream/feeds-core";
import { runCli } from "../src/index.js";

test("prints the full JSON response and no diagnostics on success", async () => {
  let stdout = "", stderr = "";
  const payload = { posts: [] };
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

test("parses endpoint options before or after the URL and forwards cancellation", async () => {
  const signal = new AbortController().signal;
  for (const args of [
    ["show", "--context", "--answers", "url"],
    ["show", "url", "--answers", "--context"],
  ]) {
    assert.equal(await runCli(args, () => ({ show: async (input, options, context) => {
      assert.equal(input, "url");
      assert.deepEqual(options, { context: true, answers: true });
      assert.equal(context?.signal, signal);
      return { posts: [] };
    } }), { stdout: () => {}, stderr: () => assert.fail() }, { signal }), 0);
  }
  for (const args of [["show", "url", "--all"], ["show", "url", "--limit", "25"], ["show", "url", "--cursor"], ["show", "url", "--answers", "--answers"], ["show", "url", "--unknown"]]) {
    assert.equal(await runCli(args, () => assert.fail(), { stdout: () => assert.fail(), stderr: () => {} }), 2);
  }
});
