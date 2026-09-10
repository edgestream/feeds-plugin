# Architecture

Feeds uses Node.js 24, TypeScript, ESM, and npm workspaces. TypeScript project
references check package boundaries. Node's test runner executes TypeScript tests
through tsx; esbuild produces the committed CLI and MCP bundles.

## Dependency direction

```text
apps/cli --------+
apps/mcp-server -+--> packages/runtime --> packages/application --> packages/core
                  |--> packages/platform-x ------------------> core
                  |--> packages/provider-fxtwitter ------------> core
```

- `core` defines the small platform/provider contracts, request options,
  cancellation, JSON values, and typed errors. It imports no Node or frontend code.
- `application` parses the public URL, selects its platform and configured provider,
  and returns the provider result unchanged.
- `platform-x` recognizes supported public X post/profile URLs. It performs no HTTP
  calls and has no reference or identity model.
- `provider-fxtwitter` selects a fixed upstream endpoint from the URL and options,
  makes one request through an injected HTTP client, and returns the complete JSON object.
  It depends only on core and validates URLs independently for direct callers.
- `runtime` reads configuration and explicitly composes platforms, providers, and
  service. There is no dynamic discovery.
- `apps/cli` parses arguments, calls the service, formats JSON, and handles process
  output and SIGINT. It constructs no providers or platforms.
- `apps/mcp-server` exposes only `get_feed` through stdio and Streamable HTTP.
  It constructs no providers or platforms.

## Data flow

`FeedService.show(url, options, context)` selects a platform using
`Platform.supports(URL)` and calls the configured `FeedProvider.get` once.
The application passes options, cancellation, and the provider result through;
it does not interpret upstream content. Consumers interpret the returned JSON.
See [PROVIDER.md](PROVIDER.md) for the retrieval contract and extension tests.

New platforms implement URL recognition; new providers implement retrieval.
Provider packages depend only on core, never on applications, runtime, or other providers.
Register both explicitly in runtime, which selects one provider per platform.
Replacing a provider may change the returned JSON structure.

## Runtime configuration

CLI and MCP share `FEEDS_X_PROVIDER`, defaulting to `fxtwitter` when absent.
Empty or unknown values are configuration errors. Runtime does not discover
providers dynamically or configure an API root, credentials, or fallback.

## Interface documentation

- [CLI.md](CLI.md): command syntax, supported public URLs, output, and exit codes.
- [MCP.md](MCP.md): tool protocol, transports, and deployment.
- [PLUGIN.md](PLUGIN.md): manifests, installation layout, and bundle verification.
