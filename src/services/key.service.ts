import crypto from "node:crypto";
import { getDb } from "../db";

export interface CreateKeyInput {
  name: string;
  expiresAt?: string | null;
  permissions?: Array<{ serverId: string; toolId?: string | null }>;
}

export interface SetPermissionsInput {
  permissions: Array<{ serverId: string; toolId?: string | null }>;
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

    db.query(`
      INSERT INTO api_keys (id, name, key_prefix, key_hash, is_active, expires_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(id, input.name, keyPrefix, keyHash, input.expiresAt || null);

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
      .query(`
        SELECT
          k.id,
          k.name,
          k.key_prefix,
          k.is_active,
          k.expires_at,
          k.last_used_at,
          k.created_at,
          COUNT(p.id) as permission_count
        FROM api_keys k
        LEFT JOIN api_key_permissions p ON k.id = p.api_key_id
        GROUP BY k.id
        ORDER BY k.created_at DESC
      `)
      .all();
  }

  getKey(id: string) {
    const db = getDb();
    const key = db.query("SELECT id, name, key_prefix, is_active, expires_at, last_used_at, created_at FROM api_keys WHERE id = ?").get(id) as any;
    if (!key) return null;

    const permissions = this.getPermissions(id);
    return {
      ...key,
      permissions,
    };
  }

  revokeKey(id: string) {
    const db = getDb();
    db.query("UPDATE api_keys SET is_active = 0 WHERE id = ?").run(id);
    return true;
  }

  deleteKey(id: string) {
    const db = getDb();
    db.query("DELETE FROM api_keys WHERE id = ?").run(id);
    return true;
  }

  getPermissions(keyId: string) {
    const db = getDb();
    return db
      .query(`
        SELECT
          p.id,
          p.server_id,
          p.tool_id,
          s.name as server_name,
          t.name as tool_name,
          t.namespaced_name
        FROM api_key_permissions p
        JOIN mcp_servers s ON p.server_id = s.id
        LEFT JOIN mcp_tools t ON p.tool_id = t.id
        WHERE p.api_key_id = ?
      `)
      .all(keyId);
  }

  setPermissions(keyId: string, input: SetPermissionsInput) {
    const db = getDb();
    db.query("DELETE FROM api_key_permissions WHERE api_key_id = ?").run(keyId);

    const stmt = db.prepare(`
      INSERT INTO api_key_permissions (id, api_key_id, server_id, tool_id)
      VALUES (?, ?, ?, ?)
    `);

    for (const perm of input.permissions) {
      stmt.run(crypto.randomUUID(), keyId, perm.serverId, perm.toolId || null);
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
      .query(`
        SELECT id, name, key_prefix, is_active, expires_at
        FROM api_keys
        WHERE key_hash = ? AND is_active = 1
      `)
      .get(keyHash) as any;

    if (!key) return null;

    // Check expiration
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return null;
    }

    // Update last_used_at
    db.query("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(key.id);

    return key;
  }
}

export const keyService = new KeyService();
