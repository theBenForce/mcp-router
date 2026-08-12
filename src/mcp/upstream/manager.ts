import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { eq, ne, and, notInArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { mcpServers, mcpTools } from "../../db/schema";
import { createAuthProvider } from "./auth";
import { MCPRouterOAuthProvider } from "./oauth-provider";
import { DockerTransport } from "./docker-transport";
import { parseDockerCommand } from "./docker-parser";
import { sidecarManager } from "./sidecar";
import { hostProcessManager } from "./host";
import { classifyToolAction } from "./classifier";

export interface ActiveServerConnection {
  client: Client;
  transport: Transport;
  stopSidecar?: () => Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function normalizeStdioCommand(rawCommand: string, rawArgs: string[] = []): { command: string; args: string[] } {
  let trimmedCmd = (rawCommand || "").trim();
  let args = [...(rawArgs || [])];

  if (trimmedCmd.includes(" ")) {
    const parts = trimmedCmd.split(/\s+/).filter(Boolean);
    trimmedCmd = parts[0];
    args = [...parts.slice(1), ...args];
  }

  if (/\.(js|mjs|cjs)$/i.test(trimmedCmd)) {
    args = [trimmedCmd, ...args];
    trimmedCmd = "node";
  } else if (/\.ts$/i.test(trimmedCmd)) {
    args = [trimmedCmd, ...args];
    trimmedCmd = "bun";
  }

  return { command: trimmedCmd, args };
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

    let getStderrLog: (() => string) | undefined;

    try {
      const config = JSON.parse(server.configJson);
      const authProvider = createAuthProvider(server.authType, server.authDataJson, serverId);
      const authHeaders = await authProvider.getHeaders();
      const oauthProvider = server.authType === "oauth2" ? new MCPRouterOAuthProvider({ serverId }) : undefined;

      let transport: Transport;
      let stopSidecar: (() => Promise<void>) | undefined;

      if (server.transportType === "stdio" && !config.useDocker) {
        const normalized = normalizeStdioCommand(config.command || "node", config.args || []);
        console.log(`[UpstreamManager] Spawning native host stdio transport for ${serverId}: ${normalized.command} ${normalized.args.join(" ")}`);
        const envVars = {
          ...process.env,
          ...(config.env || {}),
          ...authHeaders,
        };
        const hostConn = await hostProcessManager.spawnHostProcess(serverId, {
          command: normalized.command,
          args: normalized.args,
          env: envVars,
          cwd: config.cwd,
        });
        stopSidecar = hostConn.stop;
        getStderrLog = hostConn.getStderr;

        transport = new DockerTransport({
          readable: hostConn.readable,
          writable: hostConn.writable,
          stop: hostConn.stop,
        });
      } else if (server.transportType === "docker" || (server.transportType === "stdio" && config.useDocker)) {
        // Docker sidecar transport
        let sidecarConfig: {
          image?: string;
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          volumes?: string[];
        };

        if (server.transportType === "docker" && config.rawCommand) {
          const parsed = parseDockerCommand(config.rawCommand);
          sidecarConfig = {
            image: parsed.image,
            command: parsed.command,
            args: parsed.args,
            env: { ...parsed.env, ...authHeaders },
            volumes: parsed.volumes,
            name: parsed.name || parsed.inferredName || server.name,
          };
        } else {
          sidecarConfig = {
            image: config.image,
            command: config.command,
            args: config.args,
            env: { ...config.env, ...authHeaders },
            volumes: config.volumes,
            name: config.name || server.name,
          };
        }

        console.log(`[UpstreamManager] Spawning sidecar for ${serverId} (${server.transportType}), image: ${sidecarConfig.image}`);
        const sidecar = await sidecarManager.spawnSidecar(serverId, sidecarConfig, server.name);
        console.log(`[UpstreamManager] Sidecar spawned for ${serverId}, connecting transport...`);
        stopSidecar = sidecar.stop;

        transport = new DockerTransport({
          readable: sidecar.readable,
          writable: sidecar.writable,
          stop: sidecar.stop,
        });
      } else if (server.transportType === "sse") {
        const url = new URL(config.url);
        transport = new SSEClientTransport(url, {
          authProvider: oauthProvider,
          requestInit: {
            headers: authHeaders,
          },
        });
      } else if (server.transportType === "streamable-http" || server.transportType === "http") {
        const url = new URL(config.url);
        transport = new StreamableHTTPClientTransport(url, {
          authProvider: oauthProvider,
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

      await withTimeout(
        client.connect(transport),
        8000,
        `Connection to server '${server.name}' timed out after 8s`
      );

      // Discover and sync tools
      const toolsResult = await client.listTools();
      const discoveredTools = toolsResult.tools || [];

      // Save tools into SQLite via Drizzle
      for (const tool of discoveredTools) {
        const toolId = crypto.randomUUID();
        const namespacedName = `${server.name}__${tool.name}`;
        const actionType = classifyToolAction(tool.name, tool.description || "");

        // Upsert: insert or update on conflict
        db.insert(mcpTools)
          .values({
            id: toolId,
            serverId,
            name: tool.name,
            namespacedName,
            description: tool.description || "",
            inputSchemaJson: JSON.stringify(tool.inputSchema || {}),
            actionType,
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

      // Remove any tools no longer exposed by server (only if tools list returned)
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
      }

      this.activeConnections.set(serverId, {
        client,
        transport,
        stopSidecar,
      });

      // Capture metadata returned by upstream MCP server during initialization
      const serverVersionInfo = client.getServerVersion();
      const instructions = client.getInstructions();

      const serverVersion = serverVersionInfo?.version || null;
      const serverTitle = serverVersionInfo?.title || null;
      const websiteUrl = serverVersionInfo?.websiteUrl || null;
      const iconsJson = serverVersionInfo?.icons ? JSON.stringify(serverVersionInfo.icons) : null;
      const autoDescription = (!server.description || server.description.trim() === "")
        ? (serverVersionInfo?.description || serverTitle || instructions || "")
        : server.description;

      db.update(mcpServers)
        .set({
          status: "connected",
          lastError: null,
          serverVersion,
          serverTitle,
          instructions: instructions || null,
          websiteUrl,
          iconsJson,
          description: autoDescription,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(mcpServers.id, serverId))
        .run();

      return true;
    } catch (error: any) {
      let errorMessage = error?.message || String(error);
      const isOAuthAuthRequired = errorMessage.includes("OAuth authorization required");

      if (getStderrLog) {
        const stderrLog = getStderrLog();
        if (stderrLog && stderrLog.trim()) {
          errorMessage += `\n\nStderr log output:\n${stderrLog.trim()}`;
        }
      }

      console.error(`[UpstreamManager] Connection failed for server ${serverId}:`, errorMessage);

      db.update(mcpServers)
        .set({
          status: isOAuthAuthRequired ? "need_auth" : "error",
          lastError: errorMessage,
          updatedAt: sql`datetime('now')`,
        })
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
      .where(ne(mcpServers.status, "need_auth"))
      .all();

    await Promise.allSettled(
      servers.map((server) =>
        this.connectServer(server.id).catch((err: any) => {
          console.error(`[UpstreamManager] Reconnect failed for ${server.id}:`, err?.message || err);
        })
      )
    );
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

process.on("SIGINT", async () => {
  await upstreamManager.disconnectAll();
});
process.on("SIGTERM", async () => {
  await upstreamManager.disconnectAll();
});
