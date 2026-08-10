---
status: "accepted"
date: 2026-08-10
---
# Use Docker Sidecar Containers for Stdio MCP Servers

## Context and Problem Statement

Many MCP servers are designed to run as local stdio processes (e.g., `npx -y @modelcontextprotocol/server-filesystem`, `uvx mcp-server-github`). These servers span multiple language runtimes (Node.js, Python) with potentially conflicting version requirements. The MCP Router itself runs inside a Docker container and needs a reliable strategy for executing these stdio-based servers.

## Decision Drivers

* Avoid Python/Node.js version conflicts between different MCP servers
* Keep the main router container lightweight and focused
* Provide isolation between MCP server processes (memory, CPU, filesystem)
* Support both Node.js (npx) and Python (uv/pip) MCP servers
* Allow resource limits per MCP server to prevent one server from starving others
* Clean lifecycle management — servers should be easy to start, stop, and restart

## Considered Options

* Docker sidecar containers — Spawn a new lightweight container per stdio MCP server via Docker socket
* Container-native (install runtimes in main container) — Install Node.js, Python, and package managers directly in the main router container
* HTTP/SSE only (no stdio support) — Only support MCP servers accessible via HTTP/SSE URLs

## Decision Outcome

Chosen option: "Docker sidecar containers", because they completely eliminate runtime version conflicts, provide per-server resource isolation (memory/CPU limits), keep the main router container lean (no Node.js or Python installed), and map naturally to the container lifecycle (auto-remove on stop). The trade-off of requiring Docker socket access is acceptable for a local-only application.

### Consequences

* Good, because complete runtime isolation is guaranteed — each server gets its own Node.js or Python version with no conflicts
* Good, because resource limits (memory, CPU, PIDs) can be configured and enforced per sidecar container
* Good, because the main router image stays small (only Bun, no Node.js/Python installed)
* Good, because auto-remove containers (`AutoRemove: true`) provide clean lifecycle management without orphan processes
* Good, because failed or crashed servers are isolated and don't affect the router or other servers
* Bad, because it requires mounting the host Docker socket (`/var/run/docker.sock`), granting elevated host privileges
* Bad, because container cold-start adds latency (image pull on first use, container creation ~200-500ms)
* Bad, because it creates a more complex stream communication path — must demultiplex Docker's 8-byte framed stdout/stderr streams
* Bad, because it requires Docker to be available on the host system

## Pros and Cons of the Options

### Docker sidecar containers — Spawn a new lightweight container per stdio MCP server via Docker socket

Spawn a dedicated, lightweight container for each stdio-based MCP server using the Docker API via socket attachment (`/var/run/docker.sock`). Communication with the MCP server occurs via container stdin/stdout attachment streams.

* Good, because complete runtime isolation ensures Node.js 18, Node.js 20, Python 3.10, and Python 3.12 co-exist without dependency conflicts across containers.
* Good, because native Linux cgroups enable per-server memory limits, CPU quotas, and process limits (PID limits) to prevent resource starvation.
* Good, because keeping Node.js and Python runtimes out of the router container keeps the core MCP Router image lean, fast to build, and secure.
* Good, because configuring container auto-removal (`AutoRemove: true`) guarantees clean cleanup on container termination with no lingering files or zombie processes.
* Good, because process isolation protects the router; a crash or out-of-memory exception in an individual sidecar server cannot bring down the primary router process or sibling sidecars.
* Neutral, because programmatically controlling containers introduces a runtime dependency on the `dockerode` library and Docker Engine API.
* Bad, because mounting `/var/run/docker.sock` grants elevated container-to-host permissions, increasing security requirements for local host isolation.
* Bad, because container cold starts introduce execution latency (image downloading on initial run, creation and start overhead of ~200-500ms).
* Bad, because Docker stream attachment wraps stdin/stdout in 8-byte binary framing multiplexing stdout and stderr streams, requiring explicit stream demultiplexing.
* Bad, because it strictly requires a running Docker daemon on the host machine.

### Container-native (install runtimes in main container)

Install Node.js, Python, `npx`, `uv`, and `pip` directly into the MCP Router container image. Spawn stdio MCP servers directly as child processes using standard OS process invocation.

* Good, because process spawning overhead is minimal (sub-10ms), avoiding container initialization delay and stream demultiplexing headers.
* Good, because no host Docker socket access (`/var/run/docker.sock`) or external container engine daemon is required.
* Good, because standard process I/O pipes (stdin/stdout/stderr) are directly readable without Docker stream framing protocols.
* Bad, because global runtime and package management collisions between different Node.js or Python MCP servers quickly break dependencies.
* Bad, because including complete Node.js and Python language toolchains increases base image size by hundreds of megabytes.
* Bad, because enforcing CPU and memory quotas on child processes without cgroups requires complex custom OS wrapper logic inside the container.
* Bad, because an unexpected crash or memory leak in a child process directly impacts host resources and risks destabilizing the main router process.

### HTTP/SSE only (no stdio support)

Drop stdio transport support entirely and require all registered MCP servers to expose an HTTP or Server-Sent Events (SSE) network interface.

* Good, because the router architecture simplifies into a standard HTTP gateway/proxy without process management or Docker API integration.
* Good, because no privileged host access (such as Docker socket mounts) or local runtime execution is necessary.
* Bad, because the vast majority of existing MCP servers (such as official filesystem, git, and database adapters) are published exclusively as local stdio commands (`npx`, `uvx`).
* Bad, because users are forced to manually wrap every local stdio tool in an HTTP/SSE proxy server before connecting it to the router.
* Bad, because network protocol stack overhead adds additional latency for local tool invocations.

## More Information

Use the `dockerode` library for container lifecycle management. Recommended base images include `node:22-alpine` (~50MB) for `npx` servers and `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` (~40-50MB) for Python/uv/uvx servers. For background on the core runtime decision, see ADR-0001.
