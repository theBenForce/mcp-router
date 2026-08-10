import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { mcpServers, mcpTools } from "../db/schema";
import { upstreamManager } from "../mcp/upstream/manager";

export interface CreateServerInput {
  name: string;
  description?: string;
  transportType: "stdio" | "docker" | "sse" | "streamable-http";
  config: Record<string, unknown>;
  authType?: "none" | "api_key" | "bearer" | "oauth2";
  authData?: Record<string, unknown>;
}

export interface UpdateServerInput {
  name?: string;
  description?: string;
  transportType?: "stdio" | "docker" | "sse" | "streamable-http";
  config?: Record<string, unknown>;
  authType?: "none" | "api_key" | "bearer" | "oauth2";
  authData?: Record<string, unknown>;
}

export class ServerService {
  listServers() {
    const db = getDb();
    return db
      .select({
        id: mcpServers.id,
        name: mcpServers.name,
        description: mcpServers.description,
        transport_type: mcpServers.transportType,
        config_json: mcpServers.configJson,
        auth_type: mcpServers.authType,
        auth_data_json: mcpServers.authDataJson,
        status: mcpServers.status,
        last_error: mcpServers.lastError,
        created_at: mcpServers.createdAt,
        updated_at: mcpServers.updatedAt,
        tool_count: sql<number>`COUNT(${mcpTools.id})`,
      })
      .from(mcpServers)
      .leftJoin(mcpTools, eq(mcpServers.id, mcpTools.serverId))
      .groupBy(mcpServers.id)
      .orderBy(sql`${mcpServers.createdAt} DESC`)
      .all();
  }

  getServer(id: string) {
    const db = getDb();
    const server = db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, id))
      .get();

    if (!server) return null;

    const tools = db
      .select()
      .from(mcpTools)
      .where(eq(mcpTools.serverId, id))
      .orderBy(mcpTools.name)
      .all();

    return {
      ...server,
      // Expose parsed config and auth_data alongside the raw columns
      // for backward compat with API consumers expecting these shapes
      config: JSON.parse(server.configJson || "{}"),
      auth_data: JSON.parse(server.authDataJson || "{}"),
      // Map Drizzle camelCase columns to snake_case for API consumers
      transport_type: server.transportType,
      config_json: server.configJson,
      auth_type: server.authType,
      auth_data_json: server.authDataJson,
      last_error: server.lastError,
      created_at: server.createdAt,
      updated_at: server.updatedAt,
      tools: tools.map((t) => ({
        ...t,
        server_id: t.serverId,
        namespaced_name: t.namespacedName,
        input_schema_json: t.inputSchemaJson,
        created_at: t.createdAt,
      })),
    };
  }

  async createServer(input: CreateServerInput) {
    const db = getDb();
    const id = crypto.randomUUID();
    const configJson = JSON.stringify(input.config);
    const authDataJson = JSON.stringify(input.authData || {});
    const authType = input.authType || "none";

    db.insert(mcpServers)
      .values({
        id,
        name: input.name,
        description: input.description || "",
        transportType: input.transportType,
        configJson,
        authType,
        authDataJson,
        status: "disconnected",
      })
      .run();

    // Attempt connection in the background — don't block the API response
    // while Docker pulls images and waits for MCP handshake
    upstreamManager.connectServer(id).catch((err) => {
      console.error(`[ServerService] Background connection failed for ${id}:`, err.message);
    });

    return this.getServer(id);
  }

  async updateServer(id: string, input: UpdateServerInput) {
    const db = getDb();
    const existing = this.getServer(id);
    if (!existing) return null;

    const name = input.name ?? existing.name;
    const description = input.description ?? existing.description;
    const transportType = input.transportType ?? existing.transport_type;
    const configJson = input.config ? JSON.stringify(input.config) : existing.config_json;
    const authType = input.authType ?? existing.auth_type;
    const authDataJson = input.authData ? JSON.stringify(input.authData) : existing.auth_data_json;

    db.update(mcpServers)
      .set({
        name,
        description,
        transportType,
        configJson,
        authType,
        authDataJson,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(mcpServers.id, id))
      .run();

    // Reconnect with updated configuration in the background
    upstreamManager.connectServer(id).catch((err) => {
      console.error(`[ServerService] Background reconnect failed for ${id}:`, err.message);
    });

    return this.getServer(id);
  }

  async deleteServer(id: string) {
    await upstreamManager.disconnectServer(id);
    const db = getDb();
    db.delete(mcpServers).where(eq(mcpServers.id, id)).run();
    return true;
  }

  async connectServer(id: string) {
    return await upstreamManager.connectServer(id);
  }

  async disconnectServer(id: string) {
    await upstreamManager.disconnectServer(id);
    return true;
  }
}

export const serverService = new ServerService();
