import { MCPRouterOAuthProvider } from "./oauth-provider";

export interface AuthProvider {
  type: string;
  getHeaders(): Promise<Record<string, string>>;
}

export class NoAuthProvider implements AuthProvider {
  type = "none";
  async getHeaders(): Promise<Record<string, string>> {
    return {};
  }
}

export class BearerAuthProvider implements AuthProvider {
  type = "bearer";
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }
}

export class ApiKeyAuthProvider implements AuthProvider {
  type = "api_key";
  private headerName: string;
  private apiKey: string;

  constructor(apiKey: string, headerName: string = "X-API-Key") {
    this.apiKey = apiKey;
    this.headerName = headerName;
  }

  async getHeaders(): Promise<Record<string, string>> {
    return {
      [this.headerName]: this.apiKey,
    };
  }
}

export class OAuth2AuthProvider implements AuthProvider {
  type = "oauth2";
  private serverId: string;

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  async getHeaders(): Promise<Record<string, string>> {
    const provider = new MCPRouterOAuthProvider({ serverId: this.serverId });
    const tokens = await provider.tokens();
    if (tokens?.access_token) {
      return {
        Authorization: `Bearer ${tokens.access_token}`,
      };
    }
    return {};
  }
}

export function createAuthProvider(
  authType: string,
  authDataJson?: string | null,
  serverId?: string
): AuthProvider {
  if (authType === "oauth2" && serverId) {
    return new OAuth2AuthProvider(serverId);
  }

  if (!authDataJson || authType === "none") {
    return new NoAuthProvider();
  }

  try {
    const data = JSON.parse(authDataJson);
    if (authType === "bearer") {
      return new BearerAuthProvider(data.token || "");
    }
    if (authType === "api_key") {
      return new ApiKeyAuthProvider(data.apiKey || "", data.headerName || "X-API-Key");
    }
  } catch (e) {
    console.error("Failed to parse auth_data_json:", e);
  }

  return new NoAuthProvider();
}
