import { createFeed } from "@edgestream/feeds-runtime";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createFeedsMcpServer } from "./createServer.js";

export async function main(): Promise<void> {
  const server = createFeedsMcpServer({ feeds: createFeed() });
  await server.connect(new StdioServerTransport());
  const stop = () => { void server.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.error("Feeds MCP server running on stdio.");
}
if (import.meta.main) main().catch(() => { console.error("Unable to start Feeds MCP server. Check runtime configuration."); process.exitCode = 1; });
