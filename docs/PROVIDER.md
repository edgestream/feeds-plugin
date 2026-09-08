# Provider contract

Each provider lives in `packages/provider-<name>` with its own manifest,
TypeScript project, source, tests, and README. It implements the core
`PostProvider` contract and depends only on core contracts, never CLI, MCP,
runtime, or another provider. Providers may later be packaged separately.

## Requirements

- Declare stable provider and platform IDs.
- Resolve platform-bound `PostRef` values without requiring an earlier URL lookup
  or provider-specific search state.
- Reject references belonging to another platform and malformed IDs before HTTP.
- Return the complete JSON object without normalizing it to a post model.
- Accept cancellation through `RequestContext.signal`.
- Inject HTTP collaborators for deterministic tests.
- Bound request duration and response size, validate the JSON object boundary,
  and report operational failures through `FeedsError`.
- Do not silently retry, fall back, fetch linked URLs, or discover providers.

`Platform` packages own public URL recognition and normalization. Provider packages
own upstream endpoints and payload handling. Runtime owns registration and provider
selection. Adding an official X API provider must not change X post identity or
require provider branches in the CLI or application service.

Run `test/contracts/postProviderContract.ts` for each provider along with its own
adapter tests. There is no catalog/list contract yet because V1 only retrieves
individual posts. Document new capabilities before adding them.
