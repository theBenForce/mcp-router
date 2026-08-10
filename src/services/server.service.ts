import { getDb } from "../db";
import { upstreamManager } from "../mcp/upstream/manager";

export interface CreateServerInput {
  name: string;
  description?: string;
  transportType: "stdio" | "sse";
  config: Record<string, unknown>;
  authType?: "none" | "api_key" | "bearer";
  authData?: Record<string, unknown>;
}

export interface UpdateServerInput {
  name?: string;
  description?: string;
  transportType?: "stdio" | "sse";
  config?: Record<string, unknown>;
  authType?: "none" | "api_key" | "bearer";
  authData?: Record<string, unknown>;
}

export class ServerService {
  listServers() {
    const db = getDb();
    return db
      .query(`
        SELECT
          s.*,
          COUNT(t.id) as tool_count
        FROM mcp_servers s
        LEFT JOIN mcp_tools t ON s.id = t.server_id
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `)
      .all();
  }

  getServer(id: string) {
    const db = getDb();
    const server = db
      .query("SELECT * FROM mcp_servers WHERE id = ?")
      .get(id) as any;

    if (!server) return null;

    const tools = db
      .query("SELECT * FROM mcp_tools WHERE server_id = ? ORDER BY name ASC")
      .all(id);

    return {
      ...server,
      config: JSON.parse(server.config_json || "{}"),
      auth_data: JSON.parse(server.auth_data_json || "{}"),
      tools,
    };
  }

  async createServer(input: CreateServerInput) {
    const db = getDb();
    const id = crypto.randomUUID();
    const configJson = JSON.stringify(input.config);
    const authDataJson = JSON.stringify(input.authData || {});
    const authType = input.authType || "none";

    db.query(`
      INSERT INTO mcp_servers (id, name, description, transport_type, config_json, auth_type, auth_data_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'disconnected')
    `).run(
      id,
      input.name,
      input.description || "",
      input.transportType,
      configJson,
      authType,
      authDataJson
    );

    // Attempt connection
    await upstreamManager.connectServer(id);

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

    db.query(`
      UPDATE mcp_servers
      SET name = ?, description = ?, transport_type = ?, config_json = ?, auth_type = ?, auth_data_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, description, transportType, configJson, authType, authDataJson, id);

    // Reconnect with updated configuration
    await upstreamManager.connectServer(id);

    return this.getServer(id);
  }

  async deleteServer(id: string) {
    await upstreamManager.disconnectServer(id);
    const db = getDb();
    db.query("DELETE FROM mcp_servers WHERE id = ?").run(id);
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
