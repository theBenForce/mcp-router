import { serverEvents } from "./events";

export type LogLevel = "stdout" | "stderr" | "info" | "error";

export interface ServerLogEntry {
  id: string;
  serverId: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export class ServerLogStore {
  private logs: Map<string, ServerLogEntry[]> = new Map();
  private maxLogsPerServer: number;

  constructor(maxLogsPerServer = 1000) {
    this.maxLogsPerServer = maxLogsPerServer;
  }

  addLog(serverId: string, level: LogLevel, message: string): ServerLogEntry {
    if (!serverId) {
      return { id: "", serverId: "", timestamp: "", level, message: "" };
    }

    const trimmed = message.trimEnd();
    if (!trimmed) {
      return { id: "", serverId, timestamp: new Date().toISOString(), level: "info", message: "" };
    }

    // Split multiline chunks if needed or process line-by-line
    let serverLogs = this.logs.get(serverId);
    if (!serverLogs) {
      serverLogs = [];
      this.logs.set(serverId, serverLogs);
    }

    const entry: ServerLogEntry = {
      id: crypto.randomUUID(),
      serverId,
      timestamp: new Date().toISOString(),
      level,
      message: trimmed,
    };

    serverLogs.push(entry);

    if (serverLogs.length > this.maxLogsPerServer) {
      serverLogs.splice(0, serverLogs.length - this.maxLogsPerServer);
    }

    serverEvents.emitLog(entry);

    return entry;
  }

  getLogs(serverId: string, level?: LogLevel, limit?: number): ServerLogEntry[] {
    const serverLogs = this.logs.get(serverId) || [];
    let filtered = serverLogs;
    if (level) {
      filtered = filtered.filter((entry) => entry.level === level);
    }
    if (limit && limit > 0) {
      filtered = filtered.slice(-limit);
    }
    return [...filtered];
  }

  clearLogs(serverId: string): void {
    this.logs.delete(serverId);
  }
}

export const serverLogStore = new ServerLogStore();
