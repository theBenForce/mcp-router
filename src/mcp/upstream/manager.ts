import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { getDb } from "../../db";
import { createAuthProvider } from "./auth";
import { sidecarManager } from "./sidecar";

export interface ActiveServerConnection {
  client: Client;
  transport: Transport;
  stopSidecar?: () => Promise<void>;
}

export class UpstreamConnectionManager {
  private activeConnections: Map<string, ActiveServerConnection> = new Map();

  async connectServer(serverId: string): Promise<boolean> {
    const db = getDb();
    const server = db
      .query("SELECT * FROM mcp_servers WHERE id = ?")
      .get(serverId) as any;

    if (!server) {
      throw new Error(`Server with id ${serverId} not found`);
    }

    // If already connected, disconnect first to refresh connection
    if (this.activeConnections.has(serverId)) {
      await this.disconnectServer(serverId);
    }

    // Update status in DB
    db.query("UPDATE mcp_servers SET status = 'connecting', last_error = NULL, updated_at = datetime('now') WHERE id = ?").run(serverId);

    try {
      const config = JSON.parse(server.config_json);
      const authProvider = createAuthProvider(server.auth_type, server.auth_data_json);
      const authHeaders = await authProvider.getHeaders();

      let transport: Transport;
      let stopSidecar: (() => Promise<void>) | undefined;

      if (server.transport_type === "stdio") {
        // Spawn Docker sidecar for stdio servers
        const sidecar = await sidecarManager.spawnSidecar(serverId, {
          image: config.image,
          command: config.command,
          args: config.args,
          env: { ...config.env, ...authHeaders },
        });

        stopSidecar = sidecar.stop;

        // Custom StdioClientTransport wrapping sidecar stream pipes
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
        });

        // Override reader/writer streams with sidecar streams
        (transport as any)._readStream = sidecar.readable;
        (transport as any)._writeStream = sidecar.writable;
      } else if (server.transport_type === "sse") {
        const url = new URL(config.url);
        transport = new SSEClientTransport(url, {
          requestInit: {
            headers: authHeaders,
          },
        });
      } else {
        throw new Error(`Unsupported transport_type: ${server.transport_type}`);
      }

      const client = new Client(
        { name: "mcp-router", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);

      // Discover and sync tools
      const toolsResult = await client.listTools();
      const discoveredTools = toolsResult.tools || [];

      // Save tools into SQLite
      const insertToolStmt = db.prepare(`
        INSERT INTO mcp_tools (id, server_id, name, namespaced_name, description, input_schema_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(server_id, name) DO UPDATE SET
          namespaced_name = excluded.namespaced_name,
          description = excluded.description,
          input_schema_json = excluded.input_schema_json,
          updated_at = datetime('now')
      `);

      for (const tool of discoveredTools) {
        const toolId = crypto.randomUUID();
        const namespacedName = `${server.name}__${tool.name}`;
        insertToolStmt.run(
          toolId,
          serverId,
          tool.name,
          namespacedName,
          tool.description || "",
          JSON.stringify(tool.inputSchema || {})
        );
      }

      // Remove any tools no longer exposed by server
      const currentToolNames = discoveredTools.map((t) => t.name);
      if (currentToolNames.length > 0) {
        const placeholders = currentToolNames.map(() => "?").join(",");
        db.query(
          `DELETE FROM mcp_tools WHERE server_id = ? AND name NOT IN (${placeholders})`
        ).run(serverId, ...currentToolNames);
      } else {
        db.query("DELETE FROM mcp_tools WHERE server_id = ?").run(serverId);
      }

      this.activeConnections.set(serverId, {
        client,
        transport,
        stopSidecar,
      });

      db.query("UPDATE mcp_servers SET status = 'connected', last_error = NULL, updated_at = datetime('now') WHERE id = ?").run(serverId);

      return true;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error(`[UpstreamManager] Connection failed for server ${serverId}:`, errorMessage);

      db.query(
        "UPDATE mcp_servers SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(errorMessage, serverId);

      return false;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const conn = this.activeConnections.get(serverId);
    if (conn) {
      try {
        await conn.client.close();
      } catch (err) {
        // Ignore close errors
      }
      if (conn.stopSidecar) {
        await conn.stopSidecar();
      }
      this.activeConnections.delete(serverId);
    }

    const db = getDb();
    db.query("UPDATE mcp_servers SET status = 'disconnected', updated_at = datetime('now') WHERE id = ?").run(serverId);
  }

  async callTool(
    serverId: string,
    originalToolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const conn = this.activeConnections.get(serverId);
    if (!conn) {
      // Attempt connection if not active
      const reconnected = await this.connectServer(serverId);
      if (!reconnected) {
        throw new Error(`Server ${serverId} is not connected`);
      }
    }

    const activeConn = this.activeConnections.get(serverId)!;
    return await activeConn.client.callTool({
      name: originalToolName,
      arguments: args,
    });
  }

  async reconnectAll(): Promise<void> {
    const db = getDb();
    const servers = db
      .query("SELECT id FROM mcp_servers WHERE status = 'connected'")
      .all() as { id: string }[];

    for (const server of servers) {
      await this.connectServer(server.id);
    }
  }

  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.activeConnections.keys());
    for (const id of serverIds) {
      await this.disconnectServer(id);
    }
  }

  isConnected(serverId: string): boolean {
    return this.activeConnections.has(serverId);
  }
}

export const upstreamManager = new UpstreamConnectionManager();
