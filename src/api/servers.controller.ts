import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serverService } from "../services/server.service";
import { serverLogStore, type LogLevel, type ServerLogEntry } from "../mcp/upstream/logger";
import { serverEvents, type ServerStatusEvent } from "../mcp/upstream/events";

const app = new Hono();

// Real-time SSE events stream (server_status and server_log)
app.get("/events", (c) => {
  const targetServerId = c.req.query("serverId");

  c.header("X-Accel-Buffering", "no");
  c.header("Cache-Control", "no-cache, no-transform");

  return streamSSE(c, async (stream) => {
    // Send initial connection ACK
    await stream.writeSSE({
      event: "ping",
      data: JSON.stringify({ timestamp: new Date().toISOString() }),
    });

    const handleStatus = async (event: ServerStatusEvent) => {
      if (targetServerId && event.serverId !== targetServerId) return;
      try {
        await stream.writeSSE({
          event: "server_status",
          data: JSON.stringify(event),
        });
      } catch {
        // Handled by onAbort cleanup
      }
    };

    const handleLog = async (entry: ServerLogEntry) => {
      if (targetServerId && entry.serverId !== targetServerId) return;
      try {
        await stream.writeSSE({
          event: "server_log",
          data: JSON.stringify(entry),
        });
      } catch {
        // Handled by onAbort cleanup
      }
    };

    serverEvents.on("server_status", handleStatus);
    serverEvents.on("server_log", handleLog);

    const pingTimer = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: "ping",
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
      } catch {
        clearInterval(pingTimer);
      }
    }, 15000);

    const cleanup = () => {
      clearInterval(pingTimer);
      serverEvents.off("server_status", handleStatus);
      serverEvents.off("server_log", handleLog);
    };

    stream.onAbort(cleanup);

    while (!stream.aborted) {
      await stream.sleep(10000);
    }
  });
});

// List all servers
app.get("/", (c) => {
  const servers = serverService.listServers();
  return c.json(servers);
});

// Create a server
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name || !body.transportType || !body.config) {
      return c.json({ error: "Missing required fields: name, transportType, config" }, 400);
    }
    const server = await serverService.createServer(body);
    return c.json(server, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get server by ID
app.get("/:id", (c) => {
  const id = c.req.param("id");
  const server = serverService.getServer(id);
  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }
  return c.json(server);
});

// Get server logs
app.get("/:id/logs", (c) => {
  const id = c.req.param("id");
  const level = c.req.query("level") as LogLevel | undefined;
  const limitQuery = c.req.query("limit");
  const limit = limitQuery ? parseInt(limitQuery, 10) : undefined;

  const logs = serverLogStore.getLogs(id, level, limit);
  return c.json({ logs });
});

// Clear server logs
app.delete("/:id/logs", (c) => {
  const id = c.req.param("id");
  serverLogStore.clearLogs(id);
  return c.json({ success: true });
});

// Update server
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const server = await serverService.updateServer(id, body);
    if (!server) {
      return c.json({ error: "Server not found" }, 404);
    }
    return c.json(server);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete server
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await serverService.deleteServer(id);
  return c.json({ success: true });
});

// Reconnect server (non-blocking — connection happens in background)
app.post("/:id/connect", async (c) => {
  const id = c.req.param("id");
  // Fire connection in background, don't block the HTTP response
  serverService.connectServer(id).catch((err) => {
    console.error(`[API] Background connect failed for ${id}:`, err.message);
  });
  const server = serverService.getServer(id);
  return c.json({ success: true, server });
});

// Disconnect server
app.post("/:id/disconnect", async (c) => {
  const id = c.req.param("id");
  await serverService.disconnectServer(id);
  const server = serverService.getServer(id);
  return c.json({ success: true, server });
});

// Run CLI Auth command
app.post("/:id/auth", async (c) => {
  const id = c.req.param("id");
  try {
    const result = await serverService.runAuthCommand(id);
    const updatedServer = serverService.getServer(id);

    return c.json({
      ...result,
      server: updatedServer,
    });
  } catch (err: any) {
    return c.json({ success: false, exitCode: 1, output: "", error: err.message }, 500);
  }
});

export default app;


