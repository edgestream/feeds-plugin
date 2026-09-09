import { FeedError, type JsonObject, type FeedProvider, type FeedOptions, type RequestContext } from "@edgestream/feeds-core";

export interface FxTwitterOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export class FxTwitterProvider implements FeedProvider {
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

  async get(url: URL, options: FeedOptions = {}, context: RequestContext = {}): Promise<JsonObject> {
    const post = /^\/(?:[a-zA-Z0-9_]{1,15}|i\/web)\/status\/([0-9]+)(?:\/(?:photo|video)\/[1-9][0-9]*)?\/?$/u.exec(url.pathname);
    const author = /^\/([a-zA-Z0-9_]{1,15})\/?$/u.exec(url.pathname);
    const hosts = ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"];
    const reserved = ["home", "explore", "search", "notifications", "messages", "settings", "i", "intent", "compose", "login", "logout", "signup", "tos", "privacy"];
    if (!hosts.includes(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port ||
        (!post && (!author || reserved.includes(author[1]!.toLowerCase())))) {
      throw new FeedError("INVALID_INPUT", "Expected a public X post or profile URL.");
    }
    if (!post && (options.context || options.answers)) throw new FeedError("INVALID_INPUT", "Context and answers require a post URL.");
    const path = post
      ? `${options.answers ? "conversation" : options.context ? "thread" : "status"}/${post[1]}`
      : `profile/${author![1]!.toLowerCase()}/statuses`;
    return this.request(path, context);
  }

  private async request(path: string, context: RequestContext): Promise<JsonObject> {
    if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause: context.signal.reason });
    const controller = new AbortController();
    const cancel = () => controller.abort(context.signal?.reason);
    context.signal?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    let response: Response | undefined;
    const diagnostics: Record<string, unknown> = { endpoint: `https://api.fxtwitter.com/2/${path}` };
    const chunks: Uint8Array[] = [];
    try {
      response = await this.fetch(diagnostics.endpoint as string, {
        headers: { Accept: "application/json", "User-Agent": "feeds-plugin/0.1.0 (read-only)" },
        redirect: "error",
        signal: controller.signal,
      });
      Object.assign(diagnostics, { status: response.status, statusText: response.statusText,
        headers: Object.fromEntries(response.headers), body: "" });
      if (Number(response.headers.get("content-length")) > this.maxResponseBytes) {
        diagnostics.bodyOmitted = "Declared content-length exceeds response byte limit.";
        throw new FeedError("INVALID_RESPONSE", "fxTwitter response exceeds the size limit.");
      }
      if (!response.body) throw new FeedError("INVALID_RESPONSE", "fxTwitter returned an empty response.");
      const reader = response.body.getReader();
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const remaining = this.maxResponseBytes - size;
          chunks.push(Uint8Array.from(value.subarray(0, remaining)));
          size += value.byteLength;
          if (size > this.maxResponseBytes) {
            diagnostics.bodyTruncated = `Response exceeds ${this.maxResponseBytes} bytes.`;
            throw new FeedError("INVALID_RESPONSE", "fxTwitter response exceeds the size limit.");
          }
        }
      } finally {
        await reader.cancel().catch(error => { diagnostics.cleanupFailure = error; });
        reader.releaseLock();
      }
      if (response.status === 404) throw new FeedError("NOT_FOUND", "fxTwitter returned HTTP 404.");
      if (response.status === 429) throw new FeedError("RATE_LIMITED", "fxTwitter rate limit exceeded.");
      if (!response.ok) throw new FeedError("UPSTREAM", `fxTwitter returned HTTP ${response.status}.`);
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
      catch (cause) { throw new FeedError("INVALID_RESPONSE", "fxTwitter returned invalid JSON.", { cause }); }
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new FeedError("INVALID_RESPONSE", "fxTwitter returned a non-object JSON response.");
      }
      return payload as JsonObject;
    } catch (cause) {
      if (response) {
        const bytes = Buffer.concat(chunks);
        try { diagnostics.body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
        catch { diagnostics.bodyBase64 = bytes.toString("base64"); diagnostics.bodyEncoding = "base64 (invalid UTF-8)"; }
        if (!(cause instanceof FeedError)) diagnostics.bodyIncomplete = "Body retrieval failed; only received bytes are included.";
      }
      diagnostics.abortReason = controller.signal.aborted ? controller.signal.reason : undefined;
      if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause, diagnostics });
      if (timedOut) throw new FeedError("TIMEOUT", "fxTwitter request timed out.", { cause, diagnostics });
      if (cause instanceof FeedError) throw new FeedError(cause.code, cause.message, { cause, diagnostics });
      throw new FeedError("UPSTREAM", "fxTwitter request failed.", { cause, diagnostics });
    } finally {
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", cancel);
      await response?.body?.cancel().catch(() => {});
    }
  }
}
