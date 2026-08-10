import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { mcpServers, mcpTools } from "../../db/schema";
import { createAuthProvider } from "./auth";
import { DockerTransport } from "./docker-transport";
import { parseDockerCommand } from "./docker-parser";
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
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, serverId))
      .get();

    if (!server) {
      throw new Error(`Server with id ${serverId} not found`);
    }

    // If already connected, disconnect first to refresh connection
    if (this.activeConnections.has(serverId)) {
      await this.disconnectServer(serverId);
    }

    // Update status in DB
    db.update(mcpServers)
      .set({ status: "connecting", lastError: null, updatedAt: sql`datetime('now')` })
      .where(eq(mcpServers.id, serverId))
      .run();

    try {
      const config = JSON.parse(server.configJson);
      const authProvider = createAuthProvider(server.authType, server.authDataJson);
      const authHeaders = await authProvider.getHeaders();

      let transport: Transport;
      let stopSidecar: (() => Promise<void>) | undefined;

      if (server.transportType === "stdio" || server.transportType === "docker") {
        // Both stdio and docker use the Docker sidecar + DockerTransport
        // For docker: config may have rawCommand that needs parsing
        let sidecarConfig: {
          image?: string;
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          volumes?: string[];
        };

        if (server.transportType === "docker" && config.rawCommand) {
          // Parse the raw docker run command
          const parsed = parseDockerCommand(config.rawCommand);
          sidecarConfig = {
            image: parsed.image,
            command: parsed.command,
            args: parsed.args,
            env: { ...parsed.env, ...authHeaders },
            volumes: parsed.volumes,
          };
        } else {
          sidecarConfig = {
            image: config.image,
            command: config.command,
            args: config.args,
            env: { ...config.env, ...authHeaders },
            volumes: config.volumes,
          };
        }

        const sidecar = await sidecarManager.spawnSidecar(serverId, sidecarConfig);
        stopSidecar = sidecar.stop;

        // Use DockerTransport for proper stdio communication with the container
        transport = new DockerTransport({
          readable: sidecar.readable,
          writable: sidecar.writable,
          stop: sidecar.stop,
        });
      } else if (server.transportType === "sse") {
        const url = new URL(config.url);
        transport = new SSEClientTransport(url, {
          requestInit: {
            headers: authHeaders,
          },
        });
      } else {
        throw new Error(`Unsupported transport_type: ${server.transportType}`);
      }

      const client = new Client(
        { name: "mcp-router", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);

      // Discover and sync tools
      const toolsResult = await client.listTools();
      const discoveredTools = toolsResult.tools || [];

      // Save tools into SQLite via Drizzle
      for (const tool of discoveredTools) {
        const toolId = crypto.randomUUID();
        const namespacedName = `${server.name}__${tool.name}`;

        // Upsert: insert or update on conflict
        db.insert(mcpTools)
          .values({
            id: toolId,
            serverId,
            name: tool.name,
            namespacedName,
            description: tool.description || "",
            inputSchemaJson: JSON.stringify(tool.inputSchema || {}),
          })
          .onConflictDoUpdate({
            target: [mcpTools.serverId, mcpTools.name],
            set: {
              namespacedName,
              description: tool.description || "",
              inputSchemaJson: JSON.stringify(tool.inputSchema || {}),
            },
          })
          .run();
      }

      // Remove any tools no longer exposed by server
      const currentToolNames = discoveredTools.map((t) => t.name);
      if (currentToolNames.length > 0) {
        db.delete(mcpTools)
          .where(
            and(
              eq(mcpTools.serverId, serverId),
              notInArray(mcpTools.name, currentToolNames)
            )
          )
          .run();
      } else {
        db.delete(mcpTools)
          .where(eq(mcpTools.serverId, serverId))
          .run();
      }

      this.activeConnections.set(serverId, {
        client,
        transport,
        stopSidecar,
      });

      db.update(mcpServers)
        .set({ status: "connected", lastError: null, updatedAt: sql`datetime('now')` })
        .where(eq(mcpServers.id, serverId))
        .run();

      return true;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error(`[UpstreamManager] Connection failed for server ${serverId}:`, errorMessage);

      db.update(mcpServers)
        .set({ status: "error", lastError: errorMessage, updatedAt: sql`datetime('now')` })
        .where(eq(mcpServers.id, serverId))
        .run();

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
    db.update(mcpServers)
      .set({ status: "disconnected", updatedAt: sql`datetime('now')` })
      .where(eq(mcpServers.id, serverId))
      .run();
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
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.status, "connected"))
      .all();

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
