import { FeedError, type JsonObject, type PostProvider, type PostRef, type RequestContext } from "@edgestream/feeds-core";

export interface FxTwitterOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export class FxTwitterProvider implements PostProvider {
  readonly id = "fxtwitter";
  readonly platform = "x";
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: FxTwitterOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 5 * 1024 * 1024;
    if (![this.timeoutMs, this.maxResponseBytes].every(value => Number.isSafeInteger(value) && value > 0) || this.timeoutMs > 2_147_483_647) {
      throw new FeedError("CONFIGURATION", "Request limits must be positive safe integers; timeout must fit a Node timer.");
    }
  }

  async get(ref: PostRef, context: RequestContext = {}): Promise<JsonObject> {
    if (ref.platform !== this.platform || !/^[0-9]+$/u.test(ref.id)) {
      throw new FeedError("INVALID_INPUT", "fxTwitter requires an X post reference with a numeric ID.");
    }
    if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    context.signal?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    let response: Response | undefined;
    try {
      response = await this.fetch(`https://api.fxtwitter.com/2/status/${ref.id}`, {
        headers: { Accept: "application/json", "User-Agent": "feeds-plugin/0.1.0 (read-only)" },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 404) throw new FeedError("NOT_FOUND", "fxTwitter could not find the post.");
      if (response.status === 429) throw new FeedError("RATE_LIMITED", "fxTwitter rate limit exceeded.");
      if (!response.ok) throw new FeedError("UPSTREAM", `fxTwitter returned HTTP ${response.status}.`);
      if (Number(response.headers.get("content-length")) > this.maxResponseBytes) {
        throw new FeedError("INVALID_RESPONSE", "fxTwitter response exceeds the size limit.");
      }
      if (!response.body) throw new FeedError("INVALID_RESPONSE", "fxTwitter returned an empty response.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > this.maxResponseBytes) throw new FeedError("INVALID_RESPONSE", "fxTwitter response exceeds the size limit.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
      catch (cause) { throw new FeedError("INVALID_RESPONSE", "fxTwitter returned invalid JSON.", { cause }); }
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new FeedError("INVALID_RESPONSE", "fxTwitter returned a non-object JSON response.");
      }
      return payload as JsonObject;
    } catch (cause) {
      if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause });
      if (timedOut) throw new FeedError("TIMEOUT", "fxTwitter request timed out.", { cause });
      if (cause instanceof FeedError) throw cause;
      throw new FeedError("UPSTREAM", "fxTwitter request failed.", { cause });
    } finally {
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", cancel);
      await response?.body?.cancel().catch(() => {});
    }
  }
}
