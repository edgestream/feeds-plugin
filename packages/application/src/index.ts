import { feedUri, parseFeedUri } from "./references.js";
export { feedUri, parseFeedUri } from "./references.js";
import { FeedError, type FeedSubject, type FeedPage, type FeedOptions, type Platform, type FeedProvider, type RequestContext } from "@edgestream/feeds-core";

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

  async show(input: string, options: FeedOptions & { readonly all?: boolean; readonly maxBytes?: number } = {}, context: RequestContext = {}): Promise<FeedPage> {
    if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause: context.signal.reason });
    return this.get(this.resolveUrl(input), options, context);
  }

  /** Resolve MCP sources; bare references require exactly one configured platform. */
  resolveSource(input: string): FeedSubject {
    if (input.startsWith("feeds:")) return this.resolveUri(input);
    // URL syntax must never fall through to platform reference parsing.
    if (input && !/[\s:/\\?#@%.]/u.test(input) && this.platforms.length === 1) {
      return this.platforms[0]!.parseReference(input);
    }
    return this.resolveUrl(input);
  }

  private resolveUrl(input: string): FeedSubject {
    let url: URL;
    try { url = new URL(input); }
    catch { throw new FeedError("INVALID_INPUT", "Expected a complete public post or profile URL."); }
    for (const platform of this.platforms) {
      const ref = platform.resolve(url);
      if (!ref) continue;
      return ref;
    }
    throw new FeedError("INVALID_INPUT", "The URL does not belong to a supported platform.");
  }

  resolveUri(input: string): FeedSubject {
    const { platform, reference } = parseFeedUri(input);
    const adapter = this.platforms.find(candidate => candidate.id === platform);
    if (!adapter) throw new FeedError("INVALID_INPUT", "Unsupported feed platform.");
    return adapter.parseReference(reference);
  }

  uri(subject: FeedSubject): string {
    const platform = this.platforms.find(candidate => candidate.id === subject.platform);
    if (!platform) throw new FeedError("INVALID_INPUT", "Unsupported feed platform.");
    const reference = platform.formatReference(subject);
    if (platform.parseReference(reference).kind !== subject.kind) throw new FeedError("INVALID_INPUT", "This subject requires its public URL because its internal reference is ambiguous.");
    return feedUri(platform.id, reference);
  }

  async get(ref: FeedSubject, options: FeedOptions & { readonly all?: boolean; readonly maxBytes?: number } = {}, context: RequestContext = {}): Promise<FeedPage> {
    const platform = this.platforms.find(candidate => candidate.id === ref.platform);
    if (!platform) throw new FeedError("INVALID_INPUT", "Unsupported feed platform.");
    platform.formatReference(ref);
    const provider = this.providers.get(ref.platform);
    if (!provider) throw new FeedError("CONFIGURATION", `No provider configured for platform ${ref.platform}.`);
    const posts = new Map<string, FeedPage["posts"][number]>();
    const seen = new Set<string>();
    let bytes = 0;
    let cursor = options.cursor;
    if (cursor) seen.add(cursor);
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause: context.signal.reason });
      const page = await provider.get({ subject: ref, ...(options.scope ? { scope: options.scope } : {}), ...(options.limit !== undefined ? { limit: options.limit } : {}), ...(cursor !== undefined ? { cursor } : {}) }, context);
      for (const post of page.posts) {
        if (options.maxBytes !== undefined) {
          bytes += new TextEncoder().encode(JSON.stringify(post)).length;
          if (bytes > options.maxBytes) throw new FeedError("INVALID_RESPONSE", "Feed exceeds the result size budget; request individual pages.");
        }
        posts.set(JSON.stringify(post.ref), post);
      }
      if (!options.all || !page.nextCursor) return { posts: [...posts.values()], ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
      if (seen.has(page.nextCursor)) throw new FeedError("INVALID_RESPONSE", "Provider repeated a pagination cursor.");
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new FeedError("UPSTREAM", "Pagination exceeded the 100-page limit; request individual pages instead.");
  }
}
