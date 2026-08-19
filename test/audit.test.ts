import { describe, expect, test, afterAll, beforeEach } from "bun:test";
import { auditService, truncateAuditPayload, MAX_AUDIT_PAYLOAD_LENGTH } from "../src/services/audit.service";
import { keyService } from "../src/services/key.service";
import { formatLocalDateTime } from "../src/web/src/lib/utils";
import { getRawDb, closeDb } from "../src/db";
import app from "../src/index";

describe("Audit Logging, Filtering & Details", () => {
  afterAll(() => {
    closeDb();
  });

  test("auditService.logToolCall records audit log entry with ISO timestamp, parameters, and response", () => {
    const params = { query: "SELECT * FROM sales_2026", limit: 100 };
    const response = { rows: [{ id: 1, name: "Item A" }], count: 1 };

    const logId = auditService.logToolCall({
      toolName: "snowflake__run_query",
      status: "success",
      durationMs: 120,
      parametersJson: JSON.stringify(params),
      responseJson: JSON.stringify(response),
    });

    expect(logId).toBeDefined();

    const rawDb = getRawDb();
    const row = rawDb.query("SELECT * FROM audit_logs WHERE id = ?").get(logId) as any;
    expect(row).toBeDefined();
    expect(row.tool_name).toBe("snowflake__run_query");
    expect(row.status).toBe("success");
    expect(row.duration_ms).toBe(120);
    expect(row.parameters_json).toBe(JSON.stringify(params));
    expect(row.response_json).toBe(JSON.stringify(response));
    expect(row.created_at).toBeDefined();
    expect(new Date(row.created_at).getTime()).not.toBeNaN();
  });

  test("large response payloads (e.g. Snowflake query result) are safely truncated", () => {
    const hugePayload = "A".repeat(50000);
    const truncated = truncateAuditPayload(hugePayload, 20000);

    expect(truncated).toBeDefined();
    expect(truncated!.length).toBeLessThan(hugePayload.length);
    expect(truncated).toContain("... [Truncated: total length 50000 characters]");
    expect(truncated!.startsWith("A".repeat(100))).toBe(true);

    const logId = auditService.logToolCall({
      toolName: "snowflake__huge_query",
      status: "success",
      durationMs: 450,
      parametersJson: JSON.stringify({ sql: "SELECT * FROM huge_table" }),
      responseJson: hugePayload,
    });

    const storedLog = auditService.getLogById(logId) as any;
    expect(storedLog).toBeDefined();
    expect(storedLog.response_json).toContain("[Truncated: total length 50000 characters]");
    expect(storedLog.response_json.length).toBeLessThan(25000);
  });

  test("filtering by API key, target server, and tool name", () => {
    const rawDb = getRawDb();

    // Create 2 API Keys
    const key1 = keyService.createKey({ name: "Key Alpha" });
    const key2 = keyService.createKey({ name: "Key Beta" });

    // Create 2 Servers
    const server1Id = crypto.randomUUID();
    const server2Id = crypto.randomUUID();
    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, 'snowflake-prod', 'sse', '{}', 'connected'),
             (?, 'github-tools', 'stdio', '{"command":"node"}', 'connected')
    `).run(server1Id, server2Id);

    // Insert diverse audit logs
    const id1 = auditService.logToolCall({
      apiKeyId: key1.id,
      serverId: server1Id,
      toolName: "snowflake__query",
      status: "success",
      durationMs: 50,
      parametersJson: JSON.stringify({ sql: "SELECT 1" }),
    });

    const id2 = auditService.logToolCall({
      apiKeyId: key1.id,
      serverId: server2Id,
      toolName: "github__create_issue",
      status: "success",
      durationMs: 90,
      parametersJson: JSON.stringify({ title: "Bug 1" }),
    });

    const id3 = auditService.logToolCall({
      apiKeyId: key2.id,
      serverId: server1Id,
      toolName: "snowflake__query",
      status: "denied",
      errorMessage: "Permission denied for snowflake__query",
      durationMs: 5,
    });

    const id4 = auditService.logToolCall({
      apiKeyId: key2.id,
      serverId: server2Id,
      toolName: "github__list_repos",
      status: "error",
      errorMessage: "API Rate limit exceeded",
      durationMs: 200,
    });

    // 1. Filter by API Key
    const key1Logs = auditService.queryLogs({ apiKeyId: key1.id }) as any[];
    expect(key1Logs.some((l) => l.id === id1)).toBe(true);
    expect(key1Logs.some((l) => l.id === id2)).toBe(true);
    expect(key1Logs.some((l) => l.id === id3)).toBe(false);
    expect(key1Logs.some((l) => l.id === id4)).toBe(false);

    // 2. Filter by Target Server
    const server1Logs = auditService.queryLogs({ serverId: server1Id }) as any[];
    expect(server1Logs.some((l) => l.id === id1)).toBe(true);
    expect(server1Logs.some((l) => l.id === id3)).toBe(true);
    expect(server1Logs.some((l) => l.id === id2)).toBe(false);
    expect(server1Logs.some((l) => l.id === id4)).toBe(false);

    // 3. Filter by Tool Name
    const snowflakeQueryLogs = auditService.queryLogs({ toolName: "snowflake__query" }) as any[];
    expect(snowflakeQueryLogs.some((l) => l.id === id1)).toBe(true);
    expect(snowflakeQueryLogs.some((l) => l.id === id3)).toBe(true);
    expect(snowflakeQueryLogs.some((l) => l.id === id2)).toBe(false);
    expect(snowflakeQueryLogs.some((l) => l.id === id4)).toBe(false);

    // 4. Combined Filter: Key1 + Server1 + snowflake__query
    const combinedLogs = auditService.queryLogs({
      apiKeyId: key1.id,
      serverId: server1Id,
      toolName: "snowflake__query",
      status: "success",
    }) as any[];
    expect(combinedLogs.length).toBe(1);
    expect(combinedLogs[0].id).toBe(id1);

    // 5. Search query filtering
    const searchResult = auditService.queryLogs({ search: "Rate limit" }) as any[];
    expect(searchResult.some((l) => l.id === id4)).toBe(true);
    expect(searchResult.some((l) => l.id === id1)).toBe(false);
  });

  test("getLogById returns single record with joined api_key_name and server_name", () => {
    const rawDb = getRawDb();
    const key = keyService.createKey({ name: "Inspection Key" });
    const serverId = crypto.randomUUID();
    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, 'analytics-db', 'sse', '{}', 'connected')
    `).run(serverId);

    const logId = auditService.logToolCall({
      apiKeyId: key.id,
      serverId,
      toolName: "analytics__fetch_metrics",
      status: "success",
      durationMs: 35,
      parametersJson: JSON.stringify({ range: "7d" }),
      responseJson: JSON.stringify({ count: 42 }),
    });

    const entry = auditService.getLogById(logId) as any;
    expect(entry).toBeDefined();
    expect(entry.id).toBe(logId);
    expect(entry.api_key_name).toBe("Inspection Key");
    expect(entry.server_name).toBe("analytics-db");
    expect(entry.parameters_json).toBe(JSON.stringify({ range: "7d" }));
    expect(entry.response_json).toBe(JSON.stringify({ count: 42 }));
  });

  test("GET /api/audit and GET /api/audit/:id endpoints return filtered results and record details", async () => {
    const rawDb = getRawDb();
    const key = keyService.createKey({ name: "API Route Test Key" });
    const serverId = crypto.randomUUID();
    rawDb.query(`
      INSERT INTO mcp_servers (id, name, transport_type, config_json, status)
      VALUES (?, 'route-test-server', 'sse', '{}', 'connected')
    `).run(serverId);

    const logId = auditService.logToolCall({
      apiKeyId: key.id,
      serverId,
      toolName: "route__test_tool",
      status: "success",
      durationMs: 80,
      parametersJson: JSON.stringify({ arg1: "val1" }),
    });

    // Test GET /api/audit with filters
    const filterRes = await app.fetch(
      new Request(
        `http://localhost/api/audit?apiKeyId=${key.id}&serverId=${serverId}&toolName=route__test_tool&status=success`
      )
    );
    expect(filterRes.status).toBe(200);
    const filterLogs = await filterRes.json();
    expect(Array.isArray(filterLogs)).toBe(true);
    expect(filterLogs.some((l: any) => l.id === logId)).toBe(true);

    // Test GET /api/audit/:id
    const detailRes = await app.fetch(new Request(`http://localhost/api/audit/${logId}`));
    expect(detailRes.status).toBe(200);
    const detailLog = await detailRes.json();
    expect(detailLog.id).toBe(logId);
    expect(detailLog.tool_name).toBe("route__test_tool");
    expect(detailLog.api_key_name).toBe("API Route Test Key");
    expect(detailLog.server_name).toBe("route-test-server");
    expect(detailLog.parameters_json).toBe(JSON.stringify({ arg1: "val1" }));

    // Test GET /api/audit/:id 404 for invalid ID
    const notFoundRes = await app.fetch(new Request("http://localhost/api/audit/nonexistent-id-123"));
    expect(notFoundRes.status).toBe(404);
  });

  test("formatLocalDateTime correctly parses SQLite UTC string (space separator) into local time", () => {
    const sqliteUtcStr = "2026-08-11 16:43:28";
    const formatted = formatLocalDateTime(sqliteUtcStr);

    expect(formatted).not.toBe("—");
    expect(formatted).not.toBe(sqliteUtcStr);

    const expectedDate = new Date("2026-08-11T16:43:28Z");
    expect(formatted).toBe(expectedDate.toLocaleString());
  });

  test("formatLocalDateTime correctly parses ISO 8601 UTC string into local time", () => {
    const isoUtcStr = "2026-08-11T16:43:28.123Z";
    const formatted = formatLocalDateTime(isoUtcStr);

    const expectedDate = new Date("2026-08-11T16:43:28.123Z");
    expect(formatted).toBe(expectedDate.toLocaleString());
  });

  test("formatLocalDateTime handles null, undefined, or empty values gracefully", () => {
    expect(formatLocalDateTime(null)).toBe("—");
    expect(formatLocalDateTime(undefined)).toBe("—");
    expect(formatLocalDateTime("")).toBe("—");
  });
});

