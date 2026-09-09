import { FeedError, type Platform, type FeedSubject } from "@edgestream/feeds-core";

const hosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);

export class XPlatform implements Platform {
  readonly id = "x";

  parseReference(reference: string): FeedSubject {
    if (/^[0-9]+$/u.test(reference)) return { kind: "post", platform: this.id, id: reference };
    if (!/^[a-zA-Z0-9_]{1,15}$/u.test(reference)) throw new FeedError("INVALID_INPUT", "Invalid X reference.");
    const subject = this.resolve(new URL(`https://x.com/${reference}`));
    if (!subject || subject.kind !== "author") throw new FeedError("INVALID_INPUT", "Invalid X reference.");
    return subject;
  }

  formatReference(subject: FeedSubject): string {
    if (subject.platform !== this.id) throw new FeedError("INVALID_INPUT", "Foreign X reference.");
    if (subject.kind === "post" && /^[0-9]+$/u.test(subject.id)) return subject.id;
    if (subject.kind === "author" && /^[a-zA-Z0-9_]{1,15}$/u.test(subject.handle)) {
      this.resolve(new URL(`https://x.com/${subject.handle}`));
      return subject.handle.toLowerCase();
    }
    throw new FeedError("INVALID_INPUT", "Invalid X subject.");
  }

  resolve(url: URL): FeedSubject | undefined {
    if (!hosts.has(url.hostname)) return undefined;
    const match = /^\/(?:[a-zA-Z0-9_]{1,15}|i\/web)\/status\/([0-9]+)(?:\/(?:photo|video)\/[1-9][0-9]*)?\/?$/u.exec(url.pathname);
    const author = /^\/([a-zA-Z0-9_]{1,15})\/?$/u.exec(url.pathname);
    const reserved = new Set(["home", "explore", "search", "notifications", "messages", "settings", "i", "intent", "compose", "login", "logout", "signup", "tos", "privacy"]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || (!match && (!author || reserved.has(author[1]!.toLowerCase())))) {
      throw new FeedError("INVALID_INPUT", "Expected a public X post or profile URL.");
    }
    return match ? { kind: "post", platform: this.id, id: match[1]! }
      : { kind: "author", platform: this.id, handle: author![1]!.toLowerCase() };
  }
}
