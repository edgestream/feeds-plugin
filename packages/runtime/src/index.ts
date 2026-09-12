import { FeedError, type FeedProvider } from "@edgestream/feeds-core";
import { FeedService } from "@edgestream/feeds-application";
import { BlueskyPlatform } from "@edgestream/feeds-platform-bluesky";
import { XPlatform } from "@edgestream/feeds-platform-x";
import { FxTwitterProvider, FxBlueskyProvider, type FxTwitterOptions } from "@edgestream/feeds-provider-fxtwitter";

export interface Configuration { readonly xProvider: string; readonly blueskyProvider?: string }

export function readConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): Configuration {
  return { xProvider: env.FEEDS_X_PROVIDER ?? "fxtwitter", blueskyProvider: env.FEEDS_BLUESKY_PROVIDER ?? "fxtwitter" };
}

export function createFeed(configuration: Configuration = readConfiguration(), options: FxTwitterOptions = {}): FeedService {
  const providers = new Map<string, () => FeedProvider>([
    ["fxtwitter", () => new FxTwitterProvider(options)],
  ]);
  const createProvider = providers.get(configuration.xProvider);
  if (!createProvider) throw new FeedError("CONFIGURATION", `Unknown X provider: ${configuration.xProvider}.`);
  const blueskyProvider = configuration.blueskyProvider ?? "fxtwitter";
  if (blueskyProvider !== "fxtwitter") throw new FeedError("CONFIGURATION", `Unknown Bluesky provider: ${blueskyProvider}.`);
  return new FeedService([new XPlatform(), new BlueskyPlatform()], [createProvider(), new FxBlueskyProvider(options)]);
}
