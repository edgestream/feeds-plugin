import { FeedError } from "@edgestream/feeds-core";

export interface HostedFeedsLimits { readonly timeoutMs: number; readonly maxRequestsPerPrincipal?: number; readonly maxRequestsGlobal?: number; readonly maxConcurrentPerPrincipal?: number; readonly maxConcurrentGlobal?: number; }
export const defaultHostedFeedsLimits: HostedFeedsLimits = { timeoutMs: 10_000 };
export interface HostedFxEmbedState { readonly accounts: Map<string, { requests: number; active: number }>; globalRequests: number; globalActive: number; }
export function createHostedFxEmbedState(): HostedFxEmbedState { return { accounts: new Map(), globalRequests: 0, globalActive: 0 }; }

/** Hosted-only admission and response policy; local callers retain native fetch behavior. */
export class HostedFxEmbedPolicy {
  constructor(readonly principal: { issuer: string; subject: string }, readonly limits: HostedFeedsLimits = defaultHostedFeedsLimits, private readonly upstream: typeof fetch = fetch, private readonly state: HostedFxEmbedState = createHostedFxEmbedState()) {}
  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!((url.origin === "https://api.fxtwitter.com" || url.origin === "https://api.fxbsky.app") && url.pathname.startsWith("/2/"))) throw new FeedError("UPSTREAM", "Hosted Feeds rejected an unapproved upstream destination.");
    const key = `${this.principal.issuer}\u0000${this.principal.subject}`;
    const account = this.state.accounts.get(key) ?? { requests: 0, active: 0 };
    if ((this.limits.maxRequestsPerPrincipal !== undefined && account.requests >= this.limits.maxRequestsPerPrincipal) || (this.limits.maxRequestsGlobal !== undefined && this.state.globalRequests >= this.limits.maxRequestsGlobal) || (this.limits.maxConcurrentPerPrincipal !== undefined && account.active >= this.limits.maxConcurrentPerPrincipal) || (this.limits.maxConcurrentGlobal !== undefined && this.state.globalActive >= this.limits.maxConcurrentGlobal)) throw new FeedError("RATE_LIMITED", "Hosted Feeds request budget exhausted.");
    account.requests++; account.active++; this.state.globalRequests++; this.state.globalActive++; this.state.accounts.set(key, account);
    let released = false;
    const release = () => { if (!released) { released = true; account.active--; this.state.globalActive--; } };
    try {
      const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(this.limits.timeoutMs)]) : AbortSignal.timeout(this.limits.timeoutMs);
      const response = await this.upstream(input, { ...init, signal, headers: new Headers(init?.headers) });
      if (!response.ok || !response.body) { release(); return response; }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({ async pull(controller) { try { const next = await reader.read(); if (next.done) { release(); controller.close(); return; } controller.enqueue(next.value); } catch (error) { release(); controller.error(error); } }, cancel: async () => { release(); await reader.cancel(); } });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { release(); throw error; }
  };
}
