---
status: "accepted"
date: 2026-08-10
---
# Use Extensible Auth Provider Pattern for Upstream Authentication

## Context and Problem Statement

Upstream MCP servers require different authentication mechanisms. Some need API keys passed as headers, some use Bearer tokens, and some may require full OAuth 2.0 / OIDC authorization code flows with PKCE, token refresh, and browser-based consent. We need to design the upstream authentication layer so it works for simple cases now but can support OAuth flows in the future without refactoring.

## Decision Drivers

* Phase 1 requires API key and Bearer token authentication (static credentials)
* OAuth 2.0 support is planned for a future phase but should not require architectural changes
* Each upstream server may use a different auth mechanism
* Auth credentials must be stored securely in the database
* Token refresh (for OAuth) should happen transparently without disrupting active connections

## Considered Options

* Auth provider interface pattern — Define an `AuthProvider` interface with methods like `getHeaders()` and optional `refresh()`. Implement `BearerAuthProvider` and `ApiKeyAuthProvider` now. Add `OAuth2AuthProvider` later by implementing the same interface.
* Hardcoded auth handling — Switch/case on auth type in the connection manager. Add new cases as needed.
* Middleware-based auth — Use Hono middleware per upstream server to inject auth headers. Different middleware per auth type.

## Decision Outcome

Chosen option: "Auth provider interface pattern", because it follows the Strategy pattern, making auth types pluggable. Adding OAuth 2.0 later means implementing a new class that conforms to the same `AuthProvider` interface. The connection manager doesn't need to know the details of how credentials are obtained — it just calls `provider.getHeaders()`. This keeps the auth logic decoupled from connection management.

### Consequences

* Good, because adding OAuth 2.0 is a purely additive change — implement `OAuth2AuthProvider` without modifying existing code
* Good, because each provider encapsulates its own credential storage, header generation, and refresh logic
* Good, because connection manager code stays clean — just calls `provider.getHeaders()` regardless of auth type
* Good, because easy to test — mock the interface for unit tests
* Neutral, because slightly more abstraction than needed for Phase 1 (only two simple providers)
* Bad, because OAuth 2.0 will still require additional infrastructure (browser redirect endpoints, callback handlers, token storage) beyond just implementing the interface

## Pros and Cons of the Options

### Auth provider interface pattern

Define a unified `AuthProvider` interface with methods such as `getHeaders(): Promise<Record<string, string>>` and an optional `refresh(): Promise<void>`. Implement concrete classes like `BearerAuthProvider` and `ApiKeyAuthProvider` for static credentials in Phase 1, while allowing `OAuth2AuthProvider` to be added in future phases.

* Good, because it implements the classic Strategy pattern, cleanly decoupling authentication credential retrieval from connection lifecycle management.
* Good, because adding new authentication mechanisms (e.g., OAuth 2.0 with PKCE or mutual TLS) only requires implementing a new provider class without touching existing connection dispatch code.
* Good, because each provider class self-encapsulates its specific state, configuration parameters, header formatting, and refresh lifecycle.
* Good, because mocking authentication in unit and integration tests is straightforward by providing a stubbed implementation of `AuthProvider`.
* Neutral, because introducing an abstraction interface adds a small layer of boilerplate code for Phase 1 when only static Bearer and API key auth are implemented.
* Bad, because while the interface unifies header generation, complex flows like OAuth 2.0 still require separate supporting HTTP endpoints (OAuth callbacks, consent redirect routes) outside the provider class itself.

### Hardcoded auth handling

Implement authentication handling directly within the connection manager using `switch/case` or `if/else` conditional blocks based on the server's configured authentication type.

* Good, because it is extremely straightforward to write initially for Phase 1, requiring no extra interface abstractions or file definitions.
* Good, because all authentication handling logic lives in one place alongside connection establishment.
* Bad, because it violates the Open/Closed Principle; adding a new authentication method like OAuth 2.0 requires editing core connection manager code.
* Bad, because conditional logic will quickly become bloated, complex, and unmaintainable as additional auth parameters and refresh rules are introduced.
* Bad, because testing individual auth mechanisms in isolation requires instantiating or mocking large portions of the connection manager.

### Middleware-based auth

Utilize Hono HTTP middleware functions on a per-upstream basis to inject authentication headers into outgoing proxy requests dynamically based on upstream server route metadata.

* Good, because it leverages native Hono routing and middleware pipelines for injecting headers.
* Good, because middleware can be composed conditionally per upstream route configuration.
* Bad, because upstream connections in MCP Router may involve persistent WebSocket or SSE connections managed outside standard Hono request-response HTTP cycles.
* Bad, because middleware is tied closely to incoming HTTP request contexts rather than the lifecycle of outbound client connections to upstream MCP servers.
* Bad, because managing stateful operations like OAuth 2.0 token refresh across background client connections does not fit cleanly into Hono middleware models.

## More Information

Phase 1 providers: `BearerAuthProvider` (passes `Authorization: Bearer <token>` header), `ApiKeyAuthProvider` (passes custom header like `X-Api-Key: <key>`). Future: `OAuth2AuthProvider` with PKCE, state management, token refresh. Auth data is stored encrypted in `mcp_servers.auth_data_json`. See ADR-0004 for database details.
