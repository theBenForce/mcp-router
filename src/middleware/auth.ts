import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJwtToken } from "../security/jwt";
import { config } from "../config";

const localAdminUser = {
  id: "local-admin",
  username: "admin",
  role: "admin",
};

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;

  // Always allow health check and login endpoint
  if (path === "/health" || path === "/api/auth/login") {
    return next();
  }

  const effectiveAuthMode = process.env.AUTH_MODE || config.authMode;

  // Desktop mode: auto-authenticate localhost requests
  if (effectiveAuthMode === "desktop") {
    c.set("user", localAdminUser);
    return next();
  }

  // Docker / Self-hosted mode: require valid JWT (via header or cookie)
  let token: string | undefined;

  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else {
    token = getCookie(c, "mcp_session");
  }

  if (!token) {
    return c.json({ error: "Unauthorized: Missing authentication token" }, 401);
  }

  const payload = await verifyJwtToken(token);
  if (!payload) {
    return c.json({ error: "Unauthorized: Invalid or expired authentication token" }, 401);
  }

  c.set("user", {
    id: payload.sub,
    username: payload.username,
    role: payload.role,
  });

  return next();
};
