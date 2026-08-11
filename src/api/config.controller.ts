import { Hono } from "hono";
import { config, saveAppConfig } from "../config";

const app = new Hono();

// GET /api/config — Return active runtime configuration
app.get("/", (c) => {
  return c.json({
    port: config.port,
    host: config.host,
    isDev: config.isDev,
    restartRequired: false,
  });
});

// PUT /api/config — Save updated configuration
app.put("/", async (c) => {
  const body = await c.req.json<{ port?: number; host?: string }>();
  
  if (body.port && (typeof body.port !== "number" || body.port < 1024 || body.port > 65535)) {
    return c.json({ error: "Port must be a valid number between 1024 and 65535" }, 400);
  }

  const isPortChanged = body.port !== undefined && body.port !== config.port;
  const updated = saveAppConfig(body);

  return c.json({
    port: updated.port,
    host: updated.host,
    isDev: updated.isDev,
    restartRequired: isPortChanged,
    message: isPortChanged
      ? "Port settings saved. Restart the application for port changes to take effect."
      : "Configuration saved successfully.",
  });
});

export default app;
