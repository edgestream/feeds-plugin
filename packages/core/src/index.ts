export interface Platform {
  readonly id: string;
  supports(url: URL): boolean;
}

export interface FeedOptions {
  readonly context?: boolean;
  readonly answers?: boolean;
}
export interface FeedProvider {
  readonly id: string;
  readonly platform: string;
  get(url: URL, options?: FeedOptions, context?: RequestContext): Promise<JsonObject>;
}

export interface RequestContext { readonly signal?: AbortSignal }

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }

export type ErrorCode = "INVALID_INPUT" | "CONFIGURATION" | "NOT_FOUND" |
  "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE" | "TIMEOUT" | "CANCELLED";

export class FeedError extends Error {
  readonly diagnostics?: unknown;
  constructor(readonly code: ErrorCode, message: string, options?: ErrorOptions & { diagnostics?: unknown }) {
    super(message, options);
    this.name = "FeedError";
    this.diagnostics = options?.diagnostics;
  }
}
