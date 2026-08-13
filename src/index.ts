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
import configController from "./api/config.controller";
import authController from "./api/auth.controller";
import { authMiddleware } from "./middleware/auth";
import { ensureAdminUserOnStartup } from "./services/auth.service";
import downstreamHandler from "./mcp/downstream/handler";
import { upstreamManager } from "./mcp/upstream/manager";

const app = new Hono();

const parseAllowedOrigins = (): string[] => {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  return envOrigins ? envOrigins.split(",").map((o) => o.trim()).filter(Boolean) : [];
};

const isLocalOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      url.protocol === "tauri:" ||
      url.protocol === "app:" ||
      url.protocol === "vscode-webview:"
    );
  } catch {
    return false;
  }
};

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;

      const allowedOrigins = parseAllowedOrigins();
      if (allowedOrigins.length > 0) {
        if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
          return origin;
        }
        return null;
      }

      const effectiveAuthMode = process.env.AUTH_MODE || config.authMode;
      if (effectiveAuthMode === "desktop" || config.isDev) {
        if (isLocalOrigin(origin)) return origin;
      }

      return null;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-MCP-API-Key", "X-Requested-With"],
    exposeHeaders: ["Content-Length", "X-MCP-Version"],
  })
);

// Healthcheck Endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Auth Middleware for all management API endpoints
app.use("/api/*", authMiddleware);

// Auth Controller & Management REST API Routes
app.route("/api/auth", authController);
app.route("/api/servers", serversController);
app.route("/api/tools", toolsController);
app.route("/api/keys", keysController);
app.route("/api/audit", auditController);
app.route("/api/prompts", promptsController);
app.route("/api/oauth", oauthController);
app.route("/api/config", configController);

// Downstream MCP Proxy Transports (SSE & Streamable HTTP)
app.route("/", downstreamHandler);

// Serve Frontend SPA Static Assets
const staticDir = fs.existsSync(config.publicDir)
  ? config.publicDir
  : path.join(process.cwd(), "src", "web", "dist");

const devHtmlPath = path.join(process.cwd(), "src", "web", "index.html");
const fallbackSvgPath = path.join(process.cwd(), "public", "app-icon.svg");

if (fs.existsSync(staticDir)) {
  app.use("*", serveStatic({ root: path.relative(process.cwd(), staticDir) }));
  app.get("*", serveStatic({ path: path.relative(process.cwd(), path.join(staticDir, "index.html")) }));
} else {
  app.get("/app-icon.svg", (c) => {
    if (fs.existsSync(fallbackSvgPath)) {
      const svg = fs.readFileSync(fallbackSvgPath, "utf-8");
      return c.html(svg, 200, { "Content-Type": "image/svg+xml" });
    }
    return c.text('<svg xmlns="http://www.w3.org/2000/svg"/>', 200, { "Content-Type": "image/svg+xml" });
  });

  app.get("*", (c) => {
    if (c.req.path.startsWith("/api")) return c.notFound();
    if (fs.existsSync(devHtmlPath)) {
      let html = fs.readFileSync(devHtmlPath, "utf-8");
      if (!html.includes("<title>")) {
        html = html.replace("<head>", "<head><title>MCP Router</title>");
      }
      return c.html(html);
    }
    return c.html("<!DOCTYPE html><html><head><title>MCP Router</title></head><body><div id='root'></div></body></html>");
  });
}

// Initialize DB on server start
getDb();

// Ensure default admin user is initialized on startup
ensureAdminUserOnStartup().catch((err) => {
  console.error("[Startup] Admin user initialization failed:", err);
});

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

if (import.meta.main) {
  startServer(config.port);
}

export { app };
export default app;




