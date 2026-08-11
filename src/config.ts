import path from "node:path";
import fs from "node:fs";

export interface AppConfig {
  port: number;
  host: string;
  databasePath: string;
  publicDir: string;
  isDev: boolean;
}

const configFilePath = path.join(process.cwd(), "data", "config.json");

function loadSavedPort(): number {
  try {
    if (fs.existsSync(configFilePath)) {
      const data = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
      if (data.port && typeof data.port === "number") {
        return data.port;
      }
    }
  } catch {
    // Fall back to env or default
  }
  return parseInt(process.env.PORT || "5170", 10);
}

export function saveAppConfig(updates: { port?: number; host?: string }): AppConfig {
  try {
    const dataDir = path.dirname(configFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let existing: Record<string, unknown> = {};
    if (fs.existsSync(configFilePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
      } catch {}
    }

    const updated = { ...existing, ...updates };
    fs.writeFileSync(configFilePath, JSON.stringify(updated, null, 2), "utf-8");

    if (updates.port) {
      config.port = updates.port;
    }
    if (updates.host) {
      config.host = updates.host;
    }
  } catch (err: any) {
    console.error("[Config] Failed to save config:", err.message);
  }
  return config;
}

export const config: AppConfig = {
  port: loadSavedPort(),
  host: process.env.HOST || "0.0.0.0",
  databasePath:
    process.env.DATABASE_PATH ||
    (process.env.NODE_ENV === "test" ? ":memory:" : path.join(process.cwd(), "data", "mcp_router.db")),
  publicDir: process.env.PUBLIC_DIR || path.join(process.cwd(), "public"),
  isDev: process.env.NODE_ENV !== "production",
};
