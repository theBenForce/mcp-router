import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { apiKeyPermissions, mcpTools, mcpServers, mcpPrompts } from "../../db/schema";
import { promptService } from "../../services/prompt.service";

export interface AuthorizedToolTarget {
  serverId: string;
  originalToolName: string;
}

export class PermissionFilterEngine {
  /**
   * Returns list of tools accessible by the given API key.
   */
  filterToolsList(apiKeyId: string) {
    const db = getDb();

    // Fetch all permission rules for the API key
    const perms = db
      .select({
        server_id: apiKeyPermissions.serverId,
        tool_id: apiKeyPermissions.toolId,
        action_type: apiKeyPermissions.actionType,
      })
      .from(apiKeyPermissions)
      .where(eq(apiKeyPermissions.apiKeyId, apiKeyId))
      .all();

    if (perms.length === 0) {
      return [];
    }

    const serverIdsWithAllAccess = new Set<string>();
    const serverActionTypeAccess = new Set<string>(); // format: `${serverId}:${actionType}`
    const specificToolIds = new Set<string>();

    for (const p of perms) {
      if (!p.server_id) continue;
      if (!p.tool_id && !p.action_type) {
        serverIdsWithAllAccess.add(p.server_id);
      } else if (!p.tool_id && p.action_type) {
        serverActionTypeAccess.add(`${p.server_id}:${p.action_type}`);
      } else if (p.tool_id) {
        specificToolIds.add(p.tool_id);
      }
    }

    const allTools = db
      .select({
        id: mcpTools.id,
        server_id: mcpTools.serverId,
        name: mcpTools.name,
        namespaced_name: mcpTools.namespacedName,
        description: mcpTools.description,
        input_schema_json: mcpTools.inputSchemaJson,
        action_type: mcpTools.actionType,
        created_at: mcpTools.createdAt,
        server_name: mcpServers.name,
      })
      .from(mcpTools)
      .innerJoin(mcpServers, eq(mcpTools.serverId, mcpServers.id))
      .where(eq(mcpServers.status, "connected"))
      .all();

    return allTools.filter((t) => {
      if (serverIdsWithAllAccess.has(t.server_id)) {
        return true;
      }
      if (serverActionTypeAccess.has(`${t.server_id}:${t.action_type}`)) {
        return true;
      }
      return specificToolIds.has(t.id);
    });
  }

  /**
   * Validates if API key is authorized to call a specific namespaced tool.
   */
  authorizeToolCall(apiKeyId: string, namespacedName: string): AuthorizedToolTarget {
    const db = getDb();
    const tool = db
      .select({
        id: mcpTools.id,
        server_id: mcpTools.serverId,
        name: mcpTools.name,
        action_type: mcpTools.actionType,
      })
      .from(mcpTools)
      .where(eq(mcpTools.namespacedName, namespacedName))
      .get();

    if (!tool) {
      throw new Error(`Tool '${namespacedName}' not found`);
    }

    const permCheck = db
      .select({
        id: apiKeyPermissions.id,
        tool_id: apiKeyPermissions.toolId,
        action_type: apiKeyPermissions.actionType,
      })
      .from(apiKeyPermissions)
      .where(
        and(
          eq(apiKeyPermissions.apiKeyId, apiKeyId),
          eq(apiKeyPermissions.serverId, tool.server_id),
        )
      )
      .all();

    const hasPermission = permCheck.some((p) => {
      if (!p.tool_id && !p.action_type) return true;
      if (!p.tool_id && p.action_type === tool.action_type) return true;
      if (p.tool_id === tool.id) return true;
      return false;
    });

    if (!hasPermission) {
      throw new Error(`Permission denied: API key does not have access to tool '${namespacedName}'`);
    }

    return {
      serverId: tool.server_id,
      originalToolName: tool.name,
    };
  }

  /**
   * Returns list of tools for a specific server accessible by the given API key.
   */
  filterToolsListForServer(apiKeyId: string, serverId: string) {
    const allowed = this.filterToolsList(apiKeyId);
    return allowed.filter((t) => t.server_id === serverId);
  }

  /**
   * Validates if API key is authorized to call a specific tool on a specific server (by original tool name).
   */
  authorizeToolCallForServer(apiKeyId: string, serverId: string, originalToolName: string): AuthorizedToolTarget {
    const db = getDb();
    const tool = db
      .select({
        id: mcpTools.id,
        server_id: mcpTools.serverId,
        name: mcpTools.name,
        action_type: mcpTools.actionType,
      })
      .from(mcpTools)
      .where(
        and(
          eq(mcpTools.serverId, serverId),
          eq(mcpTools.name, originalToolName)
        )
      )
      .get();

    if (!tool) {
      throw new Error(`Tool '${originalToolName}' not found on server '${serverId}'`);
    }

    const permCheck = db
      .select({
        id: apiKeyPermissions.id,
        tool_id: apiKeyPermissions.toolId,
        action_type: apiKeyPermissions.actionType,
      })
      .from(apiKeyPermissions)
      .where(
        and(
          eq(apiKeyPermissions.apiKeyId, apiKeyId),
          eq(apiKeyPermissions.serverId, serverId),
        )
      )
      .all();

    const hasPermission = permCheck.some((p) => {
      if (!p.tool_id && !p.action_type) return true;
      if (!p.tool_id && p.action_type === tool.action_type) return true;
      if (p.tool_id === tool.id) return true;
      return false;
    });

    if (!hasPermission) {
      throw new Error(`Permission denied: API key does not have access to tool '${originalToolName}'`);
    }

    return {
      serverId: tool.server_id,
      originalToolName: tool.name,
    };
  }

  /**
   * Returns list of prompts accessible by the given API key.
   */
  filterPromptsList(apiKeyId: string) {
    const db = getDb();

    const perms = db
      .select({
        prompt_id: apiKeyPermissions.promptId,
      })
      .from(apiKeyPermissions)
      .where(eq(apiKeyPermissions.apiKeyId, apiKeyId))
      .all();

    if (perms.length === 0) {
      return [];
    }

    const specificPromptIds = new Set<string>();
    for (const p of perms) {
      if (p.prompt_id) {
        specificPromptIds.add(p.prompt_id);
      }
    }

    const allPrompts = promptService.listPrompts();
    return allPrompts.filter((p) => specificPromptIds.has(p.id));
  }

  /**
   * Validates if API key is authorized to access a specific prompt.
   */
  authorizePromptAccess(apiKeyId: string, promptName: string) {
    const prompt = promptService.getPromptByName(promptName);
    if (!prompt) {
      throw new Error(`Prompt '${promptName}' not found`);
    }

    const db = getDb();
    const permCheck = db
      .select({ id: apiKeyPermissions.id })
      .from(apiKeyPermissions)
      .where(
        and(
          eq(apiKeyPermissions.apiKeyId, apiKeyId),
          eq(apiKeyPermissions.promptId, prompt.id),
        )
      )
      .get();

    if (!permCheck) {
      throw new Error(`Permission denied: API key does not have access to prompt '${promptName}'`);
    }

    return prompt;
  }
}

export const filterEngine = new PermissionFilterEngine();

