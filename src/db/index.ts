import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import schemaSql from "./schema.sql" with { type: "text" };

let dbInstance: Database | null = null;

export function getDb(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure directory exists
  const dir = path.dirname(config.databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(config.databasePath);
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  dbInstance.exec("PRAGMA foreign_keys = ON;");

  // Run initial schema migration
  dbInstance.exec(schemaSql);

  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
