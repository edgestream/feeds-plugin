import { FeedError, type Platform } from "@edgestream/feeds-core";

const hosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);

export class XPlatform implements Platform {
  readonly id = "x";

  supports(url: URL): boolean {
    if (!hosts.has(url.hostname)) return false;
    const match = /^\/(?:[a-zA-Z0-9_]{1,15}|i\/web)\/status\/([0-9]+)(?:\/(?:photo|video)\/[1-9][0-9]*)?\/?$/u.exec(url.pathname);
    const author = /^\/([a-zA-Z0-9_]{1,15})\/?$/u.exec(url.pathname);
    const reserved = new Set(["home", "explore", "search", "notifications", "messages", "settings", "i", "intent", "compose", "login", "logout", "signup", "tos", "privacy"]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || (!match && (!author || reserved.has(author[1]!.toLowerCase())))) {
      throw new FeedError("INVALID_INPUT", "Expected a public X post or profile URL.");
    }
    return true;
  }
}
