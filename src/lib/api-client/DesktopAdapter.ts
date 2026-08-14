import { HttpAdapter } from "./HttpAdapter";
import type { BackendAdapterOptions, AuthStatus } from "./types";

export class DesktopAdapter extends HttpAdapter {
  constructor(options?: BackendAdapterOptions) {
    super(options);
  }

  protected override getBaseUrl(): string {
    if (this.baseUrl && this.baseUrl !== "/api") {
      return this.baseUrl;
    }
    const port = (typeof window !== "undefined" && (window as any).__ACTIVE_BACKEND_PORT__) || 5170;
    return `http://localhost:${port}/api`;
  }

  override async checkAuth(): Promise<AuthStatus> {
    const healthUrl = this.getBaseUrl().replace(/\/api\/?$/, "") + "/health";
    const res = await this.fetchFn(healthUrl).catch((err) => {
      throw new Error(`Could not connect to MCP Router backend on port 5170 (${err.message}). The port may already be in use by another process.`);
    });

    if (!res.ok) {
      throw new Error(`MCP Router backend healthcheck returned HTTP ${res.status}`);
    }

    // In Desktop mode, localhost requests bypass login and return local admin
    const meRes = await this.request<{ user?: any }>("/auth/me").catch(() => null);
    if (meRes && meRes.user) {
      return { isAuthenticated: true, user: meRes.user };
    }
    return { isAuthenticated: true, user: { id: "local-admin", username: "admin", role: "admin" } };
  }
}
