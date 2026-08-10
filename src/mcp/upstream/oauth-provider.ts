import type {
  OAuthClientProvider,
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { mcpServers, mcpOauthSessions } from "../../db/schema";
import { config } from "../../config";

export interface MCPRouterOAuthProviderOptions {
  serverId: string;
  redirectUrl?: string;
  clientName?: string;
}

export class MCPRouterOAuthProvider implements OAuthClientProvider {
  private serverId: string;
  private customRedirectUrl?: string;
  private clientName: string;
  private currentState?: string;

  constructor(options: MCPRouterOAuthProviderOptions) {
    this.serverId = options.serverId;
    this.customRedirectUrl = options.redirectUrl;
    this.clientName = options.clientName || "MCP Router";
  }

  get redirectUrl(): string {
    if (this.customRedirectUrl) return this.customRedirectUrl;
    const port = config.port;
    const host = config.host === "0.0.0.0" ? "localhost" : config.host;
    return `http://${host}:${port}/api/oauth/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.clientName,
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    if (!this.currentState) {
      this.currentState = crypto.randomUUID();
    }
    return this.currentState;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const db = getDb();
    const server = db.select().from(mcpServers).where(eq(mcpServers.id, this.serverId)).get();
    if (!server || !server.authDataJson) return undefined;

    try {
      const data = JSON.parse(server.authDataJson);
      if (data.client_id) {
        return {
          client_id: data.client_id,
          client_secret: data.client_secret,
        };
      }
    } catch (e) {}
    return undefined;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    const db = getDb();
    const server = db.select().from(mcpServers).where(eq(mcpServers.id, this.serverId)).get();
    if (!server) return;

    const existingAuthData = server.authDataJson ? JSON.parse(server.authDataJson) : {};
    const updatedAuthData = {
      ...existingAuthData,
      client_id: clientInformation.client_id,
      client_secret: clientInformation.client_secret,
    };

    db.update(mcpServers)
      .set({
        authDataJson: JSON.stringify(updatedAuthData),
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(mcpServers.id, this.serverId))
      .run();
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const db = getDb();
    const server = db.select().from(mcpServers).where(eq(mcpServers.id, this.serverId)).get();
    if (!server || !server.authDataJson) return undefined;

    try {
      const data = JSON.parse(server.authDataJson);
      if (data.tokens && data.tokens.access_token) {
        return data.tokens as OAuthTokens;
      }
    } catch (e) {}
    return undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const db = getDb();
    const server = db.select().from(mcpServers).where(eq(mcpServers.id, this.serverId)).get();
    if (!server) return;

    const existingAuthData = server.authDataJson ? JSON.parse(server.authDataJson) : {};
    const updatedAuthData = {
      ...existingAuthData,
      tokens,
    };

    db.update(mcpServers)
      .set({
        authDataJson: JSON.stringify(updatedAuthData),
        status: "connected",
        lastError: null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(mcpServers.id, this.serverId))
      .run();
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    const db = getDb();
    const stateStr = this.state();

    db.insert(mcpOauthSessions)
      .values({
        state: stateStr,
        serverId: this.serverId,
        codeVerifier,
        redirectUrl: this.redirectUrl,
      })
      .onConflictDoUpdate({
        target: mcpOauthSessions.state,
        set: {
          codeVerifier,
          redirectUrl: this.redirectUrl,
        },
      })
      .run();
  }

  async codeVerifier(): Promise<string> {
    const db = getDb();
    const stateStr = this.state();
    const session = db
      .select()
      .from(mcpOauthSessions)
      .where(eq(mcpOauthSessions.state, stateStr))
      .get();

    if (!session) {
      throw new Error(`OAuth session for state ${stateStr} not found`);
    }
    return session.codeVerifier;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const db = getDb();
    db.update(mcpServers)
      .set({
        status: "need_auth",
        lastError: `OAuth authorization required: ${authorizationUrl.toString()}`,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(mcpServers.id, this.serverId))
      .run();

    const error = new Error(`OAuth authorization required`);
    (error as any).authorizationUrl = authorizationUrl.toString();
    (error as any).state = this.state();
    throw error;
  }
}
