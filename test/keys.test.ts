import { describe, expect, test, afterAll } from "bun:test";
import { keyService } from "../src/services/key.service";
import { serverService } from "../src/services/server.service";
import { closeDb, getDb, getRawDb } from "../src/db";

describe("KeyService", () => {
  afterAll(() => {
    closeDb();
  });

  test("creates API key with mcpr_ secret token and verifies hash validation", () => {
    const created = keyService.createKey({ name: "Test Key" });
    expect(created.secretKey).toBeDefined();
    expect(created.secretKey.startsWith("mcpr_")).toBe(true);
    expect(created.keyPrefix).toBe(created.secretKey.slice(0, 12));

    // Validate token
    const validated = keyService.validateToken(created.secretKey);
    expect(validated).toBeDefined();
    expect(validated?.id).toBe(created.id);
  });

  test("rejects invalid or revoked API token", () => {
    const created = keyService.createKey({ name: "Revokable Key" });
    keyService.revokeKey(created.id);

    const validated = keyService.validateToken(created.secretKey);
    expect(validated).toBeNull();
  });

  test("sets and retrieves key permissions", async () => {
    const rawDb = getRawDb();

    // Insert dummy server
    const serverId = crypto.randomUUID();
    const serverName = `test-srv-${serverId}`;
    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, ?, 'sse', '{}', 'connected')
    `).run(serverId, serverName);

    const key = keyService.createKey({ name: "Perm Key" });
    keyService.setPermissions(key.id, {
      permissions: [{ serverId }],
    });

    const perms = keyService.getPermissions(key.id) as any[];
    expect(perms.length).toBe(1);
    expect(perms[0].server_id).toBe(serverId);
    expect(perms[0].tool_id).toBeNull();
  });
});
