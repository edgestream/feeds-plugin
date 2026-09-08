import { FeedError, type JsonObject, type Platform, type PostProvider, type RequestContext } from "@edgestream/feeds-core";

export class FeedService {
  private readonly platforms: readonly Platform[];
  private readonly providers: ReadonlyMap<string, PostProvider>;

  constructor(platforms: readonly Platform[], providers: readonly PostProvider[]) {
    if (new Set(platforms.map(p => p.id)).size !== platforms.length ||
        new Set(providers.map(p => p.platform)).size !== providers.length ||
        providers.some(p => !platforms.some(platform => platform.id === p.platform))) {
      throw new FeedError("CONFIGURATION", "Expected unique platforms and one selected provider per platform.");
    }
    this.platforms = [...platforms];
    this.providers = new Map(providers.map(provider => [provider.platform, provider]));
  }

  async show(input: string, context: RequestContext = {}): Promise<JsonObject> {
    if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.");
    let url: URL;
    try { url = new URL(input); }
    catch { throw new FeedError("INVALID_INPUT", "Expected a complete public post URL."); }
    for (const platform of this.platforms) {
      const ref = platform.resolve(url);
      if (!ref) continue;
      const provider = this.providers.get(ref.platform);
      if (!provider) throw new FeedError("CONFIGURATION", `No provider configured for platform ${ref.platform}.`);
      return provider.get(ref, context);
    }
    throw new FeedError("INVALID_INPUT", "The post URL does not belong to a supported platform.");
  }
}
