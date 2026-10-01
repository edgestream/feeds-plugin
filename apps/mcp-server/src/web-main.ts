import { createFeed, createHostedFxEmbedState, HostedFxEmbedPolicy, type HostedFeedsLimits } from "@edgestream/feeds-runtime";
import { IntrospectionVerifier, type VerifiedFeedsPrincipal } from "./auth.js";
import { createFeedsMcpServer } from "./createServer.js";
import { createFeedsMcpHttpServer } from "./web.js";

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export async function main(): Promise<void> {
  const host = process.env.FEEDS_MCP_HTTP_HOST ?? "127.0.0.1";
  const port = parsePort(process.env.FEEDS_MCP_HTTP_PORT);
  const publicUrl = parsePublicUrl(process.env.FEEDS_MCP_HTTP_PUBLIC_URL, host, port);
  if (!loopbackHosts.has(host) && process.env.FEEDS_MCP_HTTP_ALLOW_REMOTE !== "true") throw new Error("Refusing non-loopback binding. Set FEEDS_MCP_HTTP_ALLOW_REMOTE=true only behind HTTPS and an authenticated proxy or tunnel.");
  if (!loopbackHosts.has(host)) console.error("WARNING: Feeds MCP HTTP is remotely reachable. Use HTTPS and an authenticated reverse proxy or Secure MCP Tunnel.");
  const authentication = hostedAuthentication(process.env);
  const hostedLimits = hostedLimitsFrom(process.env);
  const hostedPolicies = new Map<string, HostedFxEmbedPolicy>();
  const hostedState = createHostedFxEmbedState();
  if (!loopbackHosts.has(host) && authentication === undefined) throw new Error("Remotely reachable Feeds MCP requires OAuth adapter verifier configuration.");
  const server = createFeedsMcpHttpServer((context) => {
    // The adapter is the only principal source. #41 can consume this immutable,
    // request-local value for budgets without treating a session as an identity.
    const principal = context.authInfo?.extra?.feedsPrincipal as VerifiedFeedsPrincipal | undefined;
    if (authentication !== undefined && context.authInfo !== undefined && principal === undefined) throw new Error("Missing verified Feeds principal.");
    let policy: HostedFxEmbedPolicy | undefined;
    if (principal !== undefined) {
      const key = `${principal.issuer}\u0000${principal.subject}`;
      policy = hostedPolicies.get(key);
      if (policy === undefined) { policy = new HostedFxEmbedPolicy(principal, hostedLimits, undefined, hostedState); hostedPolicies.set(key, policy); }
    }
    return createFeedsMcpServer({ feeds: createFeed(undefined, policy === undefined ? {} : { fetch: policy.fetch }), ...(authentication === undefined ? {} : { hostedAuthentication: { resource: authentication.resource } }) });
  }, {
    host, port, allowedHosts: [host, "localhost", "127.0.0.1", "[::1]", ...(authentication === undefined ? [new URL(publicUrl).hostname] : [new URL(authentication.resource).host])],
    allowedOrigins: readList(process.env.FEEDS_MCP_HTTP_ALLOWED_ORIGINS, ["localhost", "127.0.0.1", "[::1]"]),
    ...(authentication === undefined ? {} : { authentication }),
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
function hostedAuthentication(env: NodeJS.ProcessEnv): { resource: string; issuer: string; verifier: IntrospectionVerifier } | undefined {
  const configuredResource = env.FEEDS_MCP_OAUTH_RESOURCE;
  if (configuredResource === undefined) return undefined;
  const resource = parseOAuthResource(configuredResource);
  const issuer = required(env, "FEEDS_MCP_OAUTH_ISSUER");
  const endpoint = required(env, "FEEDS_MCP_INTROSPECTION_URL");
  const clientId = required(env, "FEEDS_MCP_INTROSPECTION_CLIENT_ID");
  const clientSecret = required(env, "FEEDS_MCP_INTROSPECTION_CLIENT_SECRET");
  return { resource, issuer: new URL(issuer).href, verifier: new IntrospectionVerifier({ endpoint, clientId, clientSecret, issuer, resource }) };
}
function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required when FEEDS_MCP_OAUTH_RESOURCE is set.`);
  return value;
}
function hostedLimitsFrom(env: NodeJS.ProcessEnv): HostedFeedsLimits {
  const requestPrincipal = optionalPositive(env, "FEEDS_HOSTED_MAX_REQUESTS_PER_PRINCIPAL"), requestGlobal = optionalPositive(env, "FEEDS_HOSTED_MAX_REQUESTS_GLOBAL"), concurrentPrincipal = optionalPositive(env, "FEEDS_HOSTED_MAX_CONCURRENT_PER_PRINCIPAL"), concurrentGlobal = optionalPositive(env, "FEEDS_HOSTED_MAX_CONCURRENT_GLOBAL");
  return { timeoutMs: positive(env, "FEEDS_HOSTED_UPSTREAM_TIMEOUT_MS", 10_000), ...(requestPrincipal === undefined ? {} : { maxRequestsPerPrincipal: requestPrincipal }), ...(requestGlobal === undefined ? {} : { maxRequestsGlobal: requestGlobal }), ...(concurrentPrincipal === undefined ? {} : { maxConcurrentPerPrincipal: concurrentPrincipal }), ...(concurrentGlobal === undefined ? {} : { maxConcurrentGlobal: concurrentGlobal }) };
}
function positive(env: NodeJS.ProcessEnv, name: string, fallback: number): number { return optionalPositive(env, name) ?? fallback; }
function optionalPositive(env: NodeJS.ProcessEnv, name: string): number | undefined { const value = env[name]; if (value === undefined) return undefined; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive safe integer.`); return parsed; }
function parseOAuthResource(value: string): string {
  const resource = new URL(value);
  if (resource.protocol !== "https:" || resource.pathname !== "/mcp" || resource.search || resource.hash || resource.username || resource.password) {
    throw new Error("FEEDS_MCP_OAUTH_RESOURCE must be a canonical HTTPS URL ending exactly in /mcp.");
  }
  return resource.href;
}
function parsePublicUrl(value: string | undefined, host: string, port: number): string {
  const candidate = value ?? `http://${host.includes(":") ? `[${host}]` : host}:${port}/mcp`;
  const url = new URL(candidate);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/mcp" || url.search || url.hash || url.username || url.password) throw new Error("FEEDS_MCP_HTTP_PUBLIC_URL must be an HTTP(S) URL ending exactly in /mcp.");
  return url.href;
}
function readList(value: string | undefined, fallback: readonly string[]): string[] { return value === undefined ? [...fallback] : value.split(/\s+/).filter(Boolean); }

if (import.meta.main) main().catch((error: unknown) => { console.error("Fatal MCP HTTP server error:", error instanceof Error ? error.message : "Unknown error"); process.exitCode = 1; });
