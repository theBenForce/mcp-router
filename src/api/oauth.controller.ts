import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  discoverOAuthServerInfo,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { getDb } from "../db";
import { mcpServers, mcpOauthSessions } from "../db/schema";
import { MCPRouterOAuthProvider } from "../mcp/upstream/oauth-provider";
import { serverService } from "../services/server.service";

const app = new Hono();

/**
 * GET /api/oauth/authorize?serverId=xxx
 * Initiates OAuth 2.1 PKCE authorization flow for an upstream server.
 */
app.get("/authorize", async (c) => {
  const serverId = c.req.query("serverId");
  if (!serverId) {
    return c.json({ error: "Missing required parameter: serverId" }, 400);
  }

  const server = serverService.getServer(serverId);
  if (!server) {
    return c.json({ error: `Server with ID ${serverId} not found` }, 404);
  }

  try {
    const config = JSON.parse(server.config_json || "{}");
    const serverUrl = config.url;
    if (!serverUrl) {
      return c.json({ error: "Server config must contain a valid url for OAuth" }, 400);
    }

    const oauthProvider = new MCPRouterOAuthProvider({ serverId });
    const serverInfo = await discoverOAuthServerInfo(serverUrl);

    let clientInfo = await oauthProvider.clientInformation();
    if (!clientInfo) {
      // Perform Dynamic Client Registration (RFC 7591)
      const registered = await registerClient(serverInfo.authorizationServerUrl, {
        metadata: serverInfo.authorizationServerMetadata,
        clientMetadata: oauthProvider.clientMetadata,
      });
      clientInfo = {
        client_id: registered.client_id,
        client_secret: registered.client_secret,
      };
      await oauthProvider.saveClientInformation(clientInfo);
    }

    const stateStr = oauthProvider.state();
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      serverInfo.authorizationServerUrl,
      {
        metadata: serverInfo.authorizationServerMetadata,
        clientInformation: clientInfo,
        redirectUrl: oauthProvider.redirectUrl,
        state: stateStr,
      }
    );

    await oauthProvider.saveCodeVerifier(codeVerifier);

    return c.redirect(authorizationUrl.toString());
  } catch (err: any) {
    console.error(`[OAuthController] Authorization error for server ${serverId}:`, err);
    return c.json({ error: err.message || String(err) }, 500);
  }
});

/**
 * GET /api/oauth/callback?code=xxx&state=yyy
 * Handles browser redirect callback after user grants authorization.
 */
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const errorParam = c.req.query("error");
  const errorDescription = c.req.query("error_description");

  if (errorParam) {
    return c.json(
      { error: `OAuth Authorization Error: ${errorParam}`, description: errorDescription },
      400
    );
  }

  if (!code || !state) {
    return c.json({ error: "Missing required query parameters: code and state" }, 400);
  }

  const db = getDb();
  const session = db
    .select()
    .from(mcpOauthSessions)
    .where(eq(mcpOauthSessions.state, state))
    .get();

  if (!session) {
    return c.json({ error: `Invalid or expired OAuth state session: ${state}` }, 400);
  }

  const serverId = session.serverId;
  const server = serverService.getServer(serverId);
  if (!server) {
    return c.json({ error: `Server with ID ${serverId} not found` }, 404);
  }

  try {
    const config = JSON.parse(server.config_json || "{}");
    const serverUrl = config.url;
    const oauthProvider = new MCPRouterOAuthProvider({ serverId });
    const serverInfo = await discoverOAuthServerInfo(serverUrl);
    const clientInfo = await oauthProvider.clientInformation();

    if (!clientInfo) {
      throw new Error("Client information missing during OAuth token exchange");
    }

    const tokens = await exchangeAuthorization(serverInfo.authorizationServerUrl, {
      metadata: serverInfo.authorizationServerMetadata,
      clientInformation: clientInfo,
      authorizationCode: code,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUrl,
    });

    await oauthProvider.saveTokens(tokens);

    // Remove state session
    db.delete(mcpOauthSessions).where(eq(mcpOauthSessions.state, state)).run();

    // Trigger background connection to discover tools
    serverService.connectServer(serverId).catch((err) => {
      console.error(`[OAuthController] Background connect failed after OAuth for ${serverId}:`, err);
    });

    // Redirect to frontend dashboard with success query param.
    // If request comes from Vite dev server or host header, redirect appropriately.
    const host = c.req.header("host") || "";
    const referer = c.req.header("referer") || "";
    let redirectTarget = "/#/servers?oauth_success=true";
    if (host.includes("5170") || referer.includes("5173")) {
      // Dev mode: frontend is on 5173
      const hostname = host.split(":")[0] || "localhost";
      redirectTarget = `http://${hostname}:5173/#/servers?oauth_success=true`;
    }
    return c.redirect(redirectTarget);
  } catch (err: any) {
    console.error(`[OAuthController] Token exchange failed for server ${serverId}:`, err);
    return c.json({ error: err.message || String(err) }, 500);
  }
});

export default app;
