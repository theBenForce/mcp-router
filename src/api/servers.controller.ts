import { Hono } from "hono";
import { serverService } from "../services/server.service";

const app = new Hono();

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

// Reconnect server
app.post("/:id/connect", async (c) => {
  const id = c.req.param("id");
  const success = await serverService.connectServer(id);
  const server = serverService.getServer(id);
  return c.json({ success, server });
});

// Disconnect server
app.post("/:id/disconnect", async (c) => {
  const id = c.req.param("id");
  await serverService.disconnectServer(id);
  const server = serverService.getServer(id);
  return c.json({ success: true, server });
});

export default app;
