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

function createTimeoutFetch(timeoutMs = 10000) {
  return (url: any, init?: any) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (init?.signal) {
      init.signal.addEventListener("abort", () => controller.abort());
    }
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}

/**
 * GET /api/oauth/discover?url=xxx
 * Discovers OAuth 2.1 authorization server metadata (RFC 8414/9728)
 * and returns supported scopes and metadata.
 */
app.get("/discover", async (c) => {
  const urlParam = c.req.query("url");
  if (!urlParam) {
    return c.json({ error: "Missing required parameter: url" }, 400);
  }

  try {
    const serverInfo = await discoverOAuthServerInfo(urlParam, { fetchFn: createTimeoutFetch(10000) });
    const scopesSupported =
      serverInfo.resourceMetadata?.scopes_supported ||
      serverInfo.authorizationServerMetadata?.scopes_supported ||
      [];
    console.log(`[OAuthController] Discovered OAuth server info for ${urlParam}:`, {
      authServerUrl: serverInfo.authorizationServerUrl,
      scopesCount: scopesSupported.length,
      scopesSupported,
    });
    return c.json({
      authorizationServerUrl: serverInfo.authorizationServerUrl,
      metadata: serverInfo.authorizationServerMetadata,
      resourceMetadata: serverInfo.resourceMetadata,
      scopes_supported: scopesSupported,
    });
  } catch (err: any) {
    console.error(`[OAuthController] Discovery failed for ${urlParam}:`, err);
    return c.json({ error: err.message || String(err) }, 500);
  }
});

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

  const host = c.req.header("host") || "";
  const referer = c.req.header("referer") || "";
  const acceptHeader = c.req.header("accept") || "";
  const secFetchMode = c.req.header("sec-fetch-mode") || "";
  const isBrowserNavigation = secFetchMode === "navigate" || acceptHeader.includes("text/html");

  const getServersRedirect = (errorMsg: string) => {
    const query = `oauth_error=${encodeURIComponent(errorMsg)}`;
    if (host.includes("5170") || referer.includes("5173")) {
      const hostname = host.split(":")[0] || "localhost";
      return `http://${hostname}:5173/servers?${query}`;
    }
    return `/servers?${query}`;
  };

  const sendError = (errorMsg: string, status: 400 | 500 = 400) => {
    if (isBrowserNavigation) {
      return c.redirect(getServersRedirect(errorMsg));
    }
    return c.json({ error: errorMsg }, status);
  };

  try {
    const configJsonStr = (server as any).configJson || (server as any).config_json || "{}";
    const config = typeof configJsonStr === "string" ? JSON.parse(configJsonStr) : configJsonStr;
    const serverUrl = config.url;
    if (!serverUrl) {
      return sendError(`Server '${server.name}' does not have a remote HTTP URL configured for OAuth.`, 400);
    }

    const oauthProvider = new MCPRouterOAuthProvider({ serverId });
    const serverInfo = await discoverOAuthServerInfo(serverUrl, { fetchFn: createTimeoutFetch(10000) });

    let clientInfo = await oauthProvider.clientInformation();
    if (!clientInfo) {
      if (!serverInfo.authorizationServerMetadata?.registration_endpoint) {
        return sendError(
          "This OAuth server does not support Dynamic Client Registration (RFC 7591). Please provide a Client ID in the server's authentication configuration.",
          400
        );
      }
      // Perform Dynamic Client Registration (RFC 7591)
      const registered = await registerClient(serverInfo.authorizationServerUrl, {
        metadata: serverInfo.authorizationServerMetadata,
        clientMetadata: oauthProvider.clientMetadata,
        fetchFn: createTimeoutFetch(10000),
      });
      clientInfo = {
        client_id: registered.client_id,
        client_secret: registered.client_secret,
      };
      await oauthProvider.saveClientInformation(clientInfo);
    }

    const authDataJsonStr = (server as any).authDataJson || (server as any).auth_data_json || "{}";
    const authData = typeof authDataJsonStr === "string" ? JSON.parse(authDataJsonStr) : authDataJsonStr;
    
    const scopesSupported =
      serverInfo.resourceMetadata?.scopes_supported ||
      serverInfo.authorizationServerMetadata?.scopes_supported;

    // Use explicit config/auth scopes, or fall back to discovered supported scopes
    const requestedScope =
      config.scopes ||
      config.scope ||
      authData.scopes ||
      authData.scope ||
      (scopesSupported ? scopesSupported.join(" ") : undefined);

    console.log(`[OAuthController] Authorizing server ${serverId} (${server.name}) with scope: "${requestedScope}"`);

    const stateStr = oauthProvider.state();
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      serverInfo.authorizationServerUrl,
      {
        metadata: serverInfo.authorizationServerMetadata,
        clientInformation: clientInfo,
        redirectUrl: oauthProvider.redirectUrl,
        scope: requestedScope,
        state: stateStr,
      }
    );

    await oauthProvider.saveCodeVerifier(codeVerifier);

    console.log(`[OAuthController] Generated auth URL for ${serverId}: ${authorizationUrl.toString()}`);

    return c.redirect(authorizationUrl.toString());
  } catch (err: any) {
    console.error(`[OAuthController] Authorization error for server ${serverId}:`, err);
    return sendError(err.message || String(err), 500);
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
    const serverInfo = await discoverOAuthServerInfo(serverUrl, { fetchFn: createTimeoutFetch(10000) });
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
    let redirectTarget = "/servers?oauth_success=true";
    if (host.includes("5170") || referer.includes("5173")) {
      // Dev mode: frontend is on 5173
      const hostname = host.split(":")[0] || "localhost";
      redirectTarget = `http://${hostname}:5173/servers?oauth_success=true`;
    }
    return c.redirect(redirectTarget);
  } catch (err: any) {
    console.error(`[OAuthController] Token exchange failed for server ${serverId}:`, err);
    return c.json({ error: err.message || String(err) }, 500);
  }
});

export default app;
