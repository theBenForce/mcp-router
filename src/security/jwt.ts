import { sign, verify } from "hono/jwt";
import { config } from "../config";

export interface UserJwtPayload {
  sub: string;
  username: string;
  role: string;
  exp: number;
}

export async function createJwtToken(payload: { sub: string; username: string; role: string }): Promise<string> {
  const secret = process.env.SESSION_SECRET || config.sessionSecret;
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
  return await sign({ ...payload, exp }, secret, "HS256");
}

export async function verifyJwtToken(token: string): Promise<UserJwtPayload | null> {
  try {
    const secret = process.env.SESSION_SECRET || config.sessionSecret;
    const payload = await verify(token, secret, "HS256");
    return payload as unknown as UserJwtPayload;
  } catch (err: any) {
    return null;
  }
}
