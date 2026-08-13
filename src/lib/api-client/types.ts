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

export interface BackendAdapter {
  getServers(): Promise<ServerConfig[]>;
  addServer(server: Partial<ServerConfig>): Promise<ServerConfig>;
  updateServer(id: string, server: Partial<ServerConfig>): Promise<ServerConfig>;
  deleteServer(id: string): Promise<void>;

  getTools(): Promise<any[]>;
  getPrompts(): Promise<any[]>;
  getLogs(limit?: number): Promise<any[]>;

  login(username: string, password: string): Promise<{ token: string; user: User }>;
  logout(): Promise<void>;
  checkAuth(): Promise<AuthStatus>;
}
