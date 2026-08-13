import { getDb } from "../db";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../security/passwords";
import { eq } from "drizzle-orm";

export async function ensureAdminUserOnStartup(): Promise<string> {
  const db = getDb();
  const existingUsers = await db.select().from(users).where(eq(users.username, "admin"));

  if (existingUsers.length > 0) {
    return ""; // Admin user already exists
  }

  const envPassword = process.env.ADMIN_PASSWORD;
  const adminPassword = envPassword && envPassword.trim().length > 0
    ? envPassword
    : crypto.randomUUID().replaceAll("-", "").substring(0, 16);

  const passwordHash = await hashPassword(adminPassword);
  const userId = "usr_" + crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    username: "admin",
    passwordHash: passwordHash,
    role: "admin",
  });

  if (!envPassword) {
    console.log("\n===========================================================");
    console.log("🔐 INITIAL ADMIN USER CREATED FOR SELF-HOSTED DOCKER DEPLOYMENT");
    console.log("-----------------------------------------------------------");
    console.log(` Username : admin`);
    console.log(` Password : ${adminPassword}`);
    console.log("-----------------------------------------------------------");
    console.log(" Please save this password safely or set ADMIN_PASSWORD in env!");
    console.log("===========================================================\n");
  }

  return adminPassword;
}

export async function authenticateUser(username: string, password: string) {
  const db = getDb();
  const foundUsers = await db.select().from(users).where(eq(users.username, username));

  if (foundUsers.length === 0) {
    return null;
  }

  const user = foundUsers[0];
  if (!user.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}
