import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { mcpTools, mcpServers } from "../db/schema";

export class ToolService {
  listAllTools(serverId?: string) {
    const db = getDb();
    const query = db
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
        server_status: mcpServers.status,
      })
      .from(mcpTools)
      .innerJoin(mcpServers, eq(mcpTools.serverId, mcpServers.id))
      .orderBy(mcpTools.namespacedName);

    if (serverId) {
      return query.where(eq(mcpTools.serverId, serverId)).all();
    }

    return query.all();
  }

  getToolByNamespacedName(namespacedName: string) {
    const db = getDb();
    return db
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
        server_status: mcpServers.status,
      })
      .from(mcpTools)
      .innerJoin(mcpServers, eq(mcpTools.serverId, mcpServers.id))
      .where(eq(mcpTools.namespacedName, namespacedName))
      .get();
  }

  updateToolActionType(toolId: string, actionType: "read" | "write" | "delete" | "execute") {
    const db = getDb();
    db.update(mcpTools)
      .set({ actionType })
      .where(eq(mcpTools.id, toolId))
      .run();

    return db.select().from(mcpTools).where(eq(mcpTools.id, toolId)).get();
  }
}

export const toolService = new ToolService();
