import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { HttpAdapter, DesktopAdapter } from "../src/lib/api-client";
import { app } from "../src/index";
import { getDb, closeDb } from "../src/db";
import { config } from "../src/config";
import { ensureAdminUserOnStartup } from "../src/services/auth.service";

describe("Unified API Client Adapters", () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.AUTH_MODE = "docker";
    process.env.ADMIN_PASSWORD = "adminpass";
    config.authMode = "docker";
    closeDb();
    getDb();
    await ensureAdminUserOnStartup();
  });

  afterEach(() => {
    closeDb();
  });

  test("HttpAdapter handles auth flow and authenticated requests", async () => {
    // Custom fetch pointing to Hono app
    const customFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const targetUrl = typeof url === "string" ? url : url.toString();
      return app.fetch(new Request(targetUrl, init));
    };

    const adapter = new HttpAdapter({ baseUrl: "http://localhost/api", fetchImpl: customFetch });

    // Initially not authenticated in docker mode
    const initialAuth = await adapter.checkAuth();
    expect(initialAuth.isAuthenticated).toBe(false);

    // Login
    const loginResult = await adapter.login("admin", "adminpass");
    expect(loginResult.token).toBeDefined();

    // Now authenticated
    const postAuth = await adapter.checkAuth();
    expect(postAuth.isAuthenticated).toBe(true);

    // Fetch servers via adapter
    const servers = await adapter.getServers();
    expect(Array.isArray(servers)).toBe(true);

    // Logout
    await adapter.logout();
    const finalAuth = await adapter.checkAuth();
    expect(finalAuth.isAuthenticated).toBe(false);
  });

  test("DesktopAdapter auto-bypasses login in desktop mode", async () => {
    process.env.AUTH_MODE = "desktop";
    config.authMode = "desktop";

    const customFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const targetUrl = typeof url === "string" ? url : url.toString();
      return app.fetch(new Request(targetUrl, init));
    };

    const adapter = new DesktopAdapter({ baseUrl: "http://localhost/api", fetchImpl: customFetch });

    const authStatus = await adapter.checkAuth();
    expect(authStatus.isAuthenticated).toBe(true);

    const servers = await adapter.getServers();
    expect(Array.isArray(servers)).toBe(true);
  });
});
