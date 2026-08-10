import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { keyService } from "../src/services/key.service";
import { promptService } from "../src/services/prompt.service";
import { getRawDb, closeDb } from "../src/db";

describe("Per-Server Proxy & Dedicated Prompts Endpoints", () => {
  afterAll(() => {
    closeDb();
  });

  test("POST /mcp/servers/:serverId initializes with upstream server metadata and instructions", async () => {
    const rawDb = getRawDb();
    const serverId = crypto.randomUUID();
    const serverName = `github-${serverId.slice(0, 8)}`;
    const systemInstructions = "Always review pull requests before merging.";

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, server_title, server_version, instructions, transport_type, config_json, status)
      VALUES (?, ?, 'GitHub Server', '2.1.0', ?, 'sse', '{}', 'connected')
    `).run(serverId, serverName, systemInstructions);

    const key = keyService.createKey({
      name: "Server Key",
      permissions: [{ serverId }],
    });

    // Test with query parameter ?key=
    const res = await app.fetch(
      new Request(`http://localhost/mcp/servers/${serverId}?key=${key.secretKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.serverInfo.name).toBe("GitHub Server");
    expect(body.result.serverInfo.version).toBe("2.1.0");
    expect(body.result.instructions).toBe(systemInstructions);
  });

  test("POST /mcp/servers/:serverId returns tools/list with original un-prefixed tool names", async () => {
    const rawDb = getRawDb();
    const serverId = crypto.randomUUID();
    const toolId = crypto.randomUUID();
    const serverName = `docker-${serverId.slice(0, 8)}`;

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, ?, 'sse', '{}', 'connected')
    `).run(serverId, serverName);

    rawDb.query(`
      INSERT INTO mcp_tools (id, server_id, name, namespaced_name, description, input_schema_json)
      VALUES (?, ?, 'ps', ?, 'List containers', '{}')
    `).run(toolId, serverId, `${serverName}__ps`);

    const key = keyService.createKey({
      name: "Docker Key",
      permissions: [{ serverId }],
    });

    const res = await app.fetch(
      new Request(`http://localhost/mcp/servers/${serverId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.tools.length).toBe(1);
    // Should be un-prefixed 'ps'
    expect(body.result.tools[0].name).toBe("ps");
  });

  test("POST /mcp/servers/:serverId rejects tool calls for unauthorized server", async () => {
    const rawDb = getRawDb();
    const serverId1 = crypto.randomUUID();
    const serverId2 = crypto.randomUUID();
    const toolId = crypto.randomUUID();

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, 'srv-1', 'sse', '{}', 'connected')
    `).run(serverId1);

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, 'srv-2', 'sse', '{}', 'connected')
    `).run(serverId2);

    rawDb.query(`
      INSERT INTO mcp_tools (id, server_id, name, namespaced_name, description, input_schema_json)
      VALUES (?, ?, 'reset', 'srv-2__reset', 'Reset tool', '{}')
    `).run(toolId, serverId2);

    // Key only has permission for serverId1
    const key = keyService.createKey({
      name: "Limited Key",
      permissions: [{ serverId: serverId1 }],
    });

    const res = await app.fetch(
      new Request(`http://localhost/mcp/servers/${serverId2}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.secretKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "reset", arguments: {} },
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32001);
  });

  test("POST /mcp/servers/prompts serves dedicated prompts library", async () => {
    const prompt = promptService.createPrompt({
      name: "code_review_prompt",
      title: "Code Review",
      contentTemplate: "Please review: {{code}}",
    });

    const key = keyService.createKey({
      name: "Prompt Key",
      permissions: [{ promptId: prompt!.id }],
    });

    // 1. Initialize
    const initRes = await app.fetch(
      new Request("http://localhost/mcp/servers/prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      })
    );
    expect(initRes.status).toBe(200);
    const initBody = await initRes.json();
    expect(initBody.result.serverInfo.name).toBe("mcp-router-prompts");

    // 2. List Prompts
    const listRes = await app.fetch(
      new Request("http://localhost/mcp/servers/prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "prompts/list" }),
      })
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.result.prompts.length).toBe(1);
    expect(listBody.result.prompts[0].name).toBe("code_review_prompt");
  });

  test("responds to ping and notifications/initialized cleanly", async () => {
    const key = keyService.createKey({ name: "Ping Key" });

    // 1. Ping
    const pingRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "ping" }),
      })
    );
    expect(pingRes.status).toBe(200);
    const pingBody = await pingRes.json();
    expect(pingBody.result).toBeDefined();

    // 2. Notifications
    const notifRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.secretKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      })
    );
    expect(notifRes.status).toBe(200);
  });

  test("GET /mcp/servers/:serverId/sse preserves auth key in endpoint event payload", async () => {
    const serverId = crypto.randomUUID();
    const key = keyService.createKey({ name: "SSE Key" });

    const sseRes = await app.fetch(
      new Request(`http://localhost/mcp/servers/${serverId}/sse?key=${key.secretKey}`)
    );
    expect(sseRes.status).toBe(200);
    const text = await sseRes.text();
    expect(text).toContain(`data: /mcp/servers/${serverId}?key=${key.secretKey}`);
  });
});
