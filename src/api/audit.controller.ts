import { Hono } from "hono";
import { auditService } from "../services/audit.service";

const app = new Hono();

app.get("/", (c) => {
  const apiKeyId = c.req.query("apiKeyId");
  const serverId = c.req.query("serverId");
  const toolName = c.req.query("toolName") || c.req.query("tool");
  const status = c.req.query("status");
  const search = c.req.query("search") || c.req.query("q");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : 50;
  const offset = c.req.query("offset") ? parseInt(c.req.query("offset")!, 10) : 0;

  const logs = auditService.queryLogs({
    apiKeyId: apiKeyId && apiKeyId !== "all" ? apiKeyId : undefined,
    serverId: serverId && serverId !== "all" ? serverId : undefined,
    toolName: toolName && toolName !== "all" ? toolName : undefined,
    status: status && status !== "all" ? status : undefined,
    search: search ? search.trim() : undefined,
    limit,
    offset,
  });

  return c.json(logs);
});

app.get("/:id", (c) => {
  const id = c.req.param("id");
  const log = auditService.getLogById(id);
  if (!log) {
    return c.json({ error: "Audit log entry not found" }, 404);
  }
  return c.json(log);
});

export default app;

