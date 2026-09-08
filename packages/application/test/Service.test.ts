import assert from "node:assert/strict";
import test from "node:test";
import { FeedsService } from "../src/index.js";

test("routes platform identity to the selected interchangeable provider and preserves its payload", async () => {
  const platform = { id: "example", resolve: () => ({ platform: "example", id: "123" }) };
  const signal = new AbortController().signal;
  for (const id of ["first", "replacement"]) {
    const payload = { providerSpecific: id };
    const service = new FeedsService([platform], [{ id, platform: "example", get: async (ref, context) => {
      assert.deepEqual(ref, { platform: "example", id: "123" });
      assert.equal(context?.signal, signal);
      return payload;
    } }]);
    assert.equal(await service.show("https://example.com/post/123", { signal }), payload);
  }
});

test("rejects invalid inputs and ambiguous configuration", async () => {
  const service = new FeedsService([], []);
  await assert.rejects(service.show("123"), { code: "INVALID_INPUT" });
  await assert.rejects(service.show("https://unknown.test/post/123"), { code: "INVALID_INPUT" });
  const platform = { id: "x", resolve: () => ({ platform: "x", id: "123" }) };
  assert.throws(() => new FeedsService([platform, platform], []), { code: "CONFIGURATION" });
  await assert.rejects(new FeedsService([platform], []).show("https://x.com/a/status/123"), { code: "CONFIGURATION" });
});
