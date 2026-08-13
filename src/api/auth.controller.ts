import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { authenticateUser } from "../services/auth.service";
import { createJwtToken } from "../security/jwt";

import type { Context } from "hono";

export function getSessionCookieOptions(c: Context) {
  const isHttps =
    c.req.header("x-forwarded-proto") === "https" ||
    c.req.url.startsWith("https://");
  const isProd = process.env.NODE_ENV === "production";
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : isHttps || isProd;

  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax" as const,
    secure,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

const authController = new Hono();

authController.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = body;

    if (!username || !password) {
      return c.json({ error: "Username and password are required" }, 400);
    }

    const user = await authenticateUser(username, password);
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = await createJwtToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const cookieOpts = getSessionCookieOptions(c);
    setCookie(c, "mcp_session", token, cookieOpts);

    return c.json({
      token,
      user,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Login failed" }, 500);
  }
});

authController.post("/logout", (c) => {
  const cookieOpts = getSessionCookieOptions(c);
  deleteCookie(c, "mcp_session", { path: cookieOpts.path, secure: cookieOpts.secure });
  return c.json({ success: true });
});

authController.get("/me", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  return c.json({ user });
});

export default authController;
