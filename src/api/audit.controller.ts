import { Hono } from "hono";
import { auditService } from "../services/audit.service";

const app = new Hono();

app.get("/", (c) => {
  const apiKeyId = c.req.query("apiKeyId");
  const serverId = c.req.query("serverId");
  const status = c.req.query("status");
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : 50;
  const offset = c.req.query("offset") ? parseInt(c.req.query("offset")!, 10) : 0;

  const logs = auditService.queryLogs({
    apiKeyId,
    serverId,
    status,
    limit,
    offset,
  });

  return c.json(logs);
});

export default app;
