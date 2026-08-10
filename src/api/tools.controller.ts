import { Hono } from "hono";
import { toolService } from "../services/tool.service";

const app = new Hono();

// List all discovered tools
app.get("/", (c) => {
  const serverId = c.req.query("serverId");
  const tools = toolService.listAllTools(serverId);
  return c.json(tools);
});

// Update tool action_type
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const actionType = body.actionType || body.action_type;

  if (!actionType || !["read", "write", "delete", "execute"].includes(actionType)) {
    return c.json({ error: "Invalid action_type. Must be read, write, delete, or execute" }, 400);
  }

  const updated = toolService.updateToolActionType(id, actionType);
  if (!updated) {
    return c.json({ error: "Tool not found" }, 404);
  }

  return c.json(updated);
});

export default app;
