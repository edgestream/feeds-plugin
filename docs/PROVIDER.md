# Provider contract

Each provider lives in `packages/provider-<name>` with its own manifest,
TypeScript project, source, tests, and README. It implements core `FeedProvider`
within the dependency boundaries in [ARCHITECTURE.md](ARCHITECTURE.md).

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

Document supported subject/option combinations, upstream parameter mappings, and
known limitations in the provider package's README.

## Response semantics

The result preserves the complete upstream JSON object, including envelopes,
groups, duplicates, unknown fields, and cursor fields. JSON values are preserved,
not original bytes or whitespace; standard JavaScript numeric precision applies.
There is no normalized post/page model. Consumers interpret body-level status
codes and continuation fields themselves; an explicit cursor requests one further
page and does not establish complete coverage.

## Verification

Run `test/contracts/feedProviderContract.ts` for each provider along with adapter
coverage of supported URLs/options, complete response preservation, malformed
JSON, unsafe URLs, transport errors and cancellation. Tests require no live network.
See the provider README for endpoint behavior and [MCP.md](MCP.md) for the error response format.
