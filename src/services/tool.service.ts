import { getDb } from "../db";

export class ToolService {
  listAllTools(serverId?: string) {
    const db = getDb();
    if (serverId) {
      return db
        .query(`
          SELECT t.*, s.name as server_name, s.status as server_status
          FROM mcp_tools t
          JOIN mcp_servers s ON t.server_id = s.id
          WHERE t.server_id = ?
          ORDER BY t.namespaced_name ASC
        `)
        .all(serverId);
    }

    return db
      .query(`
        SELECT t.*, s.name as server_name, s.status as server_status
        FROM mcp_tools t
        JOIN mcp_servers s ON t.server_id = s.id
        ORDER BY t.namespaced_name ASC
      `)
      .all();
  }

  getToolByNamespacedName(namespacedName: string) {
    const db = getDb();
    return db
      .query(`
        SELECT t.*, s.name as server_name, s.status as server_status
        FROM mcp_tools t
        JOIN mcp_servers s ON t.server_id = s.id
        WHERE t.namespaced_name = ?
      `)
      .get(namespacedName) as any;
  }
}

export const toolService = new ToolService();
