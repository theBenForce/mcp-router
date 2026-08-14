import { Hono } from "hono";
import { registryService } from "../services/registry.service";
import { serverService } from "../services/server.service";

const app = new Hono();

// GET /api/registry/servers — Search & list servers from the official MCP registry
app.get("/servers", async (c) => {
  const search = c.req.query("search");
  const cursor = c.req.query("cursor");
  const limitQuery = c.req.query("limit");
  const version = c.req.query("version");

  const limit = limitQuery ? parseInt(limitQuery, 10) : undefined;

  try {
    const data = await registryService.listServers({
      search: search || undefined,
      cursor: cursor || undefined,
      limit: limit && !isNaN(limit) ? limit : undefined,
      version: version || undefined,
    });

    return c.json(data);
  } catch (err: any) {
    console.error("[RegistryController] Failed to query MCP registry:", err.message);
    return c.json({ error: err.message }, 502);
  }
});

// GET /api/registry/servers/:serverName/versions/:version — Get specific server version detail
app.get("/servers/:serverName/versions/:version", async (c) => {
  const serverName = decodeURIComponent(c.req.param("serverName"));
  const version = decodeURIComponent(c.req.param("version") || "latest");

  try {
    const data = await registryService.getServerVersion(serverName, version);
    return c.json(data);
  } catch (err: any) {
    console.error(`[RegistryController] Failed to fetch server '${serverName}':`, err.message);
    return c.json({ error: err.message }, 502);
  }
});

// POST /api/registry/install — Quick-install a server directly from registry
app.post("/install", async (c) => {
  try {
    const body = await c.req.json();
    if (!body || !body.server || !body.server.name) {
      return c.json({ error: "Missing required field: server" }, 400);
    }

    const availableOptions = registryService.getAvailableTransportOptions(body.server);
    if (availableOptions.length === 0) {
      return c.json({ error: "No compatible transport options found for this server" }, 400);
    }

    const selectedOption = body.optionId
      ? availableOptions.find((o) => o.id === body.optionId) || availableOptions[0]
      : availableOptions[0];

    const createInput = registryService.convertRegistryServerToCreateInput(
      body.server,
      selectedOption,
      body.env,
      body.authData,
      body.name
    );

    const createdServer = await serverService.createServer(createInput);
    return c.json(createdServer, 201);
  } catch (err: any) {
    console.error("[RegistryController] Failed to install server from registry:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

export default app;
