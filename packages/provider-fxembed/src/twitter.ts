import { FeedError, type JsonObject, type FeedProvider, type FeedOptions, type RequestContext } from "@edgestream/feeds-core";
import type { FxEmbedOptions } from "./options.js";
import { request } from "./request.js";

export class FxTwitterProvider implements FeedProvider {
  readonly id = "fxembed";
  readonly platform = "x";
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: FxEmbedOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
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
    if (!post && options.context) throw new FeedError("INVALID_INPUT", "Context requires a post URL.");
    if (options.cursor !== undefined && (typeof options.cursor !== "string" || !options.cursor || (post && !options.answers))) {
      throw new FeedError("INVALID_INPUT", "Cursor must be a nonempty string and requires a profile URL or a post URL with answers enabled.");
    }
    const path = post
      ? `${options.answers ? "conversation" : options.context ? "thread" : "status"}/${post[1]}`
      : `profile/${author![1]!.toLowerCase()}/statuses`;
    const parameters = new URLSearchParams();
    if (!post && options.answers) parameters.set("with_replies", "1");
    if (options.cursor !== undefined) parameters.set("cursor", options.cursor);
    const query = parameters.size ? `?${parameters}` : "";
    return request(this.fetch, this.platform, `${path}${query}`, context);
  }

}
