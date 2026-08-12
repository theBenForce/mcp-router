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

function renderOAuthResultHtml(options: {
  success: boolean;
  title: string;
  message: string;
  detail?: string;
  serverId?: string;
}) {
  const { success, title, message, detail, serverId } = options;
  const iconSvg = success
    ? `<svg class="w-12 h-12 text-emerald-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`
    : `<svg class="w-12 h-12 text-rose-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;

  const escapedDetail = detail ? detail.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - MCP Router</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-zinc-100 flex items-center justify-center min-h-screen p-4 font-sans">
  <div class="max-w-md w-full bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 text-center shadow-2xl backdrop-blur-xl space-y-4">
    ${iconSvg}
    <h1 class="text-xl font-bold ${success ? "text-emerald-400" : "text-rose-400"}">${title}</h1>
    <p class="text-sm text-zinc-300">${message}</p>
    ${escapedDetail ? `<div class="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs text-zinc-400 font-mono text-left break-all">${escapedDetail}</div>` : ""}
    <div class="pt-2 flex flex-col gap-2">
      <button onclick="closeOrRedirect()" class="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer">
        Close Window
      </button>
      <a href="/#/servers" class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Return to Dashboard</a>
    </div>
  </div>

  <script>
    (function() {
      const payload = {
        type: 'MCP_OAUTH_COMPLETE',
        success: ${success},
        serverId: ${JSON.stringify(serverId || "")},
        error: ${JSON.stringify(success ? null : (detail || message))}
      };
      if (window.opener) {
        try {
          window.opener.postMessage(payload, '*');
        } catch (e) {
          console.error('Failed to postMessage to opener:', e);
        }
        if (${success}) {
          setTimeout(() => {
            window.close();
          }, 1200);
        }
      }
    })();

    function closeOrRedirect() {
      if (window.opener) {
        window.close();
      } else {
        window.location.href = '/#/servers?oauth_success=${success}';
      }
    }
  </script>
</body>
</html>`;
}

function respondError(
  c: any,
  status: number,
  error: string,
  description?: string,
  serverId?: string
) {
  const isHtml = c.req.header("accept")?.includes("text/html");
  if (!isHtml) {
    return c.json({ error, description }, status);
  }
  const detail = description ? `${error}: ${description}` : error;
  return c.html(
    renderOAuthResultHtml({
      success: false,
      title: "OAuth Authorization Error",
      message: error,
      detail,
      serverId,
    }),
    status
  );
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
    return respondError(c, 400, "Missing required parameter: serverId");
  }

  const server = serverService.getServer(serverId);
  if (!server) {
    return respondError(c, 404, `Server with ID ${serverId} not found`, undefined, serverId);
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
      return respondError(c, 400, "Server config must contain a valid url for OAuth", undefined, serverId);
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
    return respondError(c, 500, err.message || String(err), undefined, serverId);
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
    return respondError(
      c,
      400,
      `OAuth Authorization Error: ${errorParam}`,
      errorDescription
    );
  }

  if (!code || !state) {
    return respondError(c, 400, "Missing required query parameters: code and state");
  }

  const db = getDb();
  const session = db
    .select()
    .from(mcpOauthSessions)
    .where(eq(mcpOauthSessions.state, state))
    .get();

  if (!session) {
    return respondError(c, 400, `Invalid or expired OAuth state session: ${state}`);
  }

  const serverId = session.serverId;
  const server = serverService.getServer(serverId);
  if (!server) {
    return respondError(c, 404, `Server with ID ${serverId} not found`, undefined, serverId);
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

    const isHtml = c.req.header("accept")?.includes("text/html");
    if (isHtml) {
      return c.html(
        renderOAuthResultHtml({
          success: true,
          title: "Authorization Successful",
          message: `Successfully authenticated server "${server.name}". You may close this window.`,
          serverId,
        })
      );
    }

    // Redirect to frontend dashboard with success query param for full page navigations.
    const host = c.req.header("host") || "";
    const referer = c.req.header("referer") || "";
    let redirectTarget = "/servers?oauth_success=true";
    if (host.includes("5170") || referer.includes("5173")) {
      const hostname = host.split(":")[0] || "localhost";
      redirectTarget = `http://${hostname}:5173/servers?oauth_success=true`;
    }
    return c.redirect(redirectTarget);
  } catch (err: any) {
    console.error(`[OAuthController] Token exchange failed for server ${serverId}:`, err);
    return respondError(c, 500, err.message || String(err), undefined, serverId);
  }
});

export default app;

