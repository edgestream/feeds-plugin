import { FeedError, type JsonObject, type FeedProvider, type FeedQuery, type FeedPage, type FeedPost, type RequestContext } from "@edgestream/feeds-core";

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

  async get(query: FeedQuery, context: RequestContext = {}): Promise<FeedPage> {
    const { subject, scope = {}, cursor, limit } = query;
    if (subject.platform !== this.platform ||
        (subject.kind === "post" ? !/^[0-9]+$/u.test(subject.id) :
          subject.kind !== "author" || !/^[a-zA-Z0-9_]{1,15}$/u.test(subject.handle))) {
      throw new FeedError("INVALID_INPUT", "fxTwitter requires a valid X post or author reference.");
    }
    const paginated = subject.kind === "author" || scope.replies;
    if ((cursor !== undefined && (!paginated || typeof cursor !== "string" || !cursor || cursor.length > 16384)) ||
        (limit !== undefined && (subject.kind !== "author" || !Number.isInteger(limit) || limit < 1 || limit > 100)) ||
        (subject.kind === "author" && (scope.ancestors || scope.replies))) {
      throw new FeedError("INVALID_INPUT", "Context and answers require a post; limit requires an author; cursor requires a paginated feed.");
    }
    const path = subject.kind === "author" ? `profile/${subject.handle}/statuses` :
      `${scope.replies ? "conversation" : scope.ancestors ? "thread" : "status"}/${subject.id}`;
    const params = new URLSearchParams();
    if (subject.kind === "author") params.set("count", String(limit ?? 25));
    if (cursor) params.set("cursor", cursor);
    const { payload, diagnostics } = await this.request(`${path}${params.size ? `?${params}` : ""}`, context, subject.kind === "author");
    try {
      const posts = new Map<string, FeedPost>();
      const add = (value: unknown, fallbackId?: string): void => {
        if (!isObject(value)) invalid("Expected a post object.");
        const id = value.id ?? (value.type === "tombstone" ? fallbackId : undefined);
        if (typeof id !== "string" || !/^[0-9]+$/u.test(id)) invalid("Expected a numeric post ID.");
        let parent: FeedPost["parent"];
        if (value.replying_to != null) {
          const reply = value.replying_to;
          if (!isObject(reply) || typeof reply.status !== "string" || !/^[0-9]+$/u.test(reply.status) || reply.status === id) invalid("Invalid reply relationship.");
          parent = { kind: "post", platform: "x", id: reply.status };
        }
        posts.set(id, { ref: { kind: "post", platform: "x", id }, ...(parent ? { parent } : {}), data: value });
      };
      const addList = (value: unknown): void => {
        if (!Array.isArray(value)) invalid("Expected a post list.");
        for (const entry of value) {
          if (isObject(entry) && entry.type === "thread") {
            if (!Array.isArray(entry.statuses)) invalid("Expected thread statuses.");
            for (const status of entry.statuses) add(status);
          } else add(entry);
        }
      };
      if (subject.kind === "author") addList(payload.results);
      else {
        if (payload.status == null) throw new FeedError("NOT_FOUND", "fxTwitter returned no focal post.");
        add(payload.status, subject.id);
        if (!posts.has(subject.id)) invalid("The focal post does not match the requested ID.");
        if (scope.ancestors || scope.replies) {
          if (payload.thread !== null) addList(payload.thread);
        }
        const replyIds = new Set<string>();
        if (scope.replies && payload.replies !== null) {
          if (!Array.isArray(payload.replies)) invalid("Expected replies.");
          for (const reply of payload.replies) {
            add(reply);
            replyIds.add((reply as JsonObject).id as string);
          }
        }
        // Keep only the requested ancestor chain and descendants of the focal post.
        const selected = new Set([subject.id]);
        const ancestors = new Set<string>();
        {
          let current = posts.get(subject.id)?.parent?.id;
          while (current && posts.has(current)) {
            if (current === subject.id || ancestors.has(current)) invalid("Cyclic reply relationship.");
            ancestors.add(current);
            if (scope.ancestors) selected.add(current);
            current = posts.get(current)?.parent?.id;
          }
        }
        if (scope.replies) {
          for (const post of posts.values()) {
            const visited = new Set<string>();
            let current: string | undefined = post.ref.id;
            while (current && current !== subject.id && !ancestors.has(current) && posts.has(current)) {
              if (visited.has(current)) invalid("Cyclic reply relationship.");
              visited.add(current);
              current = posts.get(current)?.parent?.id;
            }
            // A missing parent is valid on a later reply page; the endpoint supplies reply membership.
            if (current === subject.id || (replyIds.has(post.ref.id) && current && !posts.has(current))) selected.add(post.ref.id);
          }
        }
        for (const id of posts.keys()) if (!selected.has(id)) posts.delete(id);
      }
      let nextCursor: string | undefined;
      if (paginated && payload.cursor != null) {
        if (!isObject(payload.cursor) || (payload.cursor.bottom != null && typeof payload.cursor.bottom !== "string")) invalid("Invalid pagination cursor.");
        nextCursor = payload.cursor.bottom as string | undefined;
      }
      return { posts: [...posts.values()], ...(nextCursor ? { nextCursor } : {}) };
    } catch (cause) {
      throw new FeedError(cause instanceof FeedError ? cause.code : "UPSTREAM", cause instanceof FeedError ? cause.message : "fxTwitter response mapping failed.", { cause, diagnostics });
    }
  }

  private async request(path: string, context: RequestContext, allowEmpty: boolean): Promise<{ payload: JsonObject; diagnostics: Record<string, unknown> }> {
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
      if (response.status === 404 && !allowEmpty) throw new FeedError("NOT_FOUND", "fxTwitter could not find the post.");
      if (response.status === 429) throw new FeedError("RATE_LIMITED", "fxTwitter rate limit exceeded.");
      if (!response.ok && !(allowEmpty && response.status === 404)) throw new FeedError("UPSTREAM", `fxTwitter returned HTTP ${response.status}.`);
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
      catch (cause) { throw new FeedError("INVALID_RESPONSE", "fxTwitter returned invalid JSON.", { cause }); }
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new FeedError("INVALID_RESPONSE", "fxTwitter returned a non-object JSON response.");
      }
      const result = payload as JsonObject;
      if (response.status === 404 && (!Array.isArray(result.results) || result.results.length !== 0)) throw new FeedError("NOT_FOUND", "fxTwitter could not find the author.");
      if (typeof result.code === "number" && result.code !== 200 && !(allowEmpty && result.code === 404 && Array.isArray(result.results) && result.results.length === 0)) {
        throw new FeedError(result.code === 404 ? "NOT_FOUND" : result.code === 429 ? "RATE_LIMITED" : "UPSTREAM", `fxTwitter returned code ${result.code}.`);
      }
      diagnostics.body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(Buffer.concat(chunks));
      return { payload: result, diagnostics };
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

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid(message: string): never { throw new FeedError("INVALID_RESPONSE", message); }
