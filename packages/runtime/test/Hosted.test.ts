import assert from "node:assert/strict";
import test from "node:test";
import { createHostedFxEmbedState, HostedFxEmbedPolicy } from "../src/index.js";

const limits = { timeoutMs: 100, maxRequestsPerPrincipal: 1, maxRequestsGlobal: 1, maxConcurrentPerPrincipal: 1, maxConcurrentGlobal: 1 };
test("hosted FxEmbed policy limits destinations and budgets without changing responses", async () => {
  let calls = 0;
  const state = createHostedFxEmbedState();
  const policy = new HostedFxEmbedPolicy({ issuer: "https://auth.example/", subject: "a" }, limits, async () => { calls++; return Response.json({ text: "x".repeat(9) }); }, state);
  await assert.rejects(policy.fetch("https://evil.example/2/status/1"));
  assert.equal(calls, 0);
  assert.deepEqual(await (await policy.fetch("https://api.fxtwitter.com/2/status/1")).json(), { text: "x".repeat(9) });
  assert.equal(calls, 1);
  await assert.rejects(policy.fetch("https://api.fxtwitter.com/2/status/2"), { code: "RATE_LIMITED" });
  assert.equal(calls, 1);
});

test("hosted budgets are disabled when their optional limits are absent", async () => {
  let calls = 0;
  const policy = new HostedFxEmbedPolicy({ issuer: "https://auth.example/", subject: "a" }, { timeoutMs: 100 }, async () => { calls++; return Response.json({ calls }); });
  assert.deepEqual(await (await policy.fetch("https://api.fxbsky.app/2/status/a/b")).json(), { calls: 1 });
  assert.deepEqual(await (await policy.fetch("https://api.fxbsky.app/2/status/a/b")).json(), { calls: 2 });
});
