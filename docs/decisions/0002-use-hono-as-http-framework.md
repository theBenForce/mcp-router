---
status: "accepted"
date: 2026-08-10
---

# Use Hono as the HTTP Framework

## Context and Problem Statement

The MCP Router needs an HTTP framework to handle multiple types of endpoints: a REST API for the management dashboard, Server-Sent Events (SSE) for downstream MCP (Model Context Protocol) transport, a Streamable HTTP POST endpoint for an alternative MCP transport, and static file serving for the React SPA. The framework must work seamlessly with Bun (see [ADR-0001](file:///Users/bforce/repos/mcp-router/docs/decisions/0001-use-bun-as-runtime.md)) and support all these interaction patterns cleanly.

## Decision Drivers

* Built-in SSE streaming support (critical for MCP downstream transport)
* First-class Bun support with zero adapter overhead
* Built-in middleware for authentication (bearer auth), CORS, logging
* Ability to serve static files for the SPA
* Modular route grouping for separating management API from MCP proxy endpoints
* Lightweight and high-performance

## Considered Options

* Hono — Lightweight, multi-runtime, built-in SSE (`streamSSE`), bearer auth middleware, `serveStatic` for Bun, Express-like familiarity
* Elysia — Bun-optimized, higher raw throughput, but Bun-only (no portability), plugin-based SSE, smaller community
* Express.js — Most familiar, largest ecosystem, but no native Bun support, poor SSE support, heavyweight for this use case

## Decision Outcome

Chosen option: "Hono", because it has built-in SSE streaming via `streamSSE()` which is essential for MCP transport, first-class Bun integration (just `export default app`), rich built-in middleware (bearer auth, CORS, logger), `serveStatic` for serving the SPA, and clean route grouping (`app.route()`) for separating `/api/*` management routes from `/sse` and `/mcp` proxy endpoints.

### Consequences

* Good, because native SSE support via `streamSSE()` with client disconnect detection (`stream.onAbort()`) allows robust downstream MCP event handling
* Good, because built-in bearer auth middleware maps directly to our API key validation pattern
* Good, because route grouping enables clean separation: `/api/*` for REST, `/sse` for SSE transport, `/mcp` for Streamable HTTP, `/*` for SPA
* Good, because multi-runtime portability allows migrating to Node.js or Cloudflare Workers if needed
* Neutral, because slightly lower raw throughput than Elysia, but negligible for a local-only application
* Bad, because less type-safe than Elysia's schema-driven approach (though Hono's `hc` client helps)

## Pros and Cons of the Options

### Hono

Hono is a lightweight, multi-runtime HTTP framework built on Web Standards, offering native Bun integration, built-in streaming utilities, and comprehensive middleware.

* Good, because built-in `streamSSE()` helper provides native Server-Sent Events streaming complete with `stream.onAbort()` hooks for handling downstream MCP client disconnections cleanly.
* Good, because zero-overhead Bun support enables exporting the application directly (`export default app`) without requiring bridge wrappers or adapter layers.
* Good, because rich standard middleware (`bearerAuth`, `cors`, `logger`, `serveStatic`) satisfies all MCP Router authentication and asset-serving requirements out of the box.
* Good, because modular route mounting via `app.route()` facilitates clean architecture separating `/api/*` management routes, `/sse` transport, `/mcp` streamable HTTP, and static SPA serving.
* Good, because multi-runtime portability ensures the application can run on Bun, Node.js, Deno, or edge workers without refactoring framework code.
* Neutral, because HTTP request throughput is slightly lower than Bun-exclusive frameworks like Elysia, though negligible for local gateway proxy workloads.
* Bad, because client-side RPC type inference (`hc`) is less deeply integrated into request validation compared to schema-first frameworks like Elysia.

### Elysia

Elysia is a TypeScript web framework designed specifically for Bun, prioritizing high throughput and end-to-end type safety using TypeBox schemas.

* Good, because custom optimization for Bun delivers high raw HTTP request throughput and minimal memory overhead.
* Good, because schema-driven route definitions offer unified runtime request validation and compile-time type inference.
* Neutral, because SSE streaming requires plugin extensions rather than a built-in core helper like Hono's `streamSSE()`.
* Bad, because tight coupling to Bun runtime APIs limits portability if deployment target requirements change to Node.js or edge platforms.
* Bad, because smaller community ecosystem results in fewer third-party middleware packages and community resources.

### Express.js

Express.js is the traditional HTTP framework standard for Node.js, featuring widespread developer familiarity and an extensive ecosystem.

* Good, because ubiquitous industry usage makes finding solutions, middleware, and documentation straightforward.
* Good, because familiar middleware syntax minimizes developer onboarding time.
* Bad, because missing native Bun integration requires Node compatibility shims or wrapper layers, introducing latency.
* Bad, because managing SSE connections requires manual manipulation of raw HTTP response streams and header flushing without structured disconnection callbacks.
* Bad, because legacy synchronous architecture introduces unnecessary overhead for asynchronous proxy streaming operations.

## More Information

* [Hono Documentation](https://hono.dev/)
* [Hono Bun Helper & streamSSE Guide](https://hono.dev/helpers/streaming)
* See [ADR-0001](file:///Users/bforce/repos/mcp-router/docs/decisions/0001-use-bun-as-runtime.md) for the choice of Bun as the application runtime.
