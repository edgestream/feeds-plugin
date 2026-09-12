import { FeedError, type FeedProvider } from "@edgestream/feeds-core";
import { FeedService } from "@edgestream/feeds-application";
import { BlueskyPlatform } from "@edgestream/feeds-platform-bluesky";
import { XPlatform } from "@edgestream/feeds-platform-x";
import { FxTwitterProvider, FxBlueskyProvider, type FxEmbedOptions } from "@edgestream/feeds-provider-fxembed";

export interface Configuration { readonly xProvider: string; readonly blueskyProvider?: string }

export function readConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): Configuration {
  return { xProvider: env.FEEDS_X_PROVIDER ?? "fxembed", blueskyProvider: env.FEEDS_BLUESKY_PROVIDER ?? "fxembed" };
}

export function createFeed(configuration: Configuration = readConfiguration(), options: FxEmbedOptions = {}): FeedService {
  const providers = new Map<string, () => FeedProvider>([
    ["fxembed", () => new FxTwitterProvider(options)],
  ]);
  const createProvider = providers.get(configuration.xProvider);
  if (!createProvider) throw new FeedError("CONFIGURATION", `Unknown X provider: ${configuration.xProvider}.`);
  const blueskyProvider = configuration.blueskyProvider ?? "fxembed";
  if (blueskyProvider !== "fxembed") throw new FeedError("CONFIGURATION", `Unknown Bluesky provider: ${blueskyProvider}.`);
  return new FeedService([new XPlatform(), new BlueskyPlatform()], [createProvider(), new FxBlueskyProvider(options)]);
}
