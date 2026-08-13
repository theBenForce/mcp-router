import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export interface AppConfig {
  port: number;
  host: string;
  databasePath: string;
  publicDir: string;
  isDev: boolean;
  authMode: "docker" | "desktop";
  sessionSecret: string;
  adminPassword?: string;
}

export function getDataDir(): string {
  if (process.env.MCP_ROUTER_DATA_DIR) {
    return process.env.MCP_ROUTER_DATA_DIR;
  }
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }

  if (process.env.NODE_ENV === "test") {
    const testDir = path.join(os.tmpdir(), "mcp-router-test");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    return testDir;
  }

  const home = os.homedir();
  let userDir: string;
  if (process.platform === "darwin") {
    userDir = path.join(home, "Library", "Application Support", "mcp-router");
  } else if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    userDir = path.join(appData, "mcp-router");
  } else {
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
    userDir = path.join(xdgData, "mcp-router");
  }

  try {
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), "mcp-router");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
}

const dataDir = getDataDir();
const configFilePath = path.join(dataDir, "config.json");

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
    const dir = path.dirname(configFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
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
    (process.env.NODE_ENV === "test" ? ":memory:" : path.join(dataDir, "mcp_router.db")),
  publicDir: process.env.PUBLIC_DIR || path.join(process.cwd(), "public"),
  isDev: process.env.NODE_ENV !== "production",
  authMode: (process.env.AUTH_MODE as "docker" | "desktop") || "desktop",
  sessionSecret: process.env.SESSION_SECRET || "mcp_router_default_session_secret_32_chars_long",
  adminPassword: process.env.ADMIN_PASSWORD,
};

