import { describe, expect, test, beforeEach } from "bun:test";
import { getDb } from "../src/db";
import { mcpServers, mcpOauthSessions } from "../src/db/schema";
import { MCPRouterOAuthProvider } from "../src/mcp/upstream/oauth-provider";

describe("MCPRouterOAuthProvider", () => {
  const serverId = "test-oauth-server-id";

  beforeEach(() => {
    const db = getDb();
    db.delete(mcpOauthSessions).run();
    db.delete(mcpServers).run();

    db.insert(mcpServers)
      .values({
        id: serverId,
        name: "test-oauth-server",
        transportType: "streamable-http",
        configJson: JSON.stringify({ url: "https://mcp.atlassian.com/v1/mcp/authv2" }),
        authType: "oauth2",
        authDataJson: JSON.stringify({}),
        status: "disconnected",
      })
      .run();
  });

  test("generates client metadata and default redirect URL", () => {
    const provider = new MCPRouterOAuthProvider({ serverId });
    expect(provider.redirectUrl).toContain("/api/oauth/callback");
    expect(provider.clientMetadata.grant_types).toContain("authorization_code");
  });

  test("persists PKCE code verifier and reads it back", async () => {
    const provider = new MCPRouterOAuthProvider({ serverId });
    await provider.saveCodeVerifier("test-verifier-12345");
    const verifier = await provider.codeVerifier();
    expect(verifier).toBe("test-verifier-12345");
  });

  test("persists tokens and client information in SQLite", async () => {
    const provider = new MCPRouterOAuthProvider({ serverId });
    expect(await provider.tokens()).toBeUndefined();
    expect(await provider.clientInformation()).toBeUndefined();

    await provider.saveClientInformation({
      client_id: "atlassian-client-id",
      client_secret: "atlassian-client-secret",
    });

    const clientInfo = await provider.clientInformation();
    expect(clientInfo?.client_id).toBe("atlassian-client-id");

    await provider.saveTokens({
      access_token: "access-token-123",
      refresh_token: "refresh-token-456",
      token_type: "Bearer",
      expires_in: 3600,
    });

    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBe("access-token-123");
    expect(tokens?.refresh_token).toBe("refresh-token-456");
  });
});
