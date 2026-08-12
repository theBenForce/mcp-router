import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { getDb, closeDb } from "./db";
import serversController from "./api/servers.controller";
import toolsController from "./api/tools.controller";
import keysController from "./api/keys.controller";
import auditController from "./api/audit.controller";
import promptsController from "./api/prompts.controller";
import oauthController from "./api/oauth.controller";
import downstreamHandler from "./mcp/downstream/handler";
import { upstreamManager } from "./mcp/upstream/manager";

const app = new Hono();

// Global Middleware
app.use("*", logger());
app.use("*", cors());

// Healthcheck Endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Management REST API Routes
app.route("/api/servers", serversController);
app.route("/api/tools", toolsController);
app.route("/api/keys", keysController);
app.route("/api/audit", auditController);
app.route("/api/prompts", promptsController);
app.route("/api/oauth", oauthController);

// Downstream MCP Proxy Transports (SSE & Streamable HTTP)
app.route("/", downstreamHandler);

// Serve Frontend SPA Static Assets
const staticDir = fs.existsSync(config.publicDir)
  ? config.publicDir
  : path.join(process.cwd(), "src", "web", "dist");

if (fs.existsSync(staticDir)) {
  app.use("/assets/*", serveStatic({ root: path.relative(process.cwd(), staticDir) }));
  app.get("*", serveStatic({ path: path.relative(process.cwd(), path.join(staticDir, "index.html")) }));
}

// Initialize DB on server start
getDb();

// Reconnect servers and refresh tool definitions on startup
upstreamManager.reconnectAll().catch((err) => {
  console.error("[Startup] Server reconnect failed:", err);
});

// Graceful process shutdown
const shutdown = async () => {
  console.log("[Process] Shutdown signal received, cleaning up...");
  try {
    await upstreamManager.disconnectAll();
    closeDb();
  } catch (err: any) {
    console.error("[Process] Shutdown error:", err.message);
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function startServer(preferredPort: number, maxAttempts = 10) {
  let currentPort = preferredPort;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const server = Bun.serve({
        port: currentPort,
        hostname: config.host,
        fetch: app.fetch,
      });
      console.log(`🚀 MCP Router starting on ${config.host}:${server.port}`);
      config.port = server.port;
      return server;
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" || err?.message?.includes("EADDRINUSE")) {
        console.warn(`[Server] Port ${currentPort} in use, trying ${currentPort + 1}...`);
        currentPort++;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed to bind to any port starting from ${preferredPort}`);
}

startServer(config.port);
