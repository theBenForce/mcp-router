import type { BackendAdapter, BackendAdapterOptions, ServerConfig, User, AuthStatus } from "./types";

export class HttpAdapter implements BackendAdapter {
  protected baseUrl: string;
  protected token: string | null = null;
  protected fetchFn: typeof fetch;

  constructor(options?: BackendAdapterOptions) {
    this.baseUrl = options?.baseUrl || "/api";
    this.fetchFn = options?.fetchImpl || fetch.bind(globalThis);
  }

  public setToken(token: string | null) {
    this.token = token;
  }

  protected async request<T>(path: string, options?: RequestInit): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${normalizedPath}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await this.fetchFn(url, {
      ...options,
      headers,
      credentials: "same-origin",
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      let errorMsg = `HTTP Error ${res.status}: ${errorText}`;
      try {
        const json = JSON.parse(errorText);
        if (json.error) errorMsg = json.error;
      } catch {}
      throw new Error(errorMsg);
    }

    return res.json();
  }

  async getServers(): Promise<ServerConfig[]> {
    return this.request<ServerConfig[]>("/servers");
  }

  async addServer(server: Partial<ServerConfig>): Promise<ServerConfig> {
    return this.request<ServerConfig>("/servers", {
      method: "POST",
      body: JSON.stringify(server),
    });
  }

  async updateServer(id: string, server: Partial<ServerConfig>): Promise<ServerConfig> {
    return this.request<ServerConfig>(`/servers/${id}`, {
      method: "PUT",
      body: JSON.stringify(server),
    });
  }

  async deleteServer(id: string): Promise<void> {
    await this.request(`/servers/${id}`, { method: "DELETE" });
  }

  async getTools(): Promise<any[]> {
    return this.request<any[]>("/tools");
  }

  async getPrompts(): Promise<any[]> {
    return this.request<any[]>("/prompts");
  }

  async getLogs(limit = 100): Promise<any[]> {
    return this.request<any[]>(`/audit?limit=${limit}`);
  }

  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.token = res.token;
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request("/auth/logout", { method: "POST" });
    } catch {}
    this.token = null;
  }

  async checkAuth(): Promise<AuthStatus> {
    try {
      const res = await this.request<{ user: User }>("/auth/me");
      return { isAuthenticated: true, user: res.user };
    } catch {
      return { isAuthenticated: false };
    }
  }
}
