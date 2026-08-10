---
status: "accepted"
date: 2026-08-10
---

# Use Bun as the Application Runtime

## Context and Problem Statement

We need to choose a JavaScript/TypeScript runtime for the MCP Router backend server. The application runs inside a Docker container, executes an HTTP server, manages SQLite database connections, and communicates with upstream MCP (Model Context Protocol) servers. It needs to be fast, support TypeScript natively, and have good built-in tooling for building a reliable local proxy gateway.

## Decision Drivers

* Native TypeScript support without a separate compilation step
* Built-in SQLite driver (`bun:sqlite`) eliminates external database dependencies
* Built-in package manager (`bun install`) replaces `npm`/`pnpm` for both backend and frontend
* Fast startup time for containerized deployment
* Built-in test runner (`bun test`) and all-in-one toolkit

## Considered Options

* Bun — Native TS, built-in SQLite, built-in package manager, fast startup, all-in-one toolkit
* Node.js with pnpm/npm — Mature ecosystem, but requires external package manager (pnpm), separate TypeScript loader, and native C++ SQLite driver (`better-sqlite3`)
* Deno — Native TS, security-first, but smaller ecosystem, different module resolution, no built-in SQLite

## Decision Outcome

Chosen option: "Bun", because it provides native TypeScript execution, a built-in high-performance SQLite driver (`bun:sqlite`), an integrated package manager (`bun install`) that eliminates the need for Node.js and `pnpm` in Docker builds, fast cold-start times ideal for containers, and a built-in test runner (`bun test`).

### Consequences

* Good, because no build step needed for backend TypeScript — run `.ts` files directly
* Good, because `bun:sqlite` provides synchronous, zero-dependency SQLite access with excellent performance
* Good, because `bun install` acts as a ultra-fast, single package manager for both the root project and `src/web` frontend, avoiding a Node.js build image in Docker
* Good, because faster package installs and test execution compared to Node.js / pnpm tooling
* Bad, because smaller community than Node.js — some npm packages may have subtle compatibility issues
* Bad, because some Node.js APIs (like certain stream behaviors) may differ slightly in Bun

## Pros and Cons of the Options

### Bun

Bun is a modern JavaScript/TypeScript runtime designed as an all-in-one toolchain featuring native TypeScript execution, a built-in SQLite client, integrated package manager, and test runner.

* Good, because native execution of TypeScript files eliminates extra compilation steps (`tsc`, `tsx`, `ts-node`) in development workflows and Docker container builds.
* Good, because `bun:sqlite` is built into the runtime binary, providing zero-dependency synchronous SQLite database access with exceptional performance.
* Good, because cold startup performance is extremely fast, minimizing container boot latency for the MCP Router backend service.
* Good, because built-in `bun install` and `bun test` streamline package management and unit testing without requiring extra tooling dependencies.
* Neutral, because while it targets Node.js API compatibility, minor discrepancies may exist for less common Node core APIs.
* Bad, because the community and ecosystem are smaller than Node.js, meaning fewer established patterns for obscure edge cases.

### Node.js with tsx/ts-node

Node.js is the traditional server-side JavaScript runtime with the largest ecosystem and battle-tested stability, paired with loaders like `tsx` for TypeScript execution.

* Good, because Node.js offers unmatched ecosystem maturity, extensive documentation, and universal third-party package compatibility.
* Good, because enterprise adoption ensures long-term support and predictable runtime behavior across diverse deployment environments.
* Bad, because executing TypeScript requires supplementary runtime transpilation tools (`tsx` or `ts-node`) or explicit `tsc` build pipelines, increasing container image complexity.
* Bad, because SQLite integration requires external native C++ bindings such as `better-sqlite3`, complicating multi-architecture Docker builds (cross-compiling x86_64 and arm64).
* Bad, because package resolution (`npm`/`pnpm`) and test execution (`jest`/`vitest`) rely on separate heavy dependencies with slower overall execution speed.

### Deno

Deno is a secure-by-default TypeScript runtime built on V8 and Rust that adheres closely to Web Standard APIs.

* Good, because first-class native TypeScript execution is built directly into the runtime engine.
* Good, because granular security permissions restrict network, filesystem, and environment variable access by default.
* Neutral, because Deno supports npm modules via `npm:` specifiers, though compatibility with complex Node-centric libraries can occasionally require workarounds.
* Bad, because Deno lacks an out-of-the-box, zero-dependency native C-based SQLite driver equivalent to `bun:sqlite` built into its core distribution.
* Bad, because non-standard module resolution patterns (URL imports) differ from standard Node/npm ecosystem conventions used across MCP SDKs.

## More Information

* [Bun Documentation](https://bun.sh/docs)
* [bun:sqlite Documentation](https://bun.sh/docs/api/sqlite)
* Model Context Protocol Specification: https://modelcontextprotocol.io
* See [ADR-0002](file:///Users/bforce/repos/mcp-router/docs/decisions/0002-use-hono-as-http-framework.md) for the decision on choosing Hono as the HTTP framework running on Bun.
