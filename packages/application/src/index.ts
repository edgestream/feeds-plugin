import { FeedError, type FeedPage, type FeedOptions, type Platform, type FeedProvider, type RequestContext } from "@edgestream/feeds-core";

export class FeedService {
  private readonly platforms: readonly Platform[];
  private readonly providers: ReadonlyMap<string, FeedProvider>;

  constructor(platforms: readonly Platform[], providers: readonly FeedProvider[]) {
    if (new Set(platforms.map(p => p.id)).size !== platforms.length ||
        new Set(providers.map(p => p.platform)).size !== providers.length ||
        providers.some(p => !platforms.some(platform => platform.id === p.platform))) {
      throw new FeedError("CONFIGURATION", "Expected unique platforms and one selected provider per platform.");
    }
    this.platforms = [...platforms];
    this.providers = new Map(providers.map(provider => [provider.platform, provider]));
  }

  async show(input: string, options: FeedOptions & { readonly all?: boolean } = {}, context: RequestContext = {}): Promise<FeedPage> {
    if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.");
    let url: URL;
    try { url = new URL(input); }
    catch { throw new FeedError("INVALID_INPUT", "Expected a complete public post or profile URL."); }
    for (const platform of this.platforms) {
      const ref = platform.resolve(url);
      if (!ref) continue;
      const provider = this.providers.get(ref.platform);
      if (!provider) throw new FeedError("CONFIGURATION", `No provider configured for platform ${ref.platform}.`);
      const posts = new Map<string, FeedPage["posts"][number]>();
      const seen = new Set<string>();
      let cursor = options.cursor;
      if (cursor) seen.add(cursor);
      for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
        if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.");
        const page = await provider.get({ subject: ref, ...(options.scope ? { scope: options.scope } : {}), ...(options.limit !== undefined ? { limit: options.limit } : {}), ...(cursor !== undefined ? { cursor } : {}) }, context);
        for (const post of page.posts) posts.set(JSON.stringify(post.ref), post);
        if (!options.all || !page.nextCursor) return { posts: [...posts.values()], ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
        if (seen.has(page.nextCursor)) throw new FeedError("INVALID_RESPONSE", "Provider repeated a pagination cursor.");
        seen.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      throw new FeedError("UPSTREAM", "Pagination exceeded the 100-page limit; request individual pages instead.");
    }
    throw new FeedError("INVALID_INPUT", "The URL does not belong to a supported platform.");
  }
}
