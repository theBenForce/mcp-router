import { describe, expect, test, afterAll } from "bun:test";
import { getDb, closeDb } from "../src/db";

describe("Database initialization", () => {
  afterAll(() => {
    closeDb();
  });

  test("should initialize sqlite database with required tables", () => {
    const db = getDb();
    expect(db).toBeDefined();

    // Query tables in database
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("mcp_servers");
    expect(tableNames).toContain("mcp_tools");
    expect(tableNames).toContain("api_keys");
    expect(tableNames).toContain("api_key_permissions");
    expect(tableNames).toContain("audit_logs");
  });
});
