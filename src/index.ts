import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { config } from "./config";
import { getDb } from "./db";
import serversController from "./api/servers.controller";
import toolsController from "./api/tools.controller";
import keysController from "./api/keys.controller";
import auditController from "./api/audit.controller";
import downstreamHandler from "./mcp/downstream/handler";

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

// Downstream MCP Proxy Transports (SSE & Streamable HTTP)
app.route("/", downstreamHandler);

// Initialize DB on server start
getDb();

console.log(`🚀 MCP Router starting on ${config.host}:${config.port}`);

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
