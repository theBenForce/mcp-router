import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { keyService } from "../src/services/key.service";
import { getDb, getRawDb, closeDb } from "../src/db";

describe("Downstream MCP Proxy & Permission Filter", () => {
  afterAll(() => {
    closeDb();
  });

  test("POST /mcp returns 401 without API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
    );
    expect(res.status).toBe(401);
  });

  test("POST /mcp returns tools/list filtered by API key permissions", async () => {
    const rawDb = getRawDb();

    // Insert server and tool using raw SQL for test setup
    const serverId = crypto.randomUUID();
    const toolId = crypto.randomUUID();
    const serverName = `srv-a-${serverId.slice(0, 8)}`;
    const namespacedName = `${serverName}__calc`;

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, ?, 'sse', '{}', 'connected')
    `).run(serverId, serverName);

    rawDb.query(`
      INSERT INTO mcp_tools (id, server_id, name, namespaced_name, description, input_schema_json)
      VALUES (?, ?, 'calc', ?, 'Calculator tool', '{}')
    `).run(toolId, serverId, namespacedName);

    // Create API Key with permission to srv-a
    const key = keyService.createKey({
      name: "Proxy Key",
      permissions: [{ serverId }],
    });

    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.tools.length).toBe(1);
    expect(body.result.tools[0].name).toBe(namespacedName);
  });

  test("POST /mcp rejects tool call if permission is denied", async () => {
    const rawDb = getRawDb();
    const serverId = crypto.randomUUID();
    const toolId = crypto.randomUUID();

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, 'srv-denied', 'sse', '{}', 'connected')
    `).run(serverId);

    rawDb.query(`
      INSERT INTO mcp_tools (id, server_id, name, namespaced_name, description, input_schema_json)
      VALUES (?, ?, 'calc', 'srv-denied__calc', 'Calculator tool', '{}')
    `).run(toolId, serverId);

    // Key with NO permissions
    const keyNoPerm = keyService.createKey({ name: "Unprivileged Key" });

    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyNoPerm.secretKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "srv-denied__calc", arguments: {} },
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32001);
  });
});
