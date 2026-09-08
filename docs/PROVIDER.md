# Provider contract

Each provider lives in `packages/provider-<name>` with its own manifest,
TypeScript project, source, tests, and README. It implements core `FeedProvider`
and depends only on core, never CLI, MCP, runtime, or another provider.

## Requirements

- Declare stable provider and platform IDs.
- Accept `FeedQuery` with a `PostRef` or `AuthorRef`, optional scope, cursor, and limit.
- Resolve references independently of earlier URL lookups or search state.
- Reject foreign/malformed references and unsupported option combinations before HTTP.
- Return `FeedPage` with zero or more flat posts and an optional opaque continuation.
- Preserve individual upstream post objects in `data`; normalize only post identity
  and reply parents. Do not infer parents from list order or fetch embedded URLs.
- Accept cancellation through `RequestContext.signal`.
- Inject HTTP collaborators for deterministic tests.
- Bound duration and response size, validate feed structure, and report failures
  through `FeedError`.
- Do not silently retry, fall back, or discover providers.

Platforms own public URL recognition. Providers own endpoints, query translation,
response parsing, and cursor handling. Runtime selects one provider per platform.
Application owns optional all-page traversal. A provider using multiple paginated
endpoints must encapsulate their continuation state in its own cursor.

Run `test/contracts/feedProviderContract.ts` for each provider along with adapter
coverage of supported subjects, scopes, empty pages, parent references, malformed
responses, and continuation. See the provider README for capability restrictions.
