import { describe, expect, test, afterAll } from "bun:test";
import { auditService } from "../src/services/audit.service";
import { formatLocalDateTime } from "../src/web/src/lib/utils";
import { getRawDb, closeDb } from "../src/db";

describe("Audit Logging & Timestamp Formatting", () => {
  afterAll(() => {
    closeDb();
  });

  test("auditService.logToolCall records audit log entry with ISO timestamp", () => {
    const logId = auditService.logToolCall({
      toolName: "test__tool",
      status: "success",
      durationMs: 120,
    });

    expect(logId).toBeDefined();

    const rawDb = getRawDb();
    const row = rawDb.query("SELECT * FROM audit_logs WHERE id = ?").get(logId) as any;
    expect(row).toBeDefined();
    expect(row.tool_name).toBe("test__tool");
    expect(row.status).toBe("success");
    expect(row.duration_ms).toBe(120);
    expect(row.created_at).toBeDefined();
    // Verify created_at is valid ISO string or SQLite timestamp
    expect(new Date(row.created_at).getTime()).not.toBeNaN();
  });

  test("formatLocalDateTime correctly parses SQLite UTC string (space separator) into local time", () => {
    // SQLite default datetime('now') returns "2026-08-11 16:43:28"
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
