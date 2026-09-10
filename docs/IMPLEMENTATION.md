# First implementation (historical)

The initial milestone delivered single-post retrieval through the CLI, using the
shared Node/TypeScript workspace toolchain and an injected fxTwitter provider.
Threads, replies, author feeds, MCP, and plugin packaging were deferred then and
have since been implemented.

The initial reference/identity model and response validation, timeout, and size
limits have been superseded. This record is not a current implementation plan or
contract. Git history retains the original sequence and scope.

Current responsibilities and behavior are documented in:

- [ARCHITECTURE.md](ARCHITECTURE.md): package boundaries and composition.
- [PROVIDER.md](PROVIDER.md): retrieval contract and extension requirements.
- [CLI.md](CLI.md) and [MCP.md](MCP.md): public interfaces.
- [PLUGIN.md](PLUGIN.md) and [SKILL.md](SKILL.md): packaging and skill behavior.
