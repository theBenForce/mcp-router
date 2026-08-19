export interface ServerConfig {
  id: string;
  name: string;
  description?: string;
  transportType: "stdio" | "docker" | "sse" | "streamable-http";
  status: "connected" | "disconnected" | "connecting" | "error" | "need_auth";
  [key: string]: any;
}

export interface User {
  id: string;
  username: string;
  role: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: User;
}

export interface BackendAdapterOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ToolDefinition {
  id: string;
  server_id: string;
  name: string;
  namespaced_name: string;
  description?: string;
  input_schema_json: string;
  action_type: "read" | "write" | "delete" | "execute";
  created_at: string;
}

export interface PromptArgumentDefinition {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptDefinition {
  id: string;
  name: string;
  title?: string;
  description?: string;
  content_template: string;
  arguments: PromptArgumentDefinition[];
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  api_key_id?: string | null;
  server_id?: string | null;
  tool_name: string;
  status: "allowed" | "denied" | "error" | "success";
  duration_ms?: number | null;
  error_message?: string | null;
  parameters_json?: string | null;
  response_json?: string | null;
  api_key_name?: string | null;
  key_prefix?: string | null;
  server_name?: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  apiKeyId?: string;
  serverId?: string;
  toolName?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BackendAdapter {
  getServers(): Promise<ServerConfig[]>;
  addServer(server: Partial<ServerConfig>): Promise<ServerConfig>;
  updateServer(id: string, server: Partial<ServerConfig>): Promise<ServerConfig>;
  deleteServer(id: string): Promise<void>;

  getTools(): Promise<ToolDefinition[]>;
  getPrompts(): Promise<PromptDefinition[]>;
  getLogs(filters?: AuditLogFilters | number): Promise<AuditLogEntry[]>;
  getLogById?(id: string): Promise<AuditLogEntry>;

  login(username: string, password: string): Promise<{ token: string; user: User }>;
  logout(): Promise<void>;
  checkAuth(): Promise<AuthStatus>;
}

