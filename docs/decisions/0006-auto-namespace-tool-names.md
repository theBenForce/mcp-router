---
status: "accepted"
date: 2026-08-10
---
# Auto-Namespace Tool Names with Server Prefix

## Context and Problem Statement

The MCP Router aggregates tools from multiple upstream MCP servers and presents them as a unified tool catalog to downstream clients. Different servers may expose tools with identical names (e.g., `search`, `read_file`, `list`). When a downstream client calls a tool, the router must know which upstream server to forward the request to. We need a strategy for handling tool name collisions and routing.

## Decision Drivers

* Tool names from different servers can collide (e.g., two servers both exposing `read_file`)
* Downstream clients see a flat list of tools — they have no concept of "which server" a tool belongs to
* The routing mechanism must be unambiguous — every tool call must resolve to exactly one upstream server
* The solution should work automatically without requiring manual configuration for each tool
* Tool names should remain human-readable and predictable

## Considered Options

* Auto-namespace with server prefix — Automatically prefix every tool with its server name using a double-underscore separator: `{server_name}__{tool_name}` (e.g., `github__search_issues`, `slack__search_messages`). This is applied universally, not just on collision.
* Custom aliasing / selective prefixing — Allow users to manually rename tools or set custom prefixes per server in the UI. Only prefix when a collision is detected.
* No prefixing (raw names) — Keep tool names as-is from upstream servers. On collision, reject the second server or show an error.

## Decision Outcome

Chosen option: "Auto-namespace with server prefix", because it eliminates ambiguity universally. Every tool name encodes its source server, making routing deterministic. The double-underscore convention (`server__tool`) is readable, parseable, and avoids conflicts with tool names that use single underscores. Applying it universally (not just on collision) means tool names are stable and predictable — adding a new server never changes existing tool names.

### Consequences

* Good, because zero ambiguity — every tool name maps to exactly one upstream server
* Good, because deterministic and stable — tool names don't change when new servers are added or removed
* Good, because human-readable — `github__search_issues` clearly communicates source and function
* Good, because trivially parseable — split on `__` to resolve `{serverName, toolName}` for routing
* Good, because no manual configuration needed — works out of the box
* Neutral, because tool names are longer, which uses more tokens in LLM context windows
* Bad, because LLM clients see prefixed names which may be less natural for the model (e.g., `github__search_issues` vs `search_issues`)
* Bad, because if a user only has one server, the prefix is redundant (but consistent)

## Pros and Cons of the Options

### Auto-namespace with server prefix

Automatically prepend the server name followed by a double-underscore separator (`{server_name}__{tool_name}`) to every tool exposed by upstream MCP servers (e.g., `github__search_issues`, `slack__search_messages`). This transformation is applied universally across all aggregated tools.

* Good, because zero ambiguity — every tool name maps to exactly one upstream server
* Good, because deterministic and stable — tool names don't change when new servers are added or removed
* Good, because human-readable — `github__search_issues` clearly communicates source and function
* Good, because trivially parseable — split on `__` to resolve `{serverName, toolName}` for routing
* Good, because no manual configuration needed — works out of the box
* Neutral, because tool names are longer, which uses more tokens in LLM context windows
* Bad, because LLM clients see prefixed names which may be less natural for the model (e.g., `github__search_issues` vs `search_issues`)
* Bad, because if a user only has one server, the prefix is redundant (but consistent)

### Custom aliasing / selective prefixing

Allow users to define custom names or prefixes per server via configuration/UI, and only apply prefixing selectively when naming collisions occur between servers.

* Good, because tool names remain clean and short (e.g., `search_issues`) when no naming collisions are present
* Good, because users gain full control over naming schemes and custom aliases for upstream tools
* Neutral, because tool names remain concise in single-server environments
* Bad, because conditional prefixing causes tool names to suddenly change when a newly registered server conflicts with an existing one, breaking downstream client prompts
* Bad, because relying on manual configuration increases operational friction and administrative setup overhead

### No prefixing (raw names)

Keep tool names as-is from upstream servers without modification. On collision, reject the second server or show an error.

* Good, because tool names remain completely natural and unaltered from their original upstream declarations
* Good, because no name transformation logic or string parsing overhead is needed on the proxy layer
* Bad, because naming collisions between servers are unresolvable without rejecting valid upstream tools or servers
* Bad, because downstream clients cannot access multiple upstream servers that share common tool names like `read_file` or `search`

## More Information

* See ADR-0001 for gateway architecture and tool aggregation overview.
* Routing engine implementation splits `{serverName}__{toolName}` on the double-underscore delimiter (`__`).
