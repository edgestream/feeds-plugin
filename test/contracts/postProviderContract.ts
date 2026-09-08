import assert from "node:assert/strict";
import test from "node:test";
import { FeedsError, type JsonObject, type PostProvider } from "@edgestream/feeds-core";

export function postProviderContract(create: () => PostProvider, expected: JsonObject): void {
  test("provider contract: returns the complete response for a stable reference", async () => {
    const provider = create();
    const ref = { platform: provider.platform, id: "1234567890123456789" };
    assert.deepEqual(await provider.get(ref), expected);
    assert.deepEqual(await provider.get(ref), expected);
  });
  test("provider contract: rejects foreign references", async () => {
    await assert.rejects(create().get({ platform: "other", id: "123" }), { code: "INVALID_INPUT" });
  });
  test("provider contract: supports cancellation", async () => {
    await assert.rejects(create().get({ platform: "x", id: "123" }, { signal: AbortSignal.abort() }),
      error => error instanceof FeedsError && error.code === "CANCELLED");
  });
}
