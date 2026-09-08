import { FeedsError, type PostProvider } from "@edgestream/feeds-core";
import { FeedsService } from "@edgestream/feeds-application";
import { XPlatform } from "@edgestream/feeds-platform-x";
import { FxTwitterProvider, type FxTwitterOptions } from "@edgestream/feeds-provider-fxtwitter";

export interface Configuration { readonly xProvider: string }

export function readConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): Configuration {
  return { xProvider: env.FEEDS_X_PROVIDER ?? "fxtwitter" };
}

export function createFeeds(configuration: Configuration = readConfiguration(), options: FxTwitterOptions = {}): FeedsService {
  const providers = new Map<string, () => PostProvider>([
    ["fxtwitter", () => new FxTwitterProvider(options)],
  ]);
  const createProvider = providers.get(configuration.xProvider);
  if (!createProvider) throw new FeedsError("CONFIGURATION", `Unknown X provider: ${configuration.xProvider}.`);
  return new FeedsService([new XPlatform()], [createProvider()]);
}
