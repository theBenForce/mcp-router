import { Hono } from "hono";
import { toolService } from "../services/tool.service";

const app = new Hono();

// List all discovered tools
app.get("/", (c) => {
  const serverId = c.req.query("serverId");
  const tools = toolService.listAllTools(serverId);
  return c.json(tools);
});

export default app;
