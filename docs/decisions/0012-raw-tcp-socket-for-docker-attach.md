---
status: "accepted"
date: 2026-08-10
---

# Use Raw TCP Socket for Docker Container Attach in DinD Environments

## Context and Problem Statement

The MCP Router runs inside a Docker container (via OrbStack) and needs to spawn sibling containers (Docker-in-Docker) to run upstream MCP servers. To communicate with these containers over stdio, we need a bidirectional stream connected to the container's stdin/stdout. Dockerode's `container.attach({ hijack: true })` provides this, but it **hangs indefinitely** when called from inside a Docker container (DinD), and Bun's `http.request` doesn't fire the `upgrade` event needed for the HTTP 101 connection upgrade.

## Decision Drivers

* Must work in Docker-in-Docker (DinD) environments — the primary deployment mode
* Must provide bidirectional stdio (read stdout, write stdin) for MCP JSON-RPC communication
* Must work with Bun runtime (not just Node.js)
* Should reuse Dockerode for container lifecycle (create, start, stop, pull) where it works

## Considered Options

* Dockerode `container.attach({ hijack: true })` — standard approach, but hangs in DinD
* Dockerode `container.attach()` without hijack — works for reading, but stdin writes are silently dropped (read-only HTTP response stream)
* Bun `http.request` with `upgrade` event — 101 response arrives but Bun routes it to the regular callback, not the `upgrade` event handler
* Raw TCP socket to Docker API with manual HTTP upgrade — bypasses both Dockerode's hijack and Bun's broken upgrade handling

## Decision Outcome

Chosen option: "Raw TCP socket to Docker API with manual HTTP upgrade", because it is the only approach that works reliably in all three constraint dimensions: DinD environment, Bun runtime, and bidirectional stdio.

The implementation (`SidecarManager.attachRawStream()`) opens a raw `net.createConnection` to `/var/run/docker.sock`, sends the HTTP upgrade request manually, parses the 101 response headers, then uses the raw TCP socket as a bidirectional stream — piping stdout through Dockerode's `demuxStream` for frame separation and writing stdin directly to the socket.

### Consequences

* Good, because it works in DinD (OrbStack, Docker Desktop, Colima) where Dockerode's hijack hangs
* Good, because it works with Bun which doesn't fire HTTP `upgrade` events on unix sockets
* Good, because Dockerode is still used for all other Docker API calls (create, start, stop, pull, inspect) — only attach is replaced
* Good, because the raw socket gives us true bidirectional streaming with proper Docker stream multiplexing
* Bad, because we manually parse HTTP response headers, adding ~30 lines of low-level protocol code
* Bad, because the approach is less portable — if the Docker API `/attach` endpoint changes wire format, this code would need updating (unlikely, as this is a stable Docker Engine API)

## More Information

* Implementation: `SidecarManager.attachRawStream()` in `src/mcp/upstream/sidecar.ts`
* The method: creates → starts → attaches (in that order), reversing the typical attach-before-start pattern that Dockerode assumes
* Dockerode `demuxStream` still works on the raw socket because the Docker multiplexed frame format is the same regardless of how the stream is obtained
* The container lifecycle pattern: `start()` first via Dockerode API, then `attachRawStream()` via raw socket — two separate connections to the Docker daemon
* Tested end-to-end with `ghcr.io/yctimlin/mcp_excalidraw:latest` discovering 26 MCP tools through the bidirectional stdio channel
