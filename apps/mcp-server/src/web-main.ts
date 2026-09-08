import { createFeed } from "@edgestream/feeds-runtime";
import { createFeedsMcpServer } from "./createServer.js";
import { createFeedsMcpHttpServer } from "./web.js";

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export async function main(): Promise<void> {
  const host = process.env.FEEDS_MCP_HTTP_HOST ?? "127.0.0.1";
  const port = parsePort(process.env.FEEDS_MCP_HTTP_PORT);
  const publicUrl = parsePublicUrl(process.env.FEEDS_MCP_HTTP_PUBLIC_URL, host, port);
  if (!loopbackHosts.has(host) && process.env.FEEDS_MCP_HTTP_ALLOW_REMOTE !== "true") throw new Error("Refusing non-loopback binding. Set FEEDS_MCP_HTTP_ALLOW_REMOTE=true only behind HTTPS and an authenticated proxy or tunnel.");
  if (!loopbackHosts.has(host)) console.error("WARNING: Feeds MCP HTTP is remotely reachable. Use HTTPS and an authenticated reverse proxy or Secure MCP Tunnel.");
  const feeds = createFeed();
  const server = createFeedsMcpHttpServer(() => createFeedsMcpServer({ feeds }), {
    host, port, allowedHosts: [host, new URL(publicUrl).hostname, "localhost", "127.0.0.1", "[::1]"],
    allowedOrigins: readList(process.env.FEEDS_MCP_HTTP_ALLOWED_ORIGINS, ["localhost", "127.0.0.1", "[::1]"]),
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  console.error(`Feeds MCP HTTP server listening at ${publicUrl}`);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const forceClose = setTimeout(() => {
      console.error("Feeds MCP HTTP shutdown timed out; closing active connections.");
      server.closeAllConnections();
    }, 10_000);
    forceClose.unref();
    server.close(() => clearTimeout(forceClose));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("FEEDS_MCP_HTTP_PORT must be an integer from 1 to 65535.");
  return port;
}
function parsePublicUrl(value: string | undefined, host: string, port: number): string {
  const candidate = value ?? `http://${host.includes(":") ? `[${host}]` : host}:${port}/mcp`;
  const url = new URL(candidate);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/mcp" || url.search || url.hash || url.username || url.password) throw new Error("FEEDS_MCP_HTTP_PUBLIC_URL must be an HTTP(S) URL ending exactly in /mcp.");
  return url.href;
}
function readList(value: string | undefined, fallback: readonly string[]): string[] { return value === undefined ? [...fallback] : value.split(/\s+/).filter(Boolean); }

if (import.meta.main) main().catch((error: unknown) => { console.error("Fatal MCP HTTP server error:", error instanceof Error ? error.message : "Unknown error"); process.exitCode = 1; });
