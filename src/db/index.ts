import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import path from "node:path";
import fs from "node:fs";
import { config } from "../config";
import * as schema from "./schema";

let sqliteInstance: Database | null = null;
let dbInstance: BunSQLiteDatabase<typeof schema> | null = null;

export function getDb(): BunSQLiteDatabase<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure directory exists for file-based databases
  if (config.databasePath !== ":memory:") {
    const dir = path.dirname(config.databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  sqliteInstance = new Database(config.databasePath);
  try {
    sqliteInstance.exec("PRAGMA journal_mode = WAL;");
  } catch {
    try {
      sqliteInstance.exec("PRAGMA journal_mode = DELETE;");
    } catch {}
  }
  sqliteInstance.exec("PRAGMA foreign_keys = ON;");

  dbInstance = drizzle(sqliteInstance, { schema });

  // Run schema push (create tables if not exist)
  // We use raw SQL for initial schema setup to avoid needing drizzle-kit at runtime
  pushSchema(sqliteInstance);

  return dbInstance;
}

/**
 * Returns the raw bun:sqlite Database instance for cases where
 * raw SQL is needed (e.g., tests that check sqlite_master).
 */
export function getRawDb(): Database {
  if (!sqliteInstance) {
    getDb(); // initialize
  }
  return sqliteInstance!;
}

export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

/**
 * Push schema tables using CREATE TABLE IF NOT EXISTS.
 * This avoids requiring drizzle-kit migrations at runtime while
 * keeping the Drizzle schema as the single source of truth.
 */
function pushSchema(db: Database) {
  try { db.exec("PRAGMA foreign_keys = OFF;"); } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      client_secret_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      server_version TEXT,
      server_title TEXT,
      instructions TEXT,
      website_url TEXT,
      icons_json TEXT,
      transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'docker', 'sse', 'streamable-http')),
      config_json TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none', 'api_key', 'bearer', 'oauth2', 'cli_command')),
      auth_data_json TEXT,
      status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected', 'disconnected', 'connecting', 'error', 'need_auth')),
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_oauth_sessions (
      state TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
      code_verifier TEXT NOT NULL,
      redirect_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_tools (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      namespaced_name TEXT NOT NULL,
      description TEXT,
      input_schema_json TEXT NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'write' CHECK(action_type IN ('read', 'write', 'delete', 'execute')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(server_id, name)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT,
      content_template TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_prompt_arguments (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL REFERENCES mcp_prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      UNIQUE(prompt_id, name)
    );

    CREATE TABLE IF NOT EXISTS api_key_permissions (
      id TEXT PRIMARY KEY,
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      server_id TEXT REFERENCES mcp_servers(id) ON DELETE CASCADE,
      tool_id TEXT REFERENCES mcp_tools(id) ON DELETE CASCADE,
      prompt_id TEXT REFERENCES mcp_prompts(id) ON DELETE CASCADE,
      action_type TEXT CHECK(action_type IN ('read', 'write', 'delete', 'execute')),
      UNIQUE(api_key_id, server_id, tool_id, prompt_id, action_type)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      server_id TEXT REFERENCES mcp_servers(id) ON DELETE SET NULL,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('allowed', 'denied', 'error', 'success')),
      duration_ms INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_clients_user ON oauth_clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_tools_server ON mcp_tools(server_id);
    CREATE INDEX IF NOT EXISTS idx_perms_key ON api_key_permissions(api_key_id);
    CREATE INDEX IF NOT EXISTS idx_perms_server ON api_key_permissions(server_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_args_prompt ON mcp_prompt_arguments(prompt_id);
    CREATE INDEX IF NOT EXISTS idx_audit_key ON audit_logs(api_key_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Migration: add user_id column to api_keys if missing
  try {
    db.exec("ALTER TABLE api_keys ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  } catch {
    // Column already exists or error
  }

  // Migration: add action_type column to mcp_tools if missing
  try {
    db.exec("ALTER TABLE mcp_tools ADD COLUMN action_type TEXT NOT NULL DEFAULT 'write'");
  } catch {
    // Column already exists or error
  }

  // Migration: add action_type column to api_key_permissions if missing
  try {
    db.exec("ALTER TABLE api_key_permissions ADD COLUMN action_type TEXT");
  } catch {
    // Column already exists or error
  }

  // Migration: ensure api_key_permissions supports NULL server_id/tool_id and has prompt_id column
  try {
    db.exec("INSERT INTO api_key_permissions (id, api_key_id, server_id, tool_id, prompt_id) VALUES ('__migration_test__', '__migration_test__', NULL, NULL, NULL)");
    db.exec("DELETE FROM api_key_permissions WHERE id = '__migration_test__'");
  } catch {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS api_key_permissions_new (
          id TEXT PRIMARY KEY,
          api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
          server_id TEXT REFERENCES mcp_servers(id) ON DELETE CASCADE,
          tool_id TEXT REFERENCES mcp_tools(id) ON DELETE CASCADE,
          prompt_id TEXT REFERENCES mcp_prompts(id) ON DELETE CASCADE,
          action_type TEXT CHECK(action_type IN ('read', 'write', 'delete', 'execute')),
          UNIQUE(api_key_id, server_id, tool_id, prompt_id, action_type)
        );
        INSERT INTO api_key_permissions_new (id, api_key_id, server_id, tool_id, prompt_id, action_type)
          SELECT id, api_key_id, server_id, tool_id, prompt_id, action_type FROM api_key_permissions;
        DROP TABLE api_key_permissions;
        ALTER TABLE api_key_permissions_new RENAME TO api_key_permissions;
      `);
    } catch {
      // Table creation or rename failed
    }
  }

  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_perms_prompt ON api_key_permissions(prompt_id)");
  } catch {
    // Index already exists
  }

  // Migration: update existing databases that don't have 'streamable-http', 'oauth2', or 'cli_command' in the CHECK constraint
  try {
    db.exec("INSERT INTO mcp_servers (id, name, transport_type, auth_type, config_json) VALUES ('__migration_test__', '__migration_test__', 'streamable-http', 'cli_command', '{}')");
    db.exec("DELETE FROM mcp_servers WHERE id = '__migration_test__'");
  } catch {
    // CHECK constraint failed - need to migrate
    // SQLite doesn't support ALTER TABLE for CHECK constraints, so we recreate the table
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        server_version TEXT,
        server_title TEXT,
        instructions TEXT,
        website_url TEXT,
        icons_json TEXT,
        transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'docker', 'sse', 'streamable-http')),
        config_json TEXT NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none', 'api_key', 'bearer', 'oauth2', 'cli_command')),
        auth_data_json TEXT,
        status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected', 'disconnected', 'connecting', 'error', 'need_auth')),
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO mcp_servers_new (id, name, description, transport_type, config_json, auth_type, auth_data_json, status, last_error, created_at, updated_at)
        SELECT id, name, description, transport_type, config_json, auth_type, auth_data_json, status, last_error, created_at, updated_at FROM mcp_servers;
      DROP TABLE mcp_servers;
      ALTER TABLE mcp_servers_new RENAME TO mcp_servers;
    `);
  }

  // Migration: add metadata columns to mcp_servers if missing
  try { db.exec("ALTER TABLE mcp_servers ADD COLUMN server_version TEXT"); } catch {}
  try { db.exec("ALTER TABLE mcp_servers ADD COLUMN server_title TEXT"); } catch {}
  try { db.exec("ALTER TABLE mcp_servers ADD COLUMN instructions TEXT"); } catch {}
  try { db.exec("ALTER TABLE mcp_servers ADD COLUMN website_url TEXT"); } catch {}
  try { db.exec("ALTER TABLE mcp_servers ADD COLUMN icons_json TEXT"); } catch {}
  try { db.exec("PRAGMA foreign_keys = ON;"); } catch {}
}
