import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { apiKeyPermissions, mcpTools, mcpServers } from "../../db/schema";

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
      })
      .from(apiKeyPermissions)
      .where(eq(apiKeyPermissions.apiKeyId, apiKeyId))
      .all();

    if (perms.length === 0) {
      return [];
    }

    const serverIdsWithAllAccess = new Set<string>();
    const specificToolIds = new Set<string>();

    for (const p of perms) {
      if (!p.tool_id) {
        serverIdsWithAllAccess.add(p.server_id);
      } else {
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
      })
      .from(mcpTools)
      .where(eq(mcpTools.namespacedName, namespacedName))
      .get();

    if (!tool) {
      throw new Error(`Tool '${namespacedName}' not found`);
    }

    // Check if key has permission for this server (all tools) OR this specific tool
    const perm = db
      .select({ id: apiKeyPermissions.id })
      .from(apiKeyPermissions)
      .where(
        and(
          eq(apiKeyPermissions.apiKeyId, apiKeyId),
          eq(apiKeyPermissions.serverId, tool.server_id),
        )
      )
      .all()
      .find((p) => {
        // Re-check: we need to match either tool_id IS NULL (server-level) or tool_id = tool.id
        // Since the SQL OR with isNull is complex in Drizzle, we fetch matching rows and filter
        return true; // We already filtered by apiKeyId + serverId
      });

    // More precise check: verify actual permission exists
    const permCheck = db
      .select({ id: apiKeyPermissions.id, tool_id: apiKeyPermissions.toolId })
      .from(apiKeyPermissions)
      .where(
        and(
          eq(apiKeyPermissions.apiKeyId, apiKeyId),
          eq(apiKeyPermissions.serverId, tool.server_id),
        )
      )
      .all();

    const hasPermission = permCheck.some(
      (p) => p.tool_id === null || p.tool_id === tool.id
    );

    if (!hasPermission) {
      throw new Error(`Permission denied: API key does not have access to tool '${namespacedName}'`);
    }

    return {
      serverId: tool.server_id,
      originalToolName: tool.name,
    };
  }
}

export const filterEngine = new PermissionFilterEngine();
