import { FeedError, type Platform } from "@edgestream/feeds-core";

export class BlueskyPlatform implements Platform {
  readonly id = "bluesky";

  supports(url: URL): boolean {
    if (url.hostname !== "bsky.app") return false;
    const match = /^\/profile\/([^/]+)(?:\/post\/([a-zA-Z0-9._~:-]{1,512}))?\/?$/u.exec(url.pathname);
    const actor = match?.[1] ?? "";
    const handle = actor.length <= 253 && /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/u.test(actor);
    const did = /^did:plc:[a-z2-7]{24}$/u.test(actor) || actor.length <= 261 && /^did:web:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/u.test(actor);
    if (url.hostname !== "bsky.app" || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || !match || (!handle && !did) || match[2] === "." || match[2] === "..") {
      throw new FeedError("INVALID_INPUT", "Expected a public Bluesky post or profile URL.");
    }
    return true;
  }
}
