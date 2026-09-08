import { FeedsError, type Platform, type PostRef } from "@edgestream/feeds-core";

const hosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);

export class XPlatform implements Platform {
  readonly id = "x";

  resolve(url: URL): PostRef | undefined {
    if (!hosts.has(url.hostname)) return undefined;
    const match = /^\/(?:[a-zA-Z0-9_]{1,15}|i\/web)\/status\/([0-9]+)(?:\/(?:photo|video)\/[1-9][0-9]*)?\/?$/u.exec(url.pathname);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !match) {
      throw new FeedsError("INVALID_INPUT", "Expected a public X post URL: https://x.com/handle/status/id");
    }
    return { platform: this.id, id: match[1]! };
  }
}
