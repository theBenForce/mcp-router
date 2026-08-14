import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { mcpServers, mcpTools } from "../db/schema";
import { upstreamManager } from "../mcp/upstream/manager";
import { serverLogStore } from "../mcp/upstream/logger";
import { getAugmentedEnv, resolveExecutable } from "../mcp/upstream/host";

export interface CreateServerInput {
  name: string;
  description?: string;
  serverVersion?: string;
  serverTitle?: string;
  instructions?: string;
  websiteUrl?: string;
  iconsJson?: string;
  transportType: "stdio" | "docker" | "sse" | "streamable-http";
  executorType?: "host" | "docker";
  config: Record<string, unknown>;
  authType?: "none" | "api_key" | "bearer" | "oauth2" | "cli_command";
  authData?: Record<string, unknown>;
}

export interface UpdateServerInput {
  name?: string;
  description?: string;
  serverVersion?: string;
  serverTitle?: string;
  instructions?: string;
  websiteUrl?: string;
  iconsJson?: string;
  transportType?: "stdio" | "docker" | "sse" | "streamable-http";
  executorType?: "host" | "docker";
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
      .orderBy(sql`LOWER(${mcpServers.name}) ASC`, sql`${mcpServers.name} ASC`)
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
        serverVersion: input.serverVersion || null,
        serverTitle: input.serverTitle || null,
        instructions: input.instructions || null,
        websiteUrl: input.websiteUrl || null,
        iconsJson: input.iconsJson || null,
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
    const serverVersion = input.serverVersion !== undefined ? input.serverVersion : existing.server_version;
    const serverTitle = input.serverTitle !== undefined ? input.serverTitle : existing.server_title;
    const instructions = input.instructions !== undefined ? input.instructions : existing.instructions;
    const websiteUrl = input.websiteUrl !== undefined ? input.websiteUrl : existing.website_url;
    const iconsJson = input.iconsJson !== undefined ? input.iconsJson : existing.icons_json;
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
        serverVersion,
        serverTitle,
        instructions,
        websiteUrl,
        iconsJson,
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
    serverLogStore.clearLogs(id);
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

  async runAuthCommand(id: string) {
    const server = this.getServer(id);
    if (!server) {
      throw new Error(`Server with id ${id} not found`);
    }

    const authData = server.auth_data || {};
    const config = server.config || {};
    const cmdToRun = authData.command || authData.cliCommand || config.authCommand;

    if (!cmdToRun || typeof cmdToRun !== "string" || !cmdToRun.trim()) {
      throw new Error(`No CLI Auth Command configured for server "${server.name}"`);
    }

    const { spawn } = await import("node:child_process");
    const { parse } = await import("shell-quote");

    const parsedTokens = parse(cmdToRun);
    const args: string[] = [];
    let executable = "";

    for (const token of parsedTokens) {
      if (typeof token === "string") {
        if (!executable) {
          executable = token;
        } else {
          args.push(token);
        }
      }
    }

    if (!executable) {
      throw new Error(`Invalid CLI Auth Command configured for server "${server.name}"`);
    }

    const env = getAugmentedEnv((config.env as Record<string, string>) || {});
    const resolvedExecutable = resolveExecutable(executable, env);

    return new Promise<{ success: boolean; exitCode: number; output: string; error?: string }>((resolve) => {
      console.log(`[ServerService] Running auth command for ${server.name} (${id}): ${resolvedExecutable} ${args.join(" ")}`);

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      const child = spawn(resolvedExecutable, args, {
        timeout: 60000,
        env,
      });

      child.stdout?.on("data", (data) => stdoutChunks.push(data.toString()));
      child.stderr?.on("data", (data) => stderrChunks.push(data.toString()));

      child.on("error", (err) => {
        resolve({
          success: false,
          exitCode: 1,
          output: [stdoutChunks.join(""), stderrChunks.join("")].filter(Boolean).join("\n").trim() || err.message,
          error: err.message,
        });
      });

      child.on("close", (code) => {
        const exitCode = code ?? 0;
        const success = exitCode === 0;
        const output = [stdoutChunks.join(""), stderrChunks.join("")].filter(Boolean).join("\n").trim();

        if (success) {
          console.log(`[ServerService] Auth command succeeded for ${id}, triggering reconnect...`);
          this.connectServer(id).catch((err) => {
            console.error(`[ServerService] Reconnect after auth failed for ${id}:`, err.message);
          });
        }

        resolve({
          success,
          exitCode,
          output: output || (success ? "Command completed with no output." : "Command failed."),
        });
      });
    });
  }
}

export const serverService = new ServerService();

