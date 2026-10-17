/** The principal returned only by the cluster-private OAuth adapter verifier. */
export interface VerifiedFeedsPrincipal {
  readonly issuer: string;
  readonly subject: string;
  readonly scopes: readonly string[];
  /** Unix epoch seconds, copied from the adapter's active introspection result. */
  readonly expiresAt: number;
}

export interface FeedsTokenVerifier {
  verify(token: string, signal?: AbortSignal): Promise<VerifiedFeedsPrincipal>;
}

export interface IntrospectionVerifierOptions {
  readonly endpoint: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly issuer: string;
  readonly resource: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Verifies only opaque access tokens issued by the selected OAuth adapter. */
export class IntrospectionVerifier implements FeedsTokenVerifier {
  readonly #endpoint: URL;
  readonly #credentials: string;
  readonly #issuer: string;
  readonly #resource: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: IntrospectionVerifierOptions) {
    this.#endpoint = new URL(options.endpoint);
    this.#credentials = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
    this.#issuer = new URL(options.issuer).href;
    this.#resource = new URL(options.resource).href;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 5_000;
  }

  async verify(token: string, signal?: AbortSignal): Promise<VerifiedFeedsPrincipal> {
    const response = await this.#fetch(this.#endpoint, {
      method: "POST",
      headers: { authorization: `Basic ${this.#credentials}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ token }),
      signal: signal === undefined ? AbortSignal.timeout(this.#timeoutMs) : AbortSignal.any([signal, AbortSignal.timeout(this.#timeoutMs)]),
    });
    if (!response.ok) throw new Error("Feeds token verification is unavailable.");
    const value: unknown = await response.json();
    if (!isActiveAccessToken(value) || value.iss !== this.#issuer || !exactAudience(value.aud, this.#resource)) {
      throw new Error("The access token is not valid for Feeds.");
    }
    return { issuer: value.iss, subject: value.sub, scopes: value.scope.split(/\s+/u).filter(Boolean), expiresAt: value.exp };
  }
}

function isActiveAccessToken(value: unknown): value is { active: true; iss: string; sub: string; aud: unknown; scope: string; exp: number; token_type?: string } {
  if (typeof value !== "object" || value === null) return false;
  const token = value as Record<string, unknown>;
  return token.active === true
    && typeof token.iss === "string"
    && typeof token.sub === "string" && token.sub.length > 0
    && typeof token.scope === "string"
    && typeof token.exp === "number" && Number.isFinite(token.exp) && token.exp > Date.now() / 1_000
    // The adapter may omit token_type for opaque tokens. Any explicit non-Bearer
    // type is rejected so ID tokens and client/service credentials cannot enter.
    && (token.token_type === undefined || token.token_type === "Bearer");
}

function exactAudience(value: unknown, expected: string): boolean {
  return Array.isArray(value) ? value.length === 1 && value[0] === expected : value === expected;
}
