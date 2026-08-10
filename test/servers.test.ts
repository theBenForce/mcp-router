import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { closeDb, getDb } from "../src/db";

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
    const payload = {
      name: "test-server",
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
    expect(created.name).toBe("test-server");
    expect(created.transport_type).toBe("sse");
  });

  test("GET /api/tools returns array of tools", async () => {
    const res = await app.fetch(new Request("http://localhost/api/tools"));
    expect(res.status).toBe(200);
    const tools = await res.json();
    expect(Array.isArray(tools)).toBe(true);
  });
});
