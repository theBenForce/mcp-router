import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Upstream MCP Servers
export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  transportType: text("transport_type", { enum: ["stdio", "docker", "sse"] }).notNull(),
  configJson: text("config_json").notNull(),
  authType: text("auth_type", { enum: ["none", "api_key", "bearer"] }).notNull().default("none"),
  authDataJson: text("auth_data_json"),
  status: text("status", { enum: ["connected", "disconnected", "connecting", "error"] }).notNull().default("disconnected"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// Discovered Tools per Server
export const mcpTools = sqliteTable("mcp_tools", {
  id: text("id").primaryKey(),
  serverId: text("server_id").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  namespacedName: text("namespaced_name").notNull(),
  description: text("description"),
  inputSchemaJson: text("input_schema_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_tools_server").on(table.serverId),
  uniqueIndex("uq_tools_server_name").on(table.serverId, table.name),
]);

// Downstream API Keys
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  isActive: integer("is_active").notNull().default(1),
  expiresAt: text("expires_at"),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// Permission Matrix: API Key -> Server/Tool access
export const apiKeyPermissions = sqliteTable("api_key_permissions", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  serverId: text("server_id").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
  toolId: text("tool_id").references(() => mcpTools.id, { onDelete: "cascade" }),
}, (table) => [
  index("idx_perms_key").on(table.apiKeyId),
  index("idx_perms_server").on(table.serverId),
  uniqueIndex("uq_perms_key_server_tool").on(table.apiKeyId, table.serverId, table.toolId),
]);

// Audit Log
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  serverId: text("server_id").references(() => mcpServers.id, { onDelete: "set null" }),
  toolName: text("tool_name").notNull(),
  status: text("status", { enum: ["allowed", "denied", "error", "success"] }).notNull(),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_audit_key").on(table.apiKeyId),
  index("idx_audit_created").on(table.createdAt),
]);
