import type { Context, Next } from "hono";
import { keyService } from "../../services/key.service";

export async function downstreamAuthMiddleware(c: Context, next: Next) {
  let token: string | undefined;

  // 1. Try Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }

  // 2. Fallback to query parameter (e.g. for SSE clients)
  if (!token) {
    token = c.req.query("apiKey");
  }

  if (!token) {
    return c.json(
      { error: "Unauthorized: Missing API Key in Bearer header or ?apiKey query param" },
      401
    );
  }

  const apiKeyRecord = keyService.validateToken(token);
  if (!apiKeyRecord) {
    return c.json(
      { error: "Unauthorized: Invalid, expired, or revoked API Key" },
      401
    );
  }

  c.set("apiKey", apiKeyRecord);
  await next();
}
