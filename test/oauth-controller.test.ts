import { describe, expect, test, beforeEach } from "bun:test";
import { getDb } from "../src/db";
import { mcpServers, mcpOauthSessions } from "../src/db/schema";
import oauthController from "../src/api/oauth.controller";

describe("OAuth Controller Routes", () => {
  const serverId = "test-oauth-api-server";

  beforeEach(() => {
    const db = getDb();
    db.delete(mcpOauthSessions).run();
    db.delete(mcpServers).run();

    db.insert(mcpServers)
      .values({
        id: serverId,
        name: "test-oauth-server",
        transportType: "streamable-http",
        configJson: JSON.stringify({ url: "https://example.com/mcp" }),
        authType: "oauth2",
        authDataJson: JSON.stringify({}),
        status: "disconnected",
      })
      .run();
  });

  test("GET /authorize returns 400 for missing serverId", async () => {
    const res = await oauthController.request("/authorize");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required parameter: serverId");
  });

  test("GET /authorize returns 404 for unknown serverId", async () => {
    const res = await oauthController.request("/authorize?serverId=non-existent");
    expect(res.status).toBe(404);
  });

  test("GET /callback returns 400 for missing params", async () => {
    const res = await oauthController.request("/callback");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required query parameters");
  });

  test("GET /callback returns HTML with error page and postMessage for browser navigation", async () => {
    const res = await oauthController.request("/callback?error=invalid_scope&error_description=requested+scope+is+not+allowed", {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("OAuth Authorization Error");
    expect(html).toContain("invalid_scope");
    expect(html).toContain("requested scope is not allowed");
    expect(html).toContain("MCP_OAUTH_COMPLETE");
  });
});

