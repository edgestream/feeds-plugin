import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createMcpHandler, hostHeaderValidationResponse, originValidationResponse, type McpServerFactory } from "@modelcontextprotocol/server";
import type { FeedsTokenVerifier, VerifiedFeedsPrincipal } from "./auth.js";

export interface FeedsMcpHttpOptions {
  readonly host: string;
  readonly port: number;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly bodyLimit?: number;
  readonly authentication?: {
    readonly resource: string;
    readonly issuer: string;
    readonly verifier: FeedsTokenVerifier;
  };
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
      if (isProtectedResourceMetadataRequest(url.pathname) && options.authentication) {
        request.resume(); await writeResponse(response, protectedResourceMetadataResponse(request.method, options.authentication)); return;
      }
      if (url.pathname !== "/mcp") { request.resume(); await writeResponse(response, new Response("Not found.", { status: 404 })); return; }
      const method = request.method ?? "GET";
      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request, bodyLimit);
      const webRequest = new Request(url, { method, headers, signal: controller.signal, ...(body === undefined ? {} : { body }) });
      const hostedToolsList = options.authentication !== undefined && await isToolsList(webRequest);
      const auth = options.authentication === undefined ? undefined : await authenticate(webRequest, options.authentication);
      const result = auth instanceof Response ? auth : await handler.fetch(webRequest, auth === undefined ? undefined : { authInfo: auth });
      await writeResponse(response, options.authentication === undefined ? result : await addHostedToolSecuritySchemes(hostedToolsList, result));
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

/**
 * The MCP server v2 serializer currently omits tool securitySchemes. Keep the
 * workaround at the HTTP boundary, where it applies only to the hosted OAuth
 * endpoint and is verified against both JSON and SSE protocol responses.
 */
async function addHostedToolSecuritySchemes(toolsList: boolean, response: Response): Promise<Response> {
  if (!toolsList || !response.body) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/event-stream")) return response;
  const body = await response.text();
  const patched = contentType.includes("text/event-stream") ? patchEventStream(body) : patchJson(body);
  if (patched === body) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(patched, { status: response.status, statusText: response.statusText, headers });
}

async function isToolsList(request: Request): Promise<boolean> {
  const body = await request.clone().json().catch(() => undefined) as { method?: unknown } | undefined;
  return body?.method === "tools/list";
}

function patchJson(value: string): string {
  try { return JSON.stringify(patchToolList(JSON.parse(value))); } catch { return value; }
}

function patchEventStream(value: string): string {
  return value.split("\n\n").map(event => {
    const lines = event.split("\n");
    const indexes = lines.map((line, index) => line.startsWith("data:") ? index : -1).filter(index => index >= 0);
    if (indexes.length === 0) return event;
    const data = indexes.map(index => lines[index]!.slice(5).trimStart()).join("\n");
    const patched = patchJson(data);
    if (patched === data) return event;
    lines[indexes[0]!] = `data: ${patched}`;
    for (const index of indexes.slice(1).reverse()) lines.splice(index, 1);
    return lines.join("\n");
  }).join("\n\n");
}

function patchToolList(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const message = value as { result?: { tools?: unknown[] } };
  if (!Array.isArray(message.result?.tools)) return value;
  const tool = message.result.tools.find(candidate => typeof candidate === "object" && candidate !== null && (candidate as { name?: unknown }).name === "get_feed") as Record<string, unknown> | undefined;
  if (!tool) return value;
  tool.securitySchemes = [{ type: "oauth2", scopes: ["feeds:read"] }];
  return value;
}

async function authenticate(request: Request, authentication: NonNullable<FeedsMcpHttpOptions["authentication"]>) {
  const body = await request.clone().json().catch(() => undefined) as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: { name?: unknown } } | undefined;
  // Connection setup needs no feed data. Every other protocol operation is protected.
  if (body?.method === "initialize" || body?.method === "tools/list") return undefined;
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return toolChallenge(body, authentication.resource, "invalid_token") ?? challenge(authentication.resource);
  let principal: VerifiedFeedsPrincipal;
  try { principal = await authentication.verifier.verify(token, request.signal); }
  catch { return toolChallenge(body, authentication.resource, "invalid_token") ?? challenge(authentication.resource); }
  if (!validPrincipal(principal, authentication.issuer)) return toolChallenge(body, authentication.resource, "invalid_token") ?? challenge(authentication.resource);
  if (!principal.scopes.includes("feeds:read")) return toolChallenge(body, authentication.resource, "insufficient_scope") ?? insufficientScope(authentication.resource);
  return {
    token,
    clientId: "feeds-oauth-client",
    scopes: [...principal.scopes],
    resource: new URL(authentication.resource),
    extra: { feedsPrincipal: principal },
  };
}

/** Return an MCP tool error so ChatGPT can launch its OAuth linking UI. */
function toolChallenge(body: { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: { name?: unknown } } | undefined, resource: string, error: "invalid_token" | "insufficient_scope"): Response | undefined {
  if (body?.jsonrpc !== "2.0" || body.method !== "tools/call" || body.params?.name !== "get_feed") return undefined;
  const metadata = protectedResourceMetadataUrl(resource);
  const scope = error === "insufficient_scope" ? ', scope="feeds:read"' : "";
  const description = error === "insufficient_scope" ? "Feeds read permission is required" : "Sign in required";
  return Response.json({ jsonrpc: "2.0", id: body.id ?? null, result: {
    isError: true,
    content: [{ type: "text", text: description }],
    _meta: { "mcp/www_authenticate": [`Bearer resource_metadata="${metadata}", error="${error}", error_description="${description}"${scope}`] },
  } });
}

function bearerToken(value: string | null): string | undefined {
  return /^Bearer ([^\s]+)$/u.exec(value ?? "")?.[1];
}

function challenge(resource: string): Response {
  return new Response("Authentication required.", { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(resource)}", error="invalid_token"` } });
}

function insufficientScope(resource: string): Response {
  return new Response("Insufficient scope.", { status: 403, headers: { "www-authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(resource)}", error="insufficient_scope", scope="feeds:read"` } });
}

function protectedResourceMetadataUrl(resource: string): string {
  return new URL("/.well-known/oauth-protected-resource", new URL(resource).origin).href;
}

function validPrincipal(value: VerifiedFeedsPrincipal, issuer: string): boolean {
  return value.issuer === new URL(issuer).href
    && typeof value.subject === "string" && value.subject.length > 0
    && Array.isArray(value.scopes) && value.scopes.every((scope) => typeof scope === "string" && scope.length > 0)
    && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() / 1_000;
}

function isProtectedResourceMetadataRequest(path: string): boolean {
  return path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp";
}

function protectedResourceMetadataResponse(method: string | undefined, authentication: NonNullable<FeedsMcpHttpOptions["authentication"]>): Response {
  if (method !== "GET" && method !== "HEAD") return new Response("Method not allowed.", { status: 405, headers: { allow: "GET, HEAD" } });
  const result = Response.json({ resource: authentication.resource, authorization_servers: [authentication.issuer], scopes_supported: ["feeds:read"] });
  return method === "HEAD" ? new Response(null, { status: result.status, headers: result.headers }) : result;
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
