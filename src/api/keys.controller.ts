import { Hono } from "hono";
import { keyService } from "../services/key.service";
import { serverService } from "../services/server.service";
import { filterEngine } from "../mcp/downstream/filter";

const app = new Hono();

// List all API keys
app.get("/", (c) => {
  const keys = keyService.listKeys();
  return c.json(keys);
});

// Create API key
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name) {
      return c.json({ error: "Missing required field: name" }, 400);
    }
    const created = keyService.createKey(body);
    return c.json(created, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get API key by ID
app.get("/:id", (c) => {
  const id = c.req.param("id");
  const key = keyService.getKey(id);
  if (!key) {
    return c.json({ error: "API Key not found" }, 404);
  }
  return c.json(key);
});

// Get servers and prompts allowed for an API key (for export config)
app.get("/:id/allowed-servers", (c) => {
  const id = c.req.param("id");
  const key = keyService.getKey(id);
  if (!key) {
    return c.json({ error: "API Key not found" }, 404);
  }

  const allowedTools = filterEngine.filterToolsList(id);
  const serverIdsWithTools = new Set(allowedTools.map((t) => t.server_id));

  const allServers = serverService.listServers();
  const allowedServers = allServers.filter(
    (s) => s.status === "connected" && serverIdsWithTools.has(s.id)
  );

  const allowedPrompts = filterEngine.filterPromptsList(id);

  return c.json({
    servers: allowedServers,
    hasPromptsAccess: allowedPrompts.length > 0,
  });
});

// Revoke API key
app.delete("/:id", (c) => {
  const id = c.req.param("id");
  keyService.revokeKey(id);
  return c.json({ success: true });
});

// Get key permissions
app.get("/:id/permissions", (c) => {
  const id = c.req.param("id");
  const perms = keyService.getPermissions(id);
  return c.json(perms);
});

// Set key permissions
app.put("/:id/permissions", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const perms = keyService.setPermissions(id, body);
    return c.json(perms);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;

