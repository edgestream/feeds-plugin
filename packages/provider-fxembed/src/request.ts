import { FeedError, type JsonObject, type RequestContext } from "@edgestream/feeds-core";
import { version } from "./version.js";

export async function request(fetch: typeof globalThis.fetch, platform: "x" | "bluesky", path: string, context: RequestContext): Promise<JsonObject> {
  const label = platform === "x" ? "FxEmbed X API" : "FxEmbed Bluesky API";
  if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause: context.signal.reason });
  try {
    const response = await fetch(`${platform === "x" ? "https://api.fxtwitter.com" : "https://api.fxbsky.app"}/2/${path}`, {
      headers: { Accept: "application/json", "User-Agent": `feeds-plugin/${version} (read-only)` },
      redirect: "error",
      ...(context.signal ? { signal: context.signal } : {}),
    });
    if (response.status === 404) throw new FeedError("NOT_FOUND", `${label} returned HTTP 404.`);
    if (response.status === 429) throw new FeedError("RATE_LIMITED", `${label} returned HTTP 429.`);
    if (!response.ok) throw new FeedError("UPSTREAM", `${label} returned HTTP ${response.status}.`);
    return await response.json();
  } catch (cause) {
    if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause });
    if (cause instanceof FeedError) throw cause;
    if (cause instanceof SyntaxError) throw new FeedError("INVALID_RESPONSE", cause.message, { cause });
    throw new FeedError("UPSTREAM", cause instanceof Error ? cause.message : `${label} request failed.`, { cause });
  }
}
