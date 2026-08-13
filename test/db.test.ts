import { describe, expect, test, afterAll } from "bun:test";
import { getDb, getRawDb, closeDb } from "../src/db";

describe("Database initialization", () => {
  afterAll(() => {
    closeDb();
  });

  test("should initialize sqlite database with required tables", () => {
    const db = getDb();
    expect(db).toBeDefined();

    // Query tables in database using raw connection
    const rawDb = getRawDb();
    const tables = rawDb
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("mcp_servers");
    expect(tableNames).toContain("mcp_tools");
    expect(tableNames).toContain("api_keys");
    expect(tableNames).toContain("api_key_permissions");
    expect(tableNames).toContain("audit_logs");
  });

  test("should enforce foreign keys pragma after schema initialization", () => {
    getDb();
    const rawDb = getRawDb();
    const fkStatus = rawDb.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(fkStatus.foreign_keys).toBe(1);
  });

  test("mcp_servers table contains all metadata columns", () => {
    getDb();
    const rawDb = getRawDb();
    const columns = rawDb.query("PRAGMA table_info(mcp_servers)").all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain("server_version");
    expect(colNames).toContain("server_title");
    expect(colNames).toContain("instructions");
    expect(colNames).toContain("website_url");
    expect(colNames).toContain("icons_json");
  });
});
