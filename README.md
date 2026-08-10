# MCP Router — Local Gateway & Proxy

[![Runtime](https://img.shields.io/badge/Runtime-Bun%201.3-black?logo=bun)](https://bun.sh)
[![Database](https://img.shields.io/badge/Database-bun%3Asqlite-blue)](https://bun.sh/docs/api/sqlite)
[![Framework](https://img.shields.io/badge/Framework-Hono-flame?logo=hono)](https://hono.dev)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Tailwind%20v4-blue?logo=react)](https://react.dev)
[![Container](https://img.shields.io/badge/Container-Docker-2496ED?logo=docker)](https://docker.com)

A local, Dockerized web application and API proxy gateway for **Model Context Protocol (MCP)** servers. Built in **TypeScript** executing with **Bun** and **SQLite**, MCP Router allows you to connect multiple upstream MCP servers, generate scoped downstream API keys, and enforce granular server- and tool-level permission matrices for LLM clients (Cursor, Claude Desktop, Antigravity, custom agents).

---

## 🌟 Key Features

- 🔌 **Upstream MCP Server Management**:
  - **Docker Sidecar Containers**: Spawns isolated, lightweight containers (`node:22-alpine`, `python:3.12-slim`) for `stdio` MCP servers via `/var/run/docker.sock`, preventing language version collisions.
  - **Remote SSE Endpoints**: Connects to external HTTP/SSE MCP servers with custom headers and Bearer tokens.
- 🏷️ **Automatic Tool Namespacing**: Discovers upstream tools and automatically prefixes them (`{server_name}__{tool_name}`) to guarantee unambiguous routing.
- 🔑 **Hashed Downstream API Keys**: Generates secure API keys with `mcpr_` prefix. Only SHA-256 hashes are stored in SQLite; raw secret tokens are shown once at creation.
- 🛡️ **Granular Permission Matrix**: Configure exactly which servers (or specific tools within a server) each API key is permitted to call.
- 🚀 **Dual Downstream Transports**:
  - `GET /sse` — Server-Sent Events transport endpoint.
  - `POST /mcp` — Streamable HTTP transport endpoint.
- 📊 **Real-time Audit Logs**: Tracks every tool invocation with status (`success`, `denied`, `error`), target server, duration, and client identity.
- 🎨 **Modern Management Dashboard**: Sleek dark-mode glassmorphism dashboard built with React 18, Vite, and Tailwind CSS v4.

---

## 🏗️ Architecture

```
 ┌──────────────────────┐         ┌──────────────────────────────────────────────────────────┐
 │  LLM Clients / IDEs  │         │                    Docker Container                      │
 │  (Cursor, Claude,    │ Bearer  │  ┌──────────────────┐       ┌─────────────────────────┐  │
 │   Antigravity, etc.) ├─────────┼─►│ Hono HTTP Server │       │  React SPA Dashboard    │  │
 └──────────────────────┘ API Key │  │                  │       │  (Vite+Tailwind+shadcn) │  │
                                  │  │  /sse   → SSE    │       └──────────┬──────────────┘  │
                                  │  │  /mcp   → HTTP   │                  │                 │
                                  │  │  /api/* → REST   │◄─────────────────┘                 │
                                  │  │  /*     → SPA    │                                    │
                                  │  └────────┬─────────┘                                    │
                                  │           │                                              │
                                  │           ▼                                              │
                                  │  ┌────────────────────────────────────────────────────┐   │
                                  │  │     Router Engine (Permission Filter + Namespace)  │   │
                                  │  └────────┬──────────────────────────┬────────────────┘   │
                                  │           │                          │                    │
                                  │           ▼                          ▼                    │
                                  │  ┌─────────────────┐        ┌──────────────────┐         │
                                  │  │ Upstream Client  │        │ SQLite Database  │         │
                                  │  │ Pool (MCP SDK)   │        │ (bun:sqlite)     │         │
                                  │  └────────┬────────┘        └──────────────────┘         │
                                  └───────────┼──────────────────────────────────────────────┘
                                              │
               ┌──────────────────────────────┼──────────────────────────────┐
               │                              │                              │
               ▼                              ▼                              ▼
    ┌────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
    │ Docker Sidecar     │       │ Docker Sidecar        │       │ Remote MCP Server    │
    │ node:22-alpine     │       │ python:3.12-slim      │       │ (HTTP/SSE endpoint)  │
    │ npx @mcp/server-fs │       │ uvx mcp-server-x      │       │ https://api.example  │
    └────────────────────┘       └──────────────────────┘       └──────────────────────┘
```

---

## 🚀 Quickstart

### Prerequisites
- [Docker](https://www.docker.com/) installed and running on your host machine.
- (Optional for local dev) [mise](https://mise.jdx.dev/) and [Bun](https://bun.sh/).

### Option 1: Run with Docker Compose (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/mcp-router.git
   cd mcp-router
   ```

2. Build and start the container:
   ```bash
   docker compose up --build -d
   ```

3. Open your browser to `http://localhost:3000` to access the Management Dashboard.

---

### Option 2: Local Development with Bun

1. Install dependencies using `mise` and `bun`:
   ```bash
   mise trust
   mise exec -- bun install
   ```

2. Build the frontend SPA assets:
   ```bash
   cd src/web && mise exec -- bun run build && cd ../..
   ```

3. Start the backend development server (with hot reload):
   ```bash
   mise exec -- bun dev
   ```

4. Open `http://localhost:3000` in your browser.

---

## 🧪 Running Tests

Run the full suite of 15+ unit and integration tests (in-memory SQLite):

```bash
DATABASE_PATH=":memory:" mise exec -- bun test
```

---

## 📖 Usage Guide

### 1. Register an Upstream MCP Server
- Open the dashboard at `http://localhost:3000` and click **Add MCP Server**.
- Choose **Stdio (Docker Sidecar)** for local commands (e.g. `npx -y @modelcontextprotocol/server-filesystem /data`) or **HTTP / SSE Endpoint** for remote servers.
- Upon saving, MCP Router automatically connects, discovers available tools, and namespaces them as `{server_name}__{tool_name}`.

### 2. Generate an API Key
- Navigate to the **API Keys** tab and click **Create New API Key**.
- Enter a label (e.g. "Claude Desktop Key").
- Copy your generated `mcpr_...` secret token (it is shown only once).

### 3. Configure the Permission Matrix
- Click **Rule(s) configured** next to your API key.
- Toggle whole servers or check individual tools to grant explicit execution permissions.

### 4. Connect Downstream Clients

#### Claude Desktop Configuration (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "mcp-router": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sse",
        "http://localhost:3000/sse?apiKey=mcpr_YOUR_SECRET_KEY_HERE"
      ]
    }
  }
}
```

#### Streamable HTTP (`POST /mcp`) via cURL
```bash
# List permitted tools
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer mcpr_YOUR_SECRET_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'

# Execute a namespaced tool
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer mcpr_YOUR_SECRET_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "filesystem__read_file",
      "arguments": { "path": "/data/example.txt" }
    }
  }'
```

---

## 📂 Project Structure

```
mcp-router/
├── Dockerfile                  # Multi-stage Bun build definition
├── docker-compose.yml          # Local container orchestration
├── .mise.toml                  # Tool version declaration (bun)
├── package.json                # Root backend dependencies & scripts
├── tsconfig.json               # TypeScript configuration
├── docs/
│   └── decisions/              # Architectural Decision Records (MADRs)
├── src/
│   ├── index.ts                # Main Hono app bootstrap & static SPA server
│   ├── config.ts               # Environment configuration
│   ├── db/
│   │   ├── index.ts            # bun:sqlite connection manager
│   │   └── schema.sql          # SQLite schema definitions
│   ├── mcp/
│   │   ├── upstream/
│   │   │   ├── manager.ts      # Upstream MCP connection manager
│   │   │   ├── sidecar.ts      # Dockerode sidecar container manager
│   │   │   └── auth.ts         # Strategy pattern auth providers
│   │   └── downstream/
│   │       ├── handler.ts      # Downstream SSE & Streamable HTTP handlers
│   │       ├── filter.ts       # Permission filter engine
│   │       └── auth_middleware.ts # Hashed API key validation middleware
│   ├── services/
│   │   ├── server.service.ts   # MCP server CRUD logic
│   │   ├── tool.service.ts     # Discovered tools queries
│   │   ├── key.service.ts      # API key generation & permissions logic
│   │   └── audit.service.ts    # Tool execution audit logging
│   ├── api/                    # Management REST API controllers
│   │   ├── servers.controller.ts
│   │   ├── tools.controller.ts
│   │   ├── keys.controller.ts
│   │   └── audit.controller.ts
│   └── web/                    # React SPA Management Dashboard
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── components/     # Modals, Sidebar, Server Cards
│       │   └── pages/          # Overview, Servers, Keys, Audit
└── test/                       # Unit and integration test suite
```

---

## 🏛️ Architectural Decisions (MADRs)

Detailed decision records are located in [docs/decisions/](docs/decisions/):

- [ADR-0001: Use Bun as the Application Runtime](docs/decisions/0001-use-bun-as-runtime.md)
- [ADR-0002: Use Hono as the HTTP Framework](docs/decisions/0002-use-hono-as-http-framework.md)
- [ADR-0003: Use Docker Sidecar Containers for Stdio MCP Servers](docs/decisions/0003-use-docker-sidecars-for-stdio-servers.md)
- [ADR-0004: Use SQLite for Data Persistence](docs/decisions/0004-use-sqlite-for-persistence.md)
- [ADR-0005: Support Dual Downstream MCP Transport (SSE + Streamable HTTP)](docs/decisions/0005-dual-downstream-mcp-transport.md)
- [ADR-0006: Auto-Namespace Tool Names with Server Prefix](docs/decisions/0006-auto-namespace-tool-names.md)
- [ADR-0007: Use Extensible Auth Provider Pattern for Upstream Authentication](docs/decisions/0007-extensible-auth-provider-pattern.md)
- [ADR-0008: Use React, Vite, Tailwind CSS, and shadcn/ui for the Frontend Dashboard](docs/decisions/0008-use-react-vite-tailwind-shadcn-for-frontend.md)
- [ADR-0009: Use Hashed API Keys for Downstream Client Authentication](docs/decisions/0009-api-key-based-downstream-auth.md)

---

## 📄 License

MIT © 2026
