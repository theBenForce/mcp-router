---
status: "accepted"
date: 2026-08-10
---
# Support Dual Downstream MCP Transport (SSE and Streamable HTTP)

## Context and Problem Statement

Downstream LLM clients (Cursor, Claude Desktop, Antigravity, custom scripts) connect to the MCP Router to access aggregated tools from upstream servers. The MCP protocol supports multiple transport mechanisms. Different clients support different transports, so we need to decide which transport(s) to offer on the downstream-facing proxy endpoint.

## Decision Drivers

* Maximize compatibility with existing MCP clients (some only support SSE, some support Streamable HTTP)
* Both transports are part of the MCP specification
* SSE provides real-time streaming for long-running tool calls
* Streamable HTTP is simpler for request-response tool calls
* Both transports must authenticate via the same API key mechanism

## Considered Options

* Dual Transport (SSE + Streamable HTTP)
* SSE only (`GET /sse`)
* Streamable HTTP only (`POST /mcp`)

## Decision Outcome

Chosen option: "Dual Transport (SSE + Streamable HTTP)", because it maximizes client compatibility. Hono's built-in `streamSSE()` makes SSE implementation straightforward (see ADR-0002), and Streamable HTTP is a simple JSON-RPC POST handler. Both endpoints share the same auth middleware and permission filter engine, so the incremental implementation cost is low.

### Consequences

* Good, because maximum client compatibility — works with any MCP client regardless of transport preference
* Good, because SSE provides real-time streaming for progress updates on long-running tool calls
* Good, because Streamable HTTP provides simple request-response for stateless integrations and scripts
* Good, because both endpoints share the same auth middleware and permission filter — no code duplication
* Neutral, because two endpoints to document and maintain, but they share the core routing logic
* Bad, because SSE requires maintaining persistent connections and handling client disconnects

## Pros and Cons of the Options

### Dual Transport (SSE + Streamable HTTP)

Expose both `GET /sse` for Server-Sent Events transport and `POST /mcp` for Streamable HTTP transport on the downstream gateway proxy interface.

* Good, because it provides universal client compatibility across both legacy and modern MCP client implementations (e.g., Cursor, Claude Desktop, custom scripts)
* Good, because SSE enables real-time token and progress streaming during long-running tool execution
* Good, because Streamable HTTP offers lightweight, stateless JSON-RPC request-response handling without persistent socket overhead
* Good, because both transport handlers share unified authentication middleware and permission filtering logic (see ADR-0002)
* Neutral, because exposing two separate endpoints slightly increases API documentation scope, though underlying proxy logic remains shared
* Bad, because managing active SSE streams requires persistent HTTP connection tracking and client disconnect handling

### SSE only (`GET /sse`)

Expose only the Server-Sent Events (`GET /sse`) transport endpoint on the downstream gateway.

* Good, because SSE is an established standard transport across earlier MCP client SDKs and implementations
* Good, because real-time streaming capabilities are natively supported for all connected clients
* Good, because maintaining a single transport endpoint simplifies the gateway API surface
* Bad, because clients that exclusively implement Streamable HTTP JSON-RPC endpoints cannot connect to the router
* Bad, because keeping long-lived SSE connections open for basic, short-lived tool calls introduces unnecessary connection holding overhead

### Streamable HTTP only (`POST /mcp`)

Expose only the Streamable HTTP (`POST /mcp`) JSON-RPC endpoint on the downstream gateway.

* Good, because simple HTTP POST request-response cycles are straightforward to debug, load balance, and consume via standard HTTP clients or scripts
* Good, because stateless HTTP endpoints eliminate the need for persistent connection state management and socket lifecycle tracking
* Bad, because clients relying solely on SSE transport will be incompatible with the gateway
* Bad, because it lacks full real-time streaming mechanics for intermediate progress notifications during prolonged execution of upstream tools

## More Information

* See ADR-0002 for details on Hono web framework selection and built-in `streamSSE()` usage.
* Model Context Protocol (MCP) Specification: Transport Layer definitions for SSE (`GET /sse`) and Streamable HTTP (`POST /mcp`).
