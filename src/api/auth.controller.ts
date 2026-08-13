import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { authenticateUser } from "../services/auth.service";
import { createJwtToken } from "../security/jwt";

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

    setCookie(c, "mcp_session", token, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return c.json({
      token,
      user,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Login failed" }, 500);
  }
});

authController.post("/logout", (c) => {
  deleteCookie(c, "mcp_session", { path: "/" });
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
