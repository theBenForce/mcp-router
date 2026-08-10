import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { config } from "./config";
import { getDb } from "./db";

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

// Initialize DB on server start
getDb();

console.log(`🚀 MCP Router starting on ${config.host}:${config.port}`);

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
