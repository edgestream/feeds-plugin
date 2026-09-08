# Architecture

Feeds uses Node.js 24, TypeScript, ESM, and npm workspaces.
TypeScript project references check package boundaries. Node's test runner
executes TypeScript tests through tsx; esbuild produces the committed CLI bundle.

## Dependency direction

```text
apps/cli --> packages/runtime --> packages/application --> packages/core
                  |--> packages/platform-x ------------------> core
                  |--> packages/provider-fxtwitter ------------> core
```

- `core` defines `PostRef`, `Platform`, `PostProvider`, JSON values, request
  cancellation, and typed errors. It imports no runtime, Node, CLI, or MCP code.
- `application` depends only on core. `FeedService.show` resolves a public URL
  through the platform registry and dispatches to its selected provider.
- `platform-x` owns supported URL shapes and X identity; it performs no HTTP calls
  and knows no provider.
- `provider-fxtwitter` implements the read contract with an injected HTTP client.
- `runtime` reads environment configuration and explicitly composes platforms,
  providers, and the service. No dynamic package discovery is performed.
- `apps/cli` parses arguments, calls the service, formats JSON, and handles process
  output and SIGINT. It constructs no providers or platforms.

## Identity and response

`PostRef { platform: "x", id: "123" }` identifies an X post independently of its
provider. IDs remain strings. The username in an input URL does not participate in
identity. Replacing fxTwitter with a future official X API provider leaves references
unchanged, but may change response shape.

The complete upstream JSON object is the service result. There is no normalized
post schema, provenance envelope, or X field mapping. CLI formatting changes
whitespace only in the intended JSON-value contract; the implementation uses
standard JavaScript JSON parsing and serialization, not byte-preserving output.
Upstream numeric values consequently follow JavaScript number precision.

## Extensions and MCP

A new platform implements `Platform` in its own package. A new provider implements
`PostProvider` in its own package. Register both explicitly in the composition root;
select one provider for each platform. Providers never depend on each other or on
frontends. Future capabilities such as feeds or search need separate contracts;
the current provider is only required to retrieve one post.

MCP is not implemented. Its future app will call the same service and runtime,
pass cancellation through `RequestContext.signal`, and translate `FeedError`
codes to protocol errors. It must not assume the JSON payload is a normalized post.

## Verification

Provider contracts live in `test/contracts`. Adapter tests inject HTTP responses
and cover malformed responses, unsafe input, limits, and cancellation. CLI tests
cover stdout, stderr, and exit codes. The packaging test invokes local `npx feeds`
against the committed bundle with an injected fetch preload, without live network
access. Rebuild the bundle after changes to runtime sources or dependencies.
