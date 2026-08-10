import crypto from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import { apiKeys, apiKeyPermissions, mcpServers, mcpTools, mcpPrompts } from "../db/schema";

export interface PermissionRuleInput {
  serverId?: string | null;
  toolId?: string | null;
  promptId?: string | null;
  actionType?: "read" | "write" | "delete" | "execute" | null;
  action_type?: "read" | "write" | "delete" | "execute" | null;
}

export interface CreateKeyInput {
  name: string;
  expiresAt?: string | null;
  permissions?: PermissionRuleInput[];
}

export interface SetPermissionsInput {
  permissions: PermissionRuleInput[];
}

export class KeyService {
  /**
   * Generates a new API key with mcpr_ prefix, stores SHA-256 hash, and returns secret token ONCE.
   */
  createKey(input: CreateKeyInput) {
    const db = getDb();
    const id = crypto.randomUUID();
    const randomHex = crypto.randomBytes(32).toString("hex");
    const secretKey = `mcpr_${randomHex}`;
    const keyPrefix = secretKey.slice(0, 12); // e.g. "mcpr_a1b2c3d4"
    const keyHash = crypto.createHash("sha256").update(secretKey).digest("hex");

    db.insert(apiKeys)
      .values({
        id,
        name: input.name,
        keyPrefix,
        keyHash,
        isActive: 1,
        expiresAt: input.expiresAt || null,
      })
      .run();

    if (input.permissions && input.permissions.length > 0) {
      this.setPermissions(id, { permissions: input.permissions });
    }

    return {
      id,
      name: input.name,
      keyPrefix,
      secretKey, // Return full secret token ONLY on creation
      isActive: true,
      expiresAt: input.expiresAt || null,
      createdAt: new Date().toISOString(),
    };
  }

  listKeys() {
    const db = getDb();
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.keyPrefix,
        is_active: apiKeys.isActive,
        expires_at: apiKeys.expiresAt,
        last_used_at: apiKeys.lastUsedAt,
        created_at: apiKeys.createdAt,
        permission_count: sql<number>`COUNT(${apiKeyPermissions.id})`,
      })
      .from(apiKeys)
      .leftJoin(apiKeyPermissions, eq(apiKeys.id, apiKeyPermissions.apiKeyId))
      .groupBy(apiKeys.id)
      .orderBy(sql`${apiKeys.createdAt} DESC`)
      .all();
  }

  getKey(id: string) {
    const db = getDb();
    const key = db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.keyPrefix,
        is_active: apiKeys.isActive,
        expires_at: apiKeys.expiresAt,
        last_used_at: apiKeys.lastUsedAt,
        created_at: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .get();

    if (!key) return null;

    const permissions = this.getPermissions(id);
    return {
      ...key,
      permissions,
    };
  }

  revokeKey(id: string) {
    const db = getDb();
    db.update(apiKeys)
      .set({ isActive: 0 })
      .where(eq(apiKeys.id, id))
      .run();
    return true;
  }

  deleteKey(id: string) {
    const db = getDb();
    db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
    return true;
  }

  getPermissions(keyId: string) {
    const db = getDb();
    return db
      .select({
        id: apiKeyPermissions.id,
        server_id: apiKeyPermissions.serverId,
        tool_id: apiKeyPermissions.toolId,
        prompt_id: apiKeyPermissions.promptId,
        action_type: apiKeyPermissions.actionType,
        server_name: mcpServers.name,
        tool_name: mcpTools.name,
        prompt_name: mcpPrompts.name,
        namespaced_name: mcpTools.namespacedName,
      })
      .from(apiKeyPermissions)
      .leftJoin(mcpServers, eq(apiKeyPermissions.serverId, mcpServers.id))
      .leftJoin(mcpTools, eq(apiKeyPermissions.toolId, mcpTools.id))
      .leftJoin(mcpPrompts, eq(apiKeyPermissions.promptId, mcpPrompts.id))
      .where(eq(apiKeyPermissions.apiKeyId, keyId))
      .all();
  }

  setPermissions(keyId: string, input: SetPermissionsInput) {
    const db = getDb();
    db.delete(apiKeyPermissions)
      .where(eq(apiKeyPermissions.apiKeyId, keyId))
      .run();

    for (const perm of input.permissions) {
      if (!perm.serverId && !perm.promptId) continue;
      const actionType = perm.actionType ?? perm.action_type ?? null;
      db.insert(apiKeyPermissions)
        .values({
          id: crypto.randomUUID(),
          apiKeyId: keyId,
          serverId: perm.serverId || null,
          toolId: perm.toolId || null,
          promptId: perm.promptId || null,
          actionType: actionType as "read" | "write" | "delete" | "execute" | null,
        })
        .run();
    }

    return this.getPermissions(keyId);
  }

  /**
   * Validates secret token by computing SHA-256 hash and looking up active key.
   */
  validateToken(token: string) {
    if (!token || !token.startsWith("mcpr_")) return null;

    const keyHash = crypto.createHash("sha256").update(token).digest("hex");
    const db = getDb();
    const key = db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.keyPrefix,
        is_active: apiKeys.isActive,
        expires_at: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, 1)))
      .get();

    if (!key) return null;

    // Check expiration
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return null;
    }

    // Update last_used_at
    db.update(apiKeys)
      .set({ lastUsedAt: sql`datetime('now')` })
      .where(eq(apiKeys.id, key.id))
      .run();

    return key;
  }
}

export const keyService = new KeyService();
