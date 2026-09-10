import { FeedError, type JsonObject, type FeedOptions, type RequestContext } from "@edgestream/feeds-core";

export interface CliService { show(input: string, options?: FeedOptions, context?: RequestContext): Promise<JsonObject> }
export interface CliOutput { stdout(text: string): void; stderr(text: string): void }

const usage = "Usage: feeds show [--context] [--answers] [--cursor <cursor>] <post-or-profile-url>\n";

export async function runCli(args: readonly string[], createService: () => CliService, output: CliOutput, context: RequestContext = {}): Promise<number> {
  try {
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      output.stdout(usage);
      return 0;
    }
    if (args[0] !== "show") throw new FeedError("INVALID_INPUT", usage.trim());
    let input: string | undefined;
    let cursor: string | undefined;
    let contextOption = false, answers = false;
    const seen = new Set<string>();
    for (let index = 1; index < args.length; index++) {
      const argument = args[index]!;
      if (argument.startsWith("-")) {
        if (seen.has(argument)) throw new FeedError("INVALID_INPUT", `Duplicate option: ${argument}`);
        seen.add(argument);
        if (argument === "--context") contextOption = true;
        else if (argument === "--answers") answers = true;
        else if (argument === "--cursor") {
          const value = args[++index];
          if (!value || value.startsWith("--")) throw new FeedError("INVALID_INPUT", "--cursor requires a nonempty value.");
          cursor = value;
        }
        else throw new FeedError("INVALID_INPUT", `Unknown option: ${argument}`);
      } else {
        if (input || !argument) throw new FeedError("INVALID_INPUT", usage.trim());
        input = argument;
      }
    }
    if (!input) throw new FeedError("INVALID_INPUT", usage.trim());
    const result = await createService().show(input, { context: contextOption, answers, ...(cursor !== undefined ? { cursor } : {}) }, context);
    output.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof FeedError ? error : new FeedError("UPSTREAM", "Unexpected request failure.");
    output.stderr(`${failure.code}: ${failure.message}\n`);
    return failure.code === "INVALID_INPUT" ? 2 : failure.code === "CANCELLED" ? 130 : 1;
  }
}
