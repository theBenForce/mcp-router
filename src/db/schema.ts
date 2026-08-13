import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Upstream MCP Servers
export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  serverVersion: text("server_version"),
  serverTitle: text("server_title"),
  instructions: text("instructions"),
  websiteUrl: text("website_url"),
  iconsJson: text("icons_json"),
  transportType: text("transport_type", { enum: ["stdio", "docker", "sse", "streamable-http"] }).notNull(),
  configJson: text("config_json").notNull(),
  authType: text("auth_type", { enum: ["none", "api_key", "bearer", "oauth2", "cli_command"] }).notNull().default("none"),
  authDataJson: text("auth_data_json"),
  status: text("status", { enum: ["connected", "disconnected", "connecting", "error", "need_auth"] }).notNull().default("disconnected"),
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
  actionType: text("action_type", { enum: ["read", "write", "delete", "execute"] }).notNull().default("write"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_tools_server").on(table.serverId),
  uniqueIndex("uq_tools_server_name").on(table.serverId, table.name),
]);

// Users Table
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// Web UI Sessions Table
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_sessions_user").on(table.userId),
]);

// OAuth 2.0 Clients
export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash").notNull(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_oauth_clients_user").on(table.userId),
]);

// Downstream API Keys
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  isActive: integer("is_active").notNull().default(1),
  expiresAt: text("expires_at"),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// User-Defined Prompts
export const mcpPrompts = sqliteTable("mcp_prompts", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  title: text("title"),
  description: text("description"),
  contentTemplate: text("content_template").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// Arguments per Prompt
export const mcpPromptArguments = sqliteTable("mcp_prompt_arguments", {
  id: text("id").primaryKey(),
  promptId: text("prompt_id").notNull().references(() => mcpPrompts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  required: integer("required").notNull().default(0),
}, (table) => [
  index("idx_prompt_args_prompt").on(table.promptId),
  uniqueIndex("uq_prompt_args_prompt_name").on(table.promptId, table.name),
]);

// Permission Matrix: API Key -> Server/Tool/Prompt access
export const apiKeyPermissions = sqliteTable("api_key_permissions", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  serverId: text("server_id").references(() => mcpServers.id, { onDelete: "cascade" }),
  toolId: text("tool_id").references(() => mcpTools.id, { onDelete: "cascade" }),
  promptId: text("prompt_id").references(() => mcpPrompts.id, { onDelete: "cascade" }),
  actionType: text("action_type", { enum: ["read", "write", "delete", "execute"] }),
}, (table) => [
  index("idx_perms_key").on(table.apiKeyId),
  index("idx_perms_server").on(table.serverId),
  index("idx_perms_prompt").on(table.promptId),
  uniqueIndex("uq_perms_key_server_tool_prompt_action").on(table.apiKeyId, table.serverId, table.toolId, table.promptId, table.actionType),
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

// Pending OAuth Sessions
export const mcpOauthSessions = sqliteTable("mcp_oauth_sessions", {
  state: text("state").primaryKey(),
  serverId: text("server_id").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
  codeVerifier: text("code_verifier").notNull(),
  redirectUrl: text("redirect_url").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

