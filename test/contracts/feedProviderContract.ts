import assert from "node:assert/strict";
import test from "node:test";
import { FeedError, type FeedPage, type FeedProvider } from "@edgestream/feeds-core";

export function feedProviderContract(create: () => FeedProvider, expected: FeedPage): void {
  test("provider contract: returns a feed page for a stable reference", async () => {
    const provider = create();
    const ref = { subject: { kind: "post" as const, platform: provider.platform, id: "1234567890123456789" } };
    assert.deepEqual(await provider.get(ref), expected);
    assert.deepEqual(await provider.get(ref), expected);
  });
  test("provider contract: rejects foreign references", async () => {
    await assert.rejects(create().get({ subject: { kind: "post", platform: "other", id: "123" } }), { code: "INVALID_INPUT" });
  });
  test("provider contract: supports cancellation", async () => {
    await assert.rejects(create().get({ subject: { kind: "post", platform: "x", id: "123" } }, { signal: AbortSignal.abort() }),
      error => error instanceof FeedError && error.code === "CANCELLED");
  });
}
