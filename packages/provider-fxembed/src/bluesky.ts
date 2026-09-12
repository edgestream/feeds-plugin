import { FeedError, type JsonObject, type FeedProvider, type FeedOptions, type RequestContext } from "@edgestream/feeds-core";
import type { FxEmbedOptions } from "./options.js";
import { request } from "./request.js";

export class FxBlueskyProvider implements FeedProvider {
  readonly id = "fxembed";
  readonly platform = "bluesky";
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: FxEmbedOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async get(url: URL, options: FeedOptions = {}, context: RequestContext = {}): Promise<JsonObject> {
    const match = /^\/profile\/([^/]+)(?:\/post\/([a-zA-Z0-9._~:-]{1,512}))?\/?$/u.exec(url.pathname);
    const actor = match?.[1] ?? "";
    const handle = actor.length <= 253 && /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/u.test(actor);
    const did = /^did:plc:[a-z2-7]{24}$/u.test(actor) || actor.length <= 261 && /^did:web:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/u.test(actor);
    if (url.hostname !== "bsky.app" || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || !match || (!handle && !did) || match[2] === "." || match[2] === "..") {
      throw new FeedError("INVALID_INPUT", "Expected a public Bluesky post or profile URL.");
    }
    const post = match[2];
    if (!post && options.context) throw new FeedError("INVALID_INPUT", "Context requires a post URL.");
    if (options.cursor !== undefined && (typeof options.cursor !== "string" || !options.cursor || (post && !options.answers))) {
      throw new FeedError("INVALID_INPUT", "Cursor must be a nonempty string and requires a profile URL or a post URL with answers enabled.");
    }
    const encodedActor = encodeURIComponent(handle ? actor.toLowerCase() : actor);
    const path = post
      ? `${options.answers ? "conversation" : options.context ? "thread" : "status"}/${encodedActor}/${encodeURIComponent(post)}`
      : `profile/${encodedActor}/statuses`;
    const parameters = new URLSearchParams();
    if (!post && options.answers) parameters.set("with_replies", "1");
    if (options.cursor !== undefined) parameters.set("cursor", options.cursor);
    return request(this.fetch, this.platform, path + (parameters.size ? `?${parameters}` : ""), context);
  }
}
