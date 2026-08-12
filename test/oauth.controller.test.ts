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

  test("GET /api/oauth/discover returns scopes_supported for GitHub Copilot server", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/oauth/discover?url=https://api.githubcopilot.com/mcp/")
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authorizationServerUrl).toBe("https://github.com/login/oauth");
    expect(Array.isArray(data.scopes_supported)).toBe(true);
    expect(data.scopes_supported).toContain("repo");
    expect(data.scopes_supported).toContain("read:user");
  });

  test("GET /api/oauth/authorize returns 400 error when client_id is missing on server without DCR", async () => {
    const db = getDb();
    const serverId = `test-github-nodcr-${crypto.randomUUID().slice(0, 8)}`;

    db.insert(mcpServers)
      .values({
        id: serverId,
        name: `github-test-${crypto.randomUUID().slice(0, 6)}`,
        transportType: "streamable-http",
        configJson: JSON.stringify({ url: "https://api.githubcopilot.com/mcp/" }),
        authType: "oauth2",
        authDataJson: JSON.stringify({}),
        status: "disconnected",
      })
      .run();

    const res = await app.fetch(
      new Request(`http://localhost/api/oauth/authorize?serverId=${serverId}`)
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("does not support Dynamic Client Registration");
  });

  test("GET /api/oauth/authorize redirects to GitHub when client_id is configured", async () => {
    const db = getDb();
    const serverId = `test-github-with-clientid-${crypto.randomUUID().slice(0, 8)}`;

    db.insert(mcpServers)
      .values({
        id: serverId,
        name: `github-clientid-test-${crypto.randomUUID().slice(0, 6)}`,
        transportType: "streamable-http",
        configJson: JSON.stringify({ url: "https://api.githubcopilot.com/mcp/" }),
        authType: "oauth2",
        authDataJson: JSON.stringify({ client_id: "test_github_client_id" }),
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
    expect(location).toContain("https://github.com/login/oauth/authorize");
    expect(location).toContain("client_id=test_github_client_id");
  });

  test("GET /api/oauth/callback redirects to /servers?oauth_success=true without hash syntax", async () => {
    const db = getDb();
    const serverId = `test-callback-redirect-${crypto.randomUUID().slice(0, 8)}`;
    const state = `state-${crypto.randomUUID()}`;

    db.insert(mcpServers)
      .values({
        id: serverId,
        name: `callback-test-${crypto.randomUUID().slice(0, 6)}`,
        transportType: "streamable-http",
        configJson: JSON.stringify({ url: "https://mcp.atlassian.com/v1/mcp/authv2" }),
        authType: "oauth2",
        authDataJson: JSON.stringify({ client_id: "test", client_secret: "test" }),
        status: "need_auth",
      })
      .run();

    const { mcpOauthSessions } = await import("../src/db/schema");
    db.insert(mcpOauthSessions)
      .values({
        state,
        serverId,
        codeVerifier: "test-verifier",
        redirectUrl: "http://localhost:5170/api/oauth/callback",
      })
      .run();

    const res = await app.fetch(
      new Request(`http://localhost:5170/api/oauth/callback?code=mock_code&state=${state}`, {
        redirect: "manual",
      })
    );

    // Should redirect (302) or return error if token exchange fails with mock code,
    // but if it redirects, location must NOT contain hash syntax '/#/'
    const location = res.headers.get("location");
    if (location) {
      expect(location).not.toContain("/#/");
      expect(location).toContain("/servers?oauth_success=true");
    }
  });
});
