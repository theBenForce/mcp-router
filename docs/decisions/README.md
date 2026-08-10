# Architectural Decision Records

This directory contains the architectural decisions for the MCP Router project, documented using [MADR 4.0.0](https://adr.github.io/madr/).

## Decisions

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-0001](0001-use-bun-as-runtime.md) | Use Bun as the Application Runtime | accepted |
| [ADR-0002](0002-use-hono-as-http-framework.md) | Use Hono as the HTTP Framework | accepted |
| [ADR-0003](0003-use-docker-sidecars-for-stdio-servers.md) | Use Docker Sidecar Containers for Stdio MCP Servers | accepted |
| [ADR-0004](0004-use-sqlite-for-persistence.md) | Use SQLite for Data Persistence | accepted |
| [ADR-0005](0005-dual-downstream-mcp-transport.md) | Support Dual Downstream MCP Transport (SSE + Streamable HTTP) | accepted |
| [ADR-0006](0006-auto-namespace-tool-names.md) | Auto-Namespace Tool Names with Server Prefix | accepted |
| [ADR-0007](0007-extensible-auth-provider-pattern.md) | Use Extensible Auth Provider Pattern for Upstream Authentication | accepted |
| [ADR-0008](0008-use-react-vite-tailwind-shadcn-for-frontend.md) | Use React, Vite, Tailwind CSS, and shadcn/ui for the Frontend Dashboard | accepted |
| [ADR-0009](0009-api-key-based-downstream-auth.md) | Use Hashed API Keys for Downstream Client Authentication | accepted |

## Decision Map

```
                        ┌───────────────────────┐
                        │   MCP Router System    │
                        └───────────┬───────────┘
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌─────────────┐      ┌─────────────┐       ┌─────────────┐
     │   Backend    │      │  Data Layer │       │  Frontend   │
     └──────┬──────┘      └──────┬──────┘       └──────┬──────┘
            │                    │                     │
   ADR-0001 Bun          ADR-0004 SQLite       ADR-0008 React+
   ADR-0002 Hono                                   Vite+Tailwind+
            │                                      shadcn
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
Upstream  Downstream  Auth
   │        │          │
ADR-0003  ADR-0005   ADR-0007 Upstream Auth
 Sidecars  Dual        (Provider Pattern)
ADR-0006  Transport  ADR-0009 Downstream Auth
 Namespace             (API Keys)
```

## Creating a New ADR

Use the [MADR template](https://adr.github.io/madr/) to create new decisions:

1. Copy an existing ADR as a starting point
2. Use the naming convention: `NNNN-short-title-with-dashes.md`
3. Set status to `proposed` until the decision is finalized
4. Cross-reference related ADRs in the "More Information" section
