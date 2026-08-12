import { describe, expect, test, afterAll } from "bun:test";
import { Hono } from "hono";
import keysController from "../src/api/keys.controller";
import { keyService } from "../src/services/key.service";
import { closeDb, getRawDb } from "../src/db";

describe("Export Config Allowed Servers Endpoint", () => {
  afterAll(() => {
    closeDb();
  });

  test("GET /api/keys/:id/allowed-servers filters servers based on enabled tools", async () => {
    const rawDb = getRawDb();
    const app = new Hono();
    app.route("/api/keys", keysController);

    // Create 2 servers
    const server1Id = crypto.randomUUID();
    const server1Name = `test-srv-1-${server1Id.slice(0, 8)}`;
    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, ?, 'sse', '{}', 'connected')
    `).run(server1Id, server1Name);

    const server2Id = crypto.randomUUID();
    const server2Name = `test-srv-2-${server2Id.slice(0, 8)}`;
    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, ?, 'sse', '{}', 'connected')
    `).run(server2Id, server2Name);

    // Insert a tool for server 1
    const tool1Id = crypto.randomUUID();
    rawDb.query(`
      INSERT INTO mcp_tools (id, server_id, name, namespaced_name, input_schema_json)
      VALUES (?, ?, 'tool_one', 'srv1_tool_one', '{}')
    `).run(tool1Id, server1Id);

    // Insert a tool for server 2
    const tool2Id = crypto.randomUUID();
    rawDb.query(`
      INSERT INTO mcp_tools (id, server_id, name, namespaced_name, input_schema_json)
      VALUES (?, ?, 'tool_two', 'srv2_tool_two', '{}')
    `).run(tool2Id, server2Id);

    // Key with access ONLY to Server 1
    const keySrv1 = keyService.createKey({ name: "Server 1 Only Key" });
    keyService.setPermissions(keySrv1.id, {
      permissions: [{ serverId: server1Id }],
    });

    const res1 = await app.request(`/api/keys/${keySrv1.id}/allowed-servers`);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.servers).toBeDefined();
    expect(data1.servers.map((s: any) => s.id)).toContain(server1Id);
    expect(data1.servers.map((s: any) => s.id)).not.toContain(server2Id);

    // Key with NO permissions
    const keyEmpty = keyService.createKey({ name: "No Perms Key" });
    const resEmpty = await app.request(`/api/keys/${keyEmpty.id}/allowed-servers`);
    expect(resEmpty.status).toBe(200);
    const dataEmpty = await resEmpty.json();
    expect(dataEmpty.servers).toHaveLength(0);
    expect(dataEmpty.hasPromptsAccess).toBe(false);
  });
});
