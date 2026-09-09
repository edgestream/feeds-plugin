export interface Platform {
  readonly id: string;
  resolve(url: URL): FeedSubject | undefined;
  parseReference(reference: string): FeedSubject;
  formatReference(subject: FeedSubject): string;
}

export interface PostRef {
  readonly kind: "post";
  readonly platform: string;
  readonly id: string;
}
export interface AuthorRef {
  readonly kind: "author";
  readonly platform: string;
  readonly handle: string;
}
export type FeedSubject = PostRef | AuthorRef;
export interface FeedOptions {
  readonly scope?: { readonly ancestors?: boolean; readonly replies?: boolean };
  readonly cursor?: string;
  readonly limit?: number;
}
export interface FeedQuery extends FeedOptions { readonly subject: FeedSubject }
export interface FeedPost {
  readonly ref: PostRef;
  /** Reply relationship; the parent need not occur on this page. */
  readonly parent?: PostRef;
  readonly data: JsonObject;
}
export interface FeedPage {
  readonly posts: readonly FeedPost[];
  /** Provider-owned continuation; absence does not prove upstream completeness. */
  readonly nextCursor?: string;
}
export interface FeedProvider {
  readonly id: string;
  readonly platform: string;
  get(query: FeedQuery, context?: RequestContext): Promise<FeedPage>;
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
