import { FeedError } from "@edgestream/feeds-core";

export function feedUri(platform: string, reference: string): string {
  if (!/^[a-z][a-z0-9-]*$/u.test(platform) || !reference || reference === "." || reference === "..") throw new FeedError("INVALID_INPUT", "Invalid feed reference.");
  return `feeds://${platform}/${encodeURIComponent(reference)}`;
}

export function parseFeedUri(input: string): { platform: string; reference: string } {
  const match = /^feeds:\/\/([a-z][a-z0-9-]*)\/([^/?#]+)$/u.exec(input);
  if (!match) throw new FeedError("INVALID_INPUT", "Expected feeds://platform/reference.");
  try {
    const reference = decodeURIComponent(match[2]!);
    feedUri(match[1]!, reference);
    return { platform: match[1]!, reference };
  } catch { throw new FeedError("INVALID_INPUT", "Invalid feed reference encoding."); }
}
