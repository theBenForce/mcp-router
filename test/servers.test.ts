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

  test("PUT /api/servers/:id updates server configuration and parameters", async () => {
    const serverName = `server-to-edit-${crypto.randomUUID().slice(0, 8)}`;
    const createRes = await app.fetch(
      new Request("http://localhost/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: serverName,
          description: "Original description",
          transportType: "stdio",
          config: { command: "npx", args: ["-y", "mcp-server-test"] },
          authType: "none",
        }),
      })
    );

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const serverId = created.id;

    // Update server parameters via PUT
    const updatePayload = {
      name: `${serverName}-edited`,
      description: "Updated description",
      transportType: "docker",
      config: {
        image: "ghcr.io/mcp/updated-image:latest",
        env: { TEST_KEY: "test_val" },
      },
      authType: "bearer",
      authData: { token: "secret-token-123" },
    };

    const updateRes = await app.fetch(
      new Request(`http://localhost/api/servers/${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      })
    );

    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();

    expect(updated.name).toBe(`${serverName}-edited`);
    expect(updated.description).toBe("Updated description");
    expect(updated.transport_type).toBe("docker");
    expect(updated.auth_type).toBe("bearer");

    // Fetch details to ensure persistent DB update
    const getRes = await app.fetch(new Request(`http://localhost/api/servers/${serverId}`));
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();

    expect(fetched.name).toBe(`${serverName}-edited`);
    expect(fetched.config.image).toBe("ghcr.io/mcp/updated-image:latest");
    expect(fetched.config.env.TEST_KEY).toBe("test_val");
    expect(fetched.auth_data.token).toBe("secret-token-123");
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
  });

  test("GET /api/tools returns array of tools", async () => {
    const res = await app.fetch(new Request("http://localhost/api/tools"));
    expect(res.status).toBe(200);
    const tools = await res.json();
    expect(Array.isArray(tools)).toBe(true);
  });

  test("server metadata columns exist and are exposed via GET /api/servers", async () => {
    const rawDb = getRawDb();
    const serverId = crypto.randomUUID();
    const serverName = `metadata-server-${serverId.slice(0, 8)}`;

    rawDb.query(`
      INSERT INTO mcp_servers (id, name, description, server_version, server_title, instructions, website_url, icons_json, transport_type, config_json, status)
      VALUES (?, ?, ?, '1.2.3', 'Test Title', 'Follow these guidelines', 'https://example.com', '[{"src":"icon.png"}]', 'sse', '{}', 'connected')
    `).run(serverId, serverName, "Metadata description");

    const getRes = await app.fetch(new Request(`http://localhost/api/servers/${serverId}`));
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();

    expect(fetched.server_version).toBe("1.2.3");
    expect(fetched.server_title).toBe("Test Title");
    expect(fetched.instructions).toBe("Follow these guidelines");
    expect(fetched.website_url).toBe("https://example.com");
    expect(fetched.icons_json).toBe('[{"src":"icon.png"}]');
  });
});
