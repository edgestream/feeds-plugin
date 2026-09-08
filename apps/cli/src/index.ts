import { FeedError, type FeedPage, type FeedOptions, type RequestContext } from "@edgestream/feeds-core";

export interface CliService { show(input: string, options?: FeedOptions & { readonly all?: boolean }, context?: RequestContext): Promise<FeedPage> }
export interface CliOutput { stdout(text: string): void; stderr(text: string): void }

const usage = "Usage: feeds show [--context] [--answers] [--all] [--cursor CURSOR] [--limit 1-100] <post-or-profile-url>\n";

export async function runCli(args: readonly string[], createService: () => CliService, output: CliOutput, context: RequestContext = {}): Promise<number> {
  try {
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      output.stdout(usage);
      return 0;
    }
    if (args[0] !== "show") throw new FeedError("INVALID_INPUT", usage.trim());
    let input: string | undefined, cursor: string | undefined, limit: number | undefined;
    let ancestors = false, replies = false, all = false;
    const seen = new Set<string>();
    for (let index = 1; index < args.length; index++) {
      const argument = args[index]!;
      if (argument.startsWith("-")) {
        if (seen.has(argument)) throw new FeedError("INVALID_INPUT", `Duplicate option: ${argument}`);
        seen.add(argument);
        if (argument === "--context") ancestors = true;
        else if (argument === "--answers") replies = true;
        else if (argument === "--all") all = true;
        else if (argument === "--cursor" || argument === "--limit") {
          const value = args[++index];
          if (!value || value.startsWith("--")) throw new FeedError("INVALID_INPUT", `Missing value for ${argument}.`);
          if (argument === "--cursor") cursor = value;
          else {
            if (!/^[0-9]+$/u.test(value) || Number(value) < 1 || Number(value) > 100) throw new FeedError("INVALID_INPUT", "Limit must be an integer from 1 to 100.");
            limit = Number(value);
          }
        } else throw new FeedError("INVALID_INPUT", `Unknown option: ${argument}`);
      } else {
        if (input || !argument) throw new FeedError("INVALID_INPUT", usage.trim());
        input = argument;
      }
    }
    if (!input) throw new FeedError("INVALID_INPUT", usage.trim());
    const result = await createService().show(input, { scope: { ancestors, replies }, ...(cursor !== undefined ? { cursor } : {}), ...(limit !== undefined ? { limit } : {}), all }, context);
    output.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof FeedError ? error : new FeedError("UPSTREAM", "Unexpected request failure.");
    output.stderr(`${failure.code}: ${failure.message}\n`);
    return failure.code === "INVALID_INPUT" ? 2 : failure.code === "CANCELLED" ? 130 : 1;
  }
}
