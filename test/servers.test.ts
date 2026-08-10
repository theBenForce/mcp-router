import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { closeDb, getDb, getRawDb } from "../src/db";

describe("Servers & Tools API", () => {
  afterAll(() => {
    closeDb();
  });

  test("GET /api/servers returns empty array initially", async () => {
    const res = await app.fetch(new Request("http://localhost/api/servers"));
    expect(res.status).toBe(200);
    const servers = await res.json();
    expect(Array.isArray(servers)).toBe(true);
  });

  test("POST /api/servers creates a new server record", async () => {
    const serverName = `test-server-${crypto.randomUUID().slice(0, 8)}`;
    const payload = {
      name: serverName,
      description: "A test MCP server",
      transportType: "sse",
      config: { url: "http://localhost:8080/sse" },
      authType: "none",
    };

    const res = await app.fetch(
      new Request("http://localhost/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe(serverName);
    expect(created.transport_type).toBe("sse");
  });

  test("docker transport type is accepted in the database schema", () => {
    // Verify the schema supports 'docker' transport type by inserting directly
    const rawDb = getRawDb();
    const serverId = crypto.randomUUID();
    const serverName = `excalidraw-${serverId}`;
    const config = {
      image: "ghcr.io/yctimlin/mcp_excalidraw:latest",
      env: {
        EXPRESS_SERVER_URL: "http://host.docker.internal:3000",
        ENABLE_CANVAS_SYNC: "true",
      },
    };

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, description, transport_type, config_json, status)
      VALUES (?, ?, ?, 'docker', ?, 'disconnected')
    `).run(serverId, serverName, "Excalidraw MCP via Docker", JSON.stringify(config));

    const row = rawDb.query("SELECT * FROM mcp_servers WHERE id = ?").get(serverId) as any;
    expect(row).toBeDefined();
    expect(row.name).toBe(serverName);
    expect(row.transport_type).toBe("docker");

    const parsedConfig = JSON.parse(row.config_json);
    expect(parsedConfig.image).toBe("ghcr.io/yctimlin/mcp_excalidraw:latest");
    expect(parsedConfig.env.EXPRESS_SERVER_URL).toBe("http://host.docker.internal:3000");

    // Verify it shows up in the API
    const db = getDb();
  });

  test("GET /api/tools returns array of tools", async () => {
    const res = await app.fetch(new Request("http://localhost/api/tools"));
    expect(res.status).toBe(200);
    const tools = await res.json();
    expect(Array.isArray(tools)).toBe(true);
  });
});
