import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { closeDb, getDb } from "../src/db";
import { mcpServers } from "../src/db/schema";

describe("OAuth Controller Scope Discovery", () => {
  afterAll(() => {
    closeDb();
  });

  test("GET /api/oauth/discover returns scopes_supported from Atlassian resourceMetadata", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/oauth/discover?url=https://mcp.atlassian.com/v1/mcp/authv2")
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authorizationServerUrl).toBeDefined();
    expect(Array.isArray(data.scopes_supported)).toBe(true);
    expect(data.scopes_supported.length).toBeGreaterThan(0);
    expect(data.scopes_supported).toContain("read:jira-work");
    expect(data.scopes_supported).toContain("write:jira-work");
    expect(data.scopes_supported).toContain("read:page:confluence");
  });

  test("GET /api/oauth/authorize uses resourceMetadata scopes when config scopes are omitted", async () => {
    const db = getDb();
    const serverId = `test-atlassian-oauth-${crypto.randomUUID().slice(0, 8)}`;

    db.insert(mcpServers)
      .values({
        id: serverId,
        name: `atlassian-test-${crypto.randomUUID().slice(0, 6)}`,
        transportType: "streamable-http",
        configJson: JSON.stringify({ url: "https://mcp.atlassian.com/v1/mcp/authv2" }),
        authType: "oauth2",
        authDataJson: JSON.stringify({}),
        status: "disconnected",
      })
      .run();

    const res = await app.fetch(
      new Request(`http://localhost/api/oauth/authorize?serverId=${serverId}`, {
        redirect: "manual",
      })
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBeDefined();
    expect(location).toContain("scope=");
    expect(decodeURIComponent(location!)).toContain("read:jira-work");
    expect(decodeURIComponent(location!)).toContain("write:jira-work");
  });
});
