import { describe, expect, it, beforeEach } from "bun:test";
import { classifyToolAction } from "../src/mcp/upstream/classifier";
import { keyService } from "../src/services/key.service";
import { toolService } from "../src/services/tool.service";
import { serverService } from "../src/services/server.service";
import { filterEngine } from "../src/mcp/downstream/filter";
import { getDb } from "../src/db";
import { mcpServers, mcpTools, apiKeys, apiKeyPermissions } from "../src/db/schema";
import app from "../src/api/tools.controller";

describe("Action-based Tool Grouping & Permissions", () => {
  beforeEach(() => {
    const db = getDb();
    db.delete(apiKeyPermissions).run();
    db.delete(apiKeys).run();
    db.delete(mcpTools).run();
    db.delete(mcpServers).run();
  });

  describe("classifyToolAction Heuristic Classifier", () => {
    it("classifies tool names into read, write, delete, execute", () => {
      expect(classifyToolAction("get_file_contents")).toBe("read");
      expect(classifyToolAction("list_directory")).toBe("read");
      expect(classifyToolAction("search_codebase")).toBe("read");

      expect(classifyToolAction("create_issue")).toBe("write");
      expect(classifyToolAction("update_user_profile")).toBe("write");
      expect(classifyToolAction("edit_document")).toBe("write");

      expect(classifyToolAction("delete_repository")).toBe("delete");
      expect(classifyToolAction("remove_member")).toBe("delete");
      expect(classifyToolAction("purge_cache")).toBe("delete");

      expect(classifyToolAction("run_pipeline")).toBe("execute");
      expect(classifyToolAction("execute_command")).toBe("execute");
      expect(classifyToolAction("trigger_deployment")).toBe("execute");
    });

    it("handles camelCase and PascalCase tool names correctly", () => {
      expect(classifyToolAction("getAccessibleAtlassianResources")).toBe("read");
      expect(classifyToolAction("getJiraIssue")).toBe("read");
      expect(classifyToolAction("createJiraIssue")).toBe("write");
      expect(classifyToolAction("deleteJiraIssue")).toBe("delete");
    });

    it("uses description fallback if tool name is generic", () => {
      expect(classifyToolAction("custom_tool_1", "Fetch and read metrics from database")).toBe("read");
      expect(classifyToolAction("custom_tool_2", "Destroys and removes temp files")).toBe("delete");
    });
  });

  describe("Permission Filtering by Action Type", () => {
    it("filters tools list based on actionType permission tier", async () => {
      const db = getDb();
      const serverId = "srv-100";

      // 1. Insert server
      db.insert(mcpServers)
        .values({
          id: serverId,
          name: "test_server",
          transportType: "stdio",
          configJson: "{}",
          status: "connected",
        })
        .run();

      // 2. Insert tools with various action_types
      db.insert(mcpTools)
        .values([
          {
            id: "t-read",
            serverId,
            name: "read_notes",
            namespacedName: "test_server__read_notes",
            description: "Read notes",
            inputSchemaJson: "{}",
            actionType: "read",
          },
          {
            id: "t-write",
            serverId,
            name: "write_notes",
            namespacedName: "test_server__write_notes",
            description: "Write notes",
            inputSchemaJson: "{}",
            actionType: "write",
          },
          {
            id: "t-delete",
            serverId,
            name: "delete_notes",
            namespacedName: "test_server__delete_notes",
            description: "Delete notes",
            inputSchemaJson: "{}",
            actionType: "delete",
          },
        ])
        .run();

      // 3. Create API Key with READ-ONLY permission on server
      const key = keyService.createKey({
        name: "Read-Only Key",
        permissions: [
          { serverId, actionType: "read" },
        ],
      });

      // 4. Test filterToolsList
      const accessibleTools = filterEngine.filterToolsList(key.id);
      expect(accessibleTools.length).toBe(1);
      expect(accessibleTools[0].name).toBe("read_notes");

      // 5. Test authorizeToolCall
      const targetRead = filterEngine.authorizeToolCall(key.id, "test_server__read_notes");
      expect(targetRead.originalToolName).toBe("read_notes");

      expect(() => {
        filterEngine.authorizeToolCall(key.id, "test_server__write_notes");
      }).toThrow(/Permission denied/);

      expect(() => {
        filterEngine.authorizeToolCall(key.id, "test_server__delete_notes");
      }).toThrow(/Permission denied/);
    });
  });

  describe("Tools Controller PATCH Endpoint", () => {
    it("allows updating tool action_type via PATCH /api/tools/:id", async () => {
      const db = getDb();
      const serverId = "srv-200";

      db.insert(mcpServers)
        .values({
          id: serverId,
          name: "patch_server",
          transportType: "stdio",
          configJson: "{}",
          status: "connected",
        })
        .run();

      db.insert(mcpTools)
        .values({
          id: "t-patch",
          serverId,
          name: "ambiguous_tool",
          namespacedName: "patch_server__ambiguous_tool",
          description: "Does something ambiguous",
          inputSchemaJson: "{}",
          actionType: "write",
        })
        .run();

      const res = await app.request("/t-patch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_type: "delete" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.actionType).toBe("delete");

      // Verify DB update
      const updated = toolService.getToolByNamespacedName("patch_server__ambiguous_tool");
      expect(updated?.action_type).toBe("delete");
    });
  });
});
