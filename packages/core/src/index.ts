export interface Platform {
  readonly id: string;
  /** Return undefined for URLs not owned by this platform; reject malformed post URLs. */
  resolve(url: URL): PostRef | undefined;
}

export interface PostProvider {
  readonly id: string;
  readonly platform: string;
  /** Return the complete upstream JSON object, without a normalized post schema. */
  get(ref: PostRef, context?: RequestContext): Promise<JsonObject>;
}

export interface PostRef {
  readonly platform: string;
  readonly id: string;
}

export interface RequestContext { readonly signal?: AbortSignal }

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }

export type ErrorCode = "INVALID_INPUT" | "CONFIGURATION" | "NOT_FOUND" |
  "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE" | "TIMEOUT" | "CANCELLED";

export class FeedError extends Error {
  constructor(readonly code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FeedError";
  }
}
