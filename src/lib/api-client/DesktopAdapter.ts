import { HttpAdapter } from "./HttpAdapter";
import type { BackendAdapterOptions, AuthStatus } from "./types";

export class DesktopAdapter extends HttpAdapter {
  constructor(options?: BackendAdapterOptions) {
    const defaultUrl = options?.baseUrl || "http://localhost:5170/api";
    super({ ...options, baseUrl: defaultUrl });
  }

  override async checkAuth(): Promise<AuthStatus> {
    try {
      // In Desktop mode, localhost requests bypass login and return local admin
      const res = await this.request<{ user?: any }>("/auth/me").catch(() => null);
      if (res && res.user) {
        return { isAuthenticated: true, user: res.user };
      }
      return { isAuthenticated: true, user: { id: "local-admin", username: "admin", role: "admin" } };
    } catch {
      return { isAuthenticated: true, user: { id: "local-admin", username: "admin", role: "admin" } };
    }
  }
}
