import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { mcpServers, mcpTools } from "../db/schema";
import { upstreamManager } from "../mcp/upstream/manager";

export interface CreateServerInput {
  name: string;
  description?: string;
  transportType: "stdio" | "docker" | "sse" | "streamable-http";
  config: Record<string, unknown>;
  authType?: "none" | "api_key" | "bearer" | "oauth2" | "cli_command";
  authData?: Record<string, unknown>;
}

export interface UpdateServerInput {
  name?: string;
  description?: string;
  transportType?: "stdio" | "docker" | "sse" | "streamable-http";
  config?: Record<string, unknown>;
  authType?: "none" | "api_key" | "bearer" | "oauth2" | "cli_command";
  authData?: Record<string, unknown>;
}

export class ServerService {
  listServers() {
    const db = getDb();
    const rows = db
      .select({
        id: mcpServers.id,
        name: mcpServers.name,
        description: mcpServers.description,
        server_version: mcpServers.serverVersion,
        server_title: mcpServers.serverTitle,
        instructions: mcpServers.instructions,
        website_url: mcpServers.websiteUrl,
        icons_json: mcpServers.iconsJson,
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

    return rows.map((s) => {
      let config: Record<string, any> = {};
      try {
        config = JSON.parse(s.config_json || "{}");
      } catch {}
      const executorType = s.transport_type === "docker" || (s.transport_type === "stdio" && config.useDocker) ? "docker" : "host";
      return {
        ...s,
        config,
        executor_type: executorType,
        executorType,
      };
    });
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

    const config = JSON.parse(server.configJson || "{}");
    const executorType = server.transportType === "docker" || (server.transportType === "stdio" && config.useDocker) ? "docker" : "host";

    return {
      ...server,
      // Expose parsed config and auth_data alongside the raw columns
      // for backward compat with API consumers expecting these shapes
      config,
      auth_data: JSON.parse(server.authDataJson || "{}"),
      executor_type: executorType,
      executorType,
      // Map Drizzle camelCase columns to snake_case for API consumers
      server_version: server.serverVersion,
      server_title: server.serverTitle,
      instructions: server.instructions,
      website_url: server.websiteUrl,
      icons_json: server.iconsJson,
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
        action_type: t.actionType,
        created_at: t.createdAt,
      })),
    };
  }

  async createServer(input: CreateServerInput) {
    const db = getDb();
    const id = crypto.randomUUID();
    const config = {
      ...input.config,
      ...(input.transportType === "stdio" ? { useDocker: input.executorType === "docker" } : {}),
    };
    const configJson = JSON.stringify(config);
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
    const updatedConfig = input.config ? {
      ...input.config,
      ...(transportType === "stdio" ? { useDocker: input.executorType === "docker" } : {}),
    } : {
      ...existing.config,
      ...(transportType === "stdio" && input.executorType ? { useDocker: input.executorType === "docker" } : {}),
    };
    const configJson = JSON.stringify(updatedConfig);
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

  async runAuthCommand(id: string, customCommand?: string) {
    const server = this.getServer(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    const authData = server.auth_data || {};
    const config = server.config || {};
    const cmdToRun = customCommand || authData.command || authData.cliCommand || config.authCommand;

    if (!cmdToRun || typeof cmdToRun !== "string" || !cmdToRun.trim()) {
      throw new Error(`No CLI Auth Command configured for server "${server.name}"`);
    }

    const { exec } = await import("node:child_process");

    return new Promise<{ success: boolean; exitCode: number; output: string; error?: string }>((resolve) => {
      console.log(`[ServerService] Running auth command for ${server.name} (${id}): ${cmdToRun}`);

      const child = exec(cmdToRun, {
        timeout: 60000,
        env: { ...process.env, ...(config.env || {}) },
      }, async (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        const exitCode = error ? ((error as any).code ?? 1) : 0;
        const success = exitCode === 0;

        if (success) {
          console.log(`[ServerService] Auth command succeeded for ${id}, triggering reconnect...`);
          this.connectServer(id).catch((err) => {
            console.error(`[ServerService] Reconnect after auth failed for ${id}:`, err.message);
          });
        }

        resolve({
          success,
          exitCode: typeof exitCode === "number" ? exitCode : 1,
          output: output || (success ? "Command completed with no output." : "Command failed."),
          error: error ? error.message : undefined,
        });
      });
    });
  }
}

export const serverService = new ServerService();

