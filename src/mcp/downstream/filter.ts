import { getDb } from "../../db";

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
      .query("SELECT server_id, tool_id FROM api_key_permissions WHERE api_key_id = ?")
      .all(apiKeyId) as Array<{ server_id: string; tool_id: string | null }>;

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
      .query(`
        SELECT t.*, s.name as server_name
        FROM mcp_tools t
        JOIN mcp_servers s ON t.server_id = s.id
        WHERE s.status = 'connected'
      `)
      .all() as any[];

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
      .query("SELECT id, server_id, name FROM mcp_tools WHERE namespaced_name = ?")
      .get(namespacedName) as { id: string; server_id: string; name: string } | null;

    if (!tool) {
      throw new Error(`Tool '${namespacedName}' not found`);
    }

    // Check if key has permission for this server (all tools) OR this specific tool
    const perm = db
      .query(`
        SELECT id FROM api_key_permissions
        WHERE api_key_id = ? AND server_id = ? AND (tool_id IS NULL OR tool_id = ?)
      `)
      .get(apiKeyId, tool.server_id, tool.id);

    if (!perm) {
      throw new Error(`Permission denied: API key does not have access to tool '${namespacedName}'`);
    }

    return {
      serverId: tool.server_id,
      originalToolName: tool.name,
    };
  }
}

export const filterEngine = new PermissionFilterEngine();
