import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { app } from "../src/index";
import { getDb, closeDb } from "../src/db";
import { users } from "../src/db/schema";
import { ensureAdminUserOnStartup } from "../src/services/auth.service";
import { config } from "../src/config";
import { eq } from "drizzle-orm";

describe("JWT Auth Endpoints & Middleware", () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.AUTH_MODE = "docker";
    process.env.SESSION_SECRET = "test_session_secret_key_12345";
    closeDb();
    getDb();
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    closeDb();
  });

  test("ensureAdminUserOnStartup creates default admin user when DB is empty", async () => {
    delete process.env.ADMIN_PASSWORD;
    const adminPassword = await ensureAdminUserOnStartup();

    expect(typeof adminPassword).toBe("string");
    expect(adminPassword.length).toBeGreaterThanOrEqual(12);

    const db = getDb();
    const adminUser = await db.select().from(users).where(eq(users.username, "admin"));
    expect(adminUser.length).toBe(1);
    expect(adminUser[0].role).toBe("admin");
  });

  test("POST /api/auth/login succeeds with valid credentials and sets session cookie", async () => {
    process.env.ADMIN_PASSWORD = "TestAdminPassword123!";
    await ensureAdminUserOnStartup();

    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "TestAdminPassword123!" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe("admin");

    const cookieHeader = res.headers.get("Set-Cookie");
    expect(cookieHeader).toContain("mcp_session=");
    expect(cookieHeader).toContain("HttpOnly");
  });

  test("POST /api/auth/login fails with invalid credentials", async () => {
    process.env.ADMIN_PASSWORD = "TestAdminPassword123!";
    await ensureAdminUserOnStartup();

    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "WrongPassword!" }),
      })
    );

    expect(res.status).toBe(401);
  });

  test("Protected endpoint /api/servers returns 401 in docker mode without token", async () => {
    process.env.AUTH_MODE = "docker";
    config.authMode = "docker";

    const res = await app.fetch(new Request("http://localhost/api/servers"));
    expect(res.status).toBe(401);
  });

  test("Protected endpoint /api/servers succeeds with valid JWT Bearer header", async () => {
    process.env.AUTH_MODE = "docker";
    config.authMode = "docker";
    process.env.ADMIN_PASSWORD = "TestAdminPassword123!";
    await ensureAdminUserOnStartup();

    // Login to get token
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "TestAdminPassword123!" }),
      })
    );
    const { token } = await loginRes.json();

    const res = await app.fetch(
      new Request("http://localhost/api/servers", {
        headers: { Authorization: `Bearer ${token}` },
      })
    );

    expect(res.status).toBe(200);
  });

  test("AUTH_MODE=desktop bypasses login prompt for localhost", async () => {
    process.env.AUTH_MODE = "desktop";
    config.authMode = "desktop";

    const res = await app.fetch(new Request("http://localhost/api/servers"));
    expect(res.status).toBe(200);
  });
});
