import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createMcpHandler, hostHeaderValidationResponse, originValidationResponse, type McpServerFactory } from "@modelcontextprotocol/server";

export interface FeedsMcpHttpOptions {
  readonly host: string;
  readonly port: number;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly bodyLimit?: number;
}

/** Stateless HTTP adapter with bounded input and connection-scoped cancellation. */
export function createFeedsMcpHttpServer(factory: McpServerFactory, options: FeedsMcpHttpOptions): Server {
  const bodyLimit = options.bodyLimit ?? 1_048_576;
  const handler = createMcpHandler(factory, {
    responseMode: "auto",
    onerror() { console.error("Feeds MCP HTTP transport failure."); },
  });
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (request, response) => {
    const controller = new AbortController();
    request.once("aborted", () => controller.abort());
    response.once("close", () => { if (!response.writableEnded) controller.abort(); });
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      // Use a fixed base; the actual Host header is independently validated below.
      const url = new URL(request.url ?? "/", "http://localhost");
      const probe = new Request(url, { headers, signal: controller.signal });
      const rejected = hostHeaderValidationResponse(probe, [...options.allowedHosts]) ?? originValidationResponse(probe, [...options.allowedOrigins]);
      if (rejected) { request.resume(); await writeResponse(response, rejected); return; }
      if (url.pathname === "/health" && request.method === "GET") {
        await writeResponse(response, Response.json({ status: "ok" })); return;
      }
      if (url.pathname !== "/mcp") { request.resume(); await writeResponse(response, new Response("Not found.", { status: 404 })); return; }
      const method = request.method ?? "GET";
      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request, bodyLimit);
      const webRequest = new Request(url, { method, headers, signal: controller.signal, ...(body === undefined ? {} : { body }) });
      await writeResponse(response, await handler.fetch(webRequest));
    } catch (error) {
      request.resume();
      if (response.destroyed) return;
      if (response.headersSent) { response.destroy(); return; }
      const tooLarge = error instanceof BodyLimitError;
      if (!tooLarge) console.error("Feeds MCP HTTP request failed.");
      await writeResponse(response, new Response(tooLarge ? "Request body too large." : "Internal server error.", { status: tooLarge ? 413 : 500 })).catch(() => response.destroy());
    }
  });
  server.once("close", () => void handler.close().catch(() => undefined));
  return server;
}

class BodyLimitError extends Error {}
async function readBody(request: IncomingMessage, limit: number): Promise<string> {
  if (Number(request.headers["content-length"]) > limit) throw new BodyLimitError();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit) throw new BodyLimitError();
    chunks.push(buffer);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}
async function writeResponse(response: ServerResponse, webResponse: Response): Promise<void> {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  if (!webResponse.body) { response.end(); return; }
  await pipeline(Readable.fromWeb(webResponse.body as never), response);
}
