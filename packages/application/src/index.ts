import { FeedError, type JsonObject, type FeedOptions, type Platform, type FeedProvider, type RequestContext } from "@edgestream/feeds-core";

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

  async show(input: string, options: FeedOptions = {}, context: RequestContext = {}): Promise<JsonObject> {
    if (context.signal?.aborted) throw new FeedError("CANCELLED", "Request cancelled.", { cause: context.signal.reason });
    let url: URL;
    try { url = new URL(input); }
    catch { throw new FeedError("INVALID_INPUT", "Expected a complete public post or profile URL."); }
    const platform = this.platforms.find(platform => platform.supports(url));
    if (!platform) throw new FeedError("INVALID_INPUT", "The URL does not belong to a supported platform.");
    const provider = this.providers.get(platform.id);
    if (!provider) throw new FeedError("CONFIGURATION", `No provider configured for platform ${platform.id}.`);
    return provider.get(url, options, context);
  }
}
