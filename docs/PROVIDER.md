# Provider contract

Each provider lives in `packages/provider-<name>` with its own manifest,
TypeScript project, source, tests, and README. It implements core `FeedProvider`
and depends only on core, never CLI, MCP, runtime, or another provider.

## Requirements

- Declare stable provider and platform IDs.
- Accept a public `URL`, optional `context`/`answers` flags, an optional opaque `cursor`, and request cancellation.
- Validate URLs and unsupported option combinations before HTTP, including for
  direct callers. Build fixed upstream endpoints; never fetch embedded content URLs.
- Make one upstream request and return its complete JSON object unchanged.
  Do not validate or normalize posts, flatten groups, filter or deduplicate results,
  interpret body-level status codes, or automatically follow cursors.
  Forward an explicit cursor as an encoded query parameter for supported endpoints;
  reject empty cursors and unsupported endpoint combinations before HTTP.
- Inject HTTP collaborators for deterministic tests.
- Parse successful responses with the built-in `Response.json()` method and return
  its result directly. Do not read streams, collect chunks, inspect response
  headers, walk/validate the result, or impose time/byte limits.
- Classify HTTP errors by status without reading their bodies. Preserve native
  exceptions as causes in `FeedError` without traversing or serializing them.
- Forward the caller's abort signal directly to fetch; do not create a deadline.
- Do not silently retry, fall back, or discover providers.

For fxTwitter profiles, `answers: true` includes replies written by the author
in the upstream timeline; `context: true` remains invalid. Post answers continue
to select the conversation endpoint. Continuation retains the same option values.

Platforms recognize public URLs. Providers own upstream endpoints and request
translation. The application selects the configured provider and passes through
its result; it does not interpret the response. There are no references, resources,
normalized pages or aggregate traversal in the shared contract. The optional cursor
enables one caller-controlled continuation request at a time.

Run `test/contracts/feedProviderContract.ts` for each provider along with adapter
coverage of supported URLs/options, complete response preservation, malformed
JSON, unsafe URLs, transport errors and cancellation. Tests require no live network.
See the provider README for endpoint behavior and [MCP.md](MCP.md) for the error response format.
