import { FeedsError, type JsonObject, type RequestContext } from "@edgestream/feeds-core";

export interface CliService { show(input: string, context?: RequestContext): Promise<JsonObject> }
export interface CliOutput { stdout(text: string): void; stderr(text: string): void }

const usage = "Usage: feeds show <post-url>\n";

export async function runCli(args: readonly string[], createService: () => CliService, output: CliOutput, context: RequestContext = {}): Promise<number> {
  try {
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      output.stdout(usage);
      return 0;
    }
    if (args.length !== 2 || args[0] !== "show" || !args[1] || args[1].startsWith("-")) {
      throw new FeedsError("INVALID_INPUT", usage.trim());
    }
    const result = await createService().show(args[1], context);
    output.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof FeedsError ? error : new FeedsError("UPSTREAM", "Unexpected request failure.");
    output.stderr(`${failure.code}: ${failure.message}\n`);
    return failure.code === "INVALID_INPUT" ? 2 : failure.code === "CANCELLED" ? 130 : 1;
  }
}
