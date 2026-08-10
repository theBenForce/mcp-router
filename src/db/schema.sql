-- MCP Router Database Schema (bun:sqlite)

-- Upstream MCP Servers
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'sse')),
  config_json TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none', 'api_key', 'bearer')),
  auth_data_json TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected', 'disconnected', 'connecting', 'error')),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Discovered Tools per Server
CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  namespaced_name TEXT NOT NULL,
  description TEXT,
  input_schema_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(server_id, name)
);

-- Downstream API Keys
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

-- Permission Matrix: API Key -> Server/Tool access
CREATE TABLE IF NOT EXISTS api_key_permissions (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_id TEXT REFERENCES mcp_tools(id) ON DELETE CASCADE,
  UNIQUE(api_key_id, server_id, tool_id)
);

-- Audit Log
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

-- Indexes for Query Optimization
CREATE INDEX IF NOT EXISTS idx_tools_server ON mcp_tools(server_id);
CREATE INDEX IF NOT EXISTS idx_perms_key ON api_key_permissions(api_key_id);
CREATE INDEX IF NOT EXISTS idx_perms_server ON api_key_permissions(server_id);
CREATE INDEX IF NOT EXISTS idx_audit_key ON audit_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
