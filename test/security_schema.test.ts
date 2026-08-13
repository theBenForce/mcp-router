import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb } from "../src/db";
import { users, sessions, oauthClients, apiKeys } from "../src/db/schema";
import { hashPassword, verifyPassword } from "../src/security/passwords";
import { eq } from "drizzle-orm";

describe("Security Schema & Password Hashing", () => {
  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
  });

  afterEach(() => {
    closeDb();
  });

  test("hashPassword and verifyPassword work correctly", async () => {
    const password = "SuperSecretAdminPassword123!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(typeof hash).toBe("string");

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isWrongValid = await verifyPassword("WrongPassword123", hash);
    expect(isWrongValid).toBe(false);
  });

  test("can create, query, and delete users in database", async () => {
    const db = getDb();

    const passwordHash = await hashPassword("adminpass");
    const userId = "user-" + crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      username: "admin",
      passwordHash: passwordHash,
      role: "admin",
    });

    const userRecords = await db.select().from(users).where(eq(users.id, userId));
    expect(userRecords.length).toBe(1);
    expect(userRecords[0].username).toBe("admin");
    expect(userRecords[0].role).toBe("admin");

    await db.delete(users).where(eq(users.id, userId));
    const emptyRecords = await db.select().from(users).where(eq(users.id, userId));
    expect(emptyRecords.length).toBe(0);
  });

  test("can create session linked to user", async () => {
    const db = getDb();

    const userId = "user-" + crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      username: "sessionuser",
      passwordHash: await hashPassword("password123"),
      role: "user",
    });

    const sessionId = "sess-" + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 86400000).toISOString();

    await db.insert(sessions).values({
      id: sessionId,
      userId: userId,
      expiresAt: expiresAt,
    });

    const sessionRecords = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(sessionRecords.length).toBe(1);
    expect(sessionRecords[0].userId).toBe(userId);
  });

  test("can create oauthClient linked to user", async () => {
    const db = getDb();

    const userId = "user-" + crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      username: "oauthuser",
      passwordHash: await hashPassword("password123"),
      role: "admin",
    });

    const clientId = "client_" + crypto.randomUUID();
    const secretHash = await hashPassword("client_secret_xyz");

    await db.insert(oauthClients).values({
      id: "oc-" + crypto.randomUUID(),
      clientId: clientId,
      clientSecretHash: secretHash,
      name: "ThirdPartyApp",
      redirectUris: JSON.stringify(["http://localhost:3000/callback"]),
      userId: userId,
    });

    const clientRecords = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
    expect(clientRecords.length).toBe(1);
    expect(clientRecords[0].name).toBe("ThirdPartyApp");
  });
});
