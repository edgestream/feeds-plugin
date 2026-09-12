import assert from "node:assert/strict";
import test from "node:test";
import { FeedError, type JsonObject, type FeedProvider } from "@edgestream/feeds-core";

export function feedProviderContract(create: () => FeedProvider, expected: JsonObject, source = "https://x.com/alice/status/1234567890123456789"): void {
  test("provider contract: returns the complete JSON for a public URL", async () => {
    const provider = create();
    const ref = new URL(source);
    assert.deepEqual(await provider.get(ref), expected);
    assert.deepEqual(await provider.get(ref), expected);
  });
  test("provider contract: rejects foreign URLs", async () => {
    await assert.rejects(create().get(new URL("https://other.test/alice/status/123")), { code: "INVALID_INPUT" });
  });
  test("provider contract: supports cancellation", async () => {
    await assert.rejects(create().get(new URL(source), {}, { signal: AbortSignal.abort() }),
      error => error instanceof FeedError && error.code === "CANCELLED");
  });
}
