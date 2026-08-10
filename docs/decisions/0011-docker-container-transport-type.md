---
status: "accepted"
date: 2026-08-10
supersedes: "partially supersedes 0003"
---

# Support Docker Container Images as a First-Class Transport Type

## Context and Problem Statement

The existing MCP Router supports two upstream transport types: `stdio` (wraps a shell command in a Docker sidecar) and `sse` (connects to a remote HTTP/SSE endpoint). Users want to run pre-built Docker images that implement the MCP protocol over stdio — for example, `docker run -i --rm ghcr.io/yctimlin/mcp_excalidraw:latest` — without having to specify a shell command and base image separately. The stdio sidecar approach requires the user to decompose a Docker image into `command`, `args`, and `image` fields, which is unintuitive when the image already has an ENTRYPOINT/CMD configured.

## Decision Drivers

* Users share MCP servers as `docker run` one-liners — the onboarding flow should accept these directly
* Pre-built MCP Docker images use their own ENTRYPOINT/CMD and should not require a separate `command` field
* Environment variables and volume mounts from `docker run` should be preserved
* The sidecar infrastructure (Dockerode, container lifecycle, stdio stream management) should be reused — not duplicated

## Considered Options

* Add `docker` as a new transport type sharing the sidecar infrastructure — reuses existing Docker container lifecycle code, adds a `rawCommand` parser for quick import
* Extend the `stdio` transport to auto-detect Docker images — conflates two distinct user intents, makes the stdio config schema ambiguous
* External docker-compose integration — too heavyweight, requires users to maintain a compose file

## Decision Outcome

Chosen option: "Add `docker` as a new transport type sharing the sidecar infrastructure", because it provides a clean UX distinction (stdio = "run this shell command in a container" vs. docker = "run this pre-built container image"), reuses 100% of the sidecar code, and enables a "Quick Import" paste-and-go flow for `docker run` commands.

### Consequences

* Good, because users can paste a full `docker run` command and the system auto-fills image, env vars, and name
* Good, because `DockerTransport` replaces the broken `StdioClientTransport` stream-override hack for both `stdio` and `docker` types (DRY)
* Good, because the `docker-parser.ts` module extracts image, env, volumes, and name from arbitrary `docker run` commands
* Good, because the sidecar code path is shared — `command` is optional, and when omitted the image's ENTRYPOINT/CMD is used
* Bad, because there's now a lightweight inline parser duplicated in the frontend (AddServerModal) and a full parser on the backend (`docker-parser.ts`) — kept intentionally separate to avoid importing backend code into the Vite bundle

## More Information

* Docker command parser: `src/mcp/upstream/docker-parser.ts`
* DockerTransport (MCP SDK Transport impl): `src/mcp/upstream/docker-transport.ts`
* Frontend quick-import parser: inline in `src/web/src/components/AddServerModal.tsx`
* The `docker` config schema: `{ image: string, env: Record<string, string>, rawCommand?: string }`
