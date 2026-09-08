# First implementation (historical)

This document records the initial single-post implementation, not current behavior.
For the current feed model and MCP implementation, see [ARCHITECTURE.md](ARCHITECTURE.md)
and [MCP.md](MCP.md).

## Accepted decisions

Use the Node.js 24, TypeScript, ESM, npm workspace,
project-reference, Node test runner, and esbuild toolchain. Keep the CLI bundle
committed and expose `feeds` locally through the root package's `bin` mapping.

A platform owns URL recognition and platform-bound post identity. A provider
implements the core retrieval contract. There is no concrete generic provider.
Different providers for X resolve the same `{ platform: "x", id }` reference.
Return the entire provider JSON object without mapping, filtering, or adding a
post model. Pretty printing preserves JSON values, not original response bytes.

## Implementation sequence

1. Set up workspaces and the shared build and test toolchain.
2. Define core references, platform and provider contracts, cancellation, and errors.
3. Implement X URL parsing and fxTwitter single-status retrieval with injected
   HTTP access, response validation, timeout, and size limits.
4. Add a transport-neutral application service and explicit runtime registration.
5. Add `feeds show <post-url>`, JSON stdout, stderr diagnostics, and exit codes.
6. Verify contracts, adapters, application routing, CLI behavior, and the executable
   bundle without depending on live upstream availability.
7. Document usage, boundaries, provider behavior, and deferred work.

## Scope

Accept public X/Twitter post URLs. Fetch only `/2/status/{id}` from the fxTwitter
API. Do not retrieve threads, replies, media files,
or additional quoted posts. No cache, authentication, retries, provider fallback,
dynamic package discovery, or npm publication is included.

MCP was deferred in this initial milestone and is now implemented; see [MCP.md](MCP.md). This version prepares a shared service,
runtime configuration, cancellation, and structured errors, but no MCP server or
plugin manifests. Other platforms and providers remain future implementations.
