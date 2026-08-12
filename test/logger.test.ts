import { describe, expect, it } from "bun:test";
import { ServerLogStore } from "../src/mcp/upstream/logger";

describe("ServerLogStore", () => {
  it("should add and retrieve log entries for a server", () => {
    const store = new ServerLogStore(100);
    const serverId = "srv-1";

    store.addLog(serverId, "info", "Server starting");
    store.addLog(serverId, "stdout", "Ready for requests");
    store.addLog(serverId, "stderr", "Warning: low disk space");

    const logs = store.getLogs(serverId);
    expect(logs.length).toBe(3);
    expect(logs[0].level).toBe("info");
    expect(logs[0].message).toBe("Server starting");
    expect(logs[1].level).toBe("stdout");
    expect(logs[2].level).toBe("stderr");
  });

  it("should filter logs by level and apply limit", () => {
    const store = new ServerLogStore(100);
    const serverId = "srv-2";

    store.addLog(serverId, "info", "Info 1");
    store.addLog(serverId, "stderr", "Error 1");
    store.addLog(serverId, "info", "Info 2");
    store.addLog(serverId, "stderr", "Error 2");

    const infoLogs = store.getLogs(serverId, "info");
    expect(infoLogs.length).toBe(2);
    expect(infoLogs.every((l) => l.level === "info")).toBe(true);

    const limitedLogs = store.getLogs(serverId, undefined, 2);
    expect(limitedLogs.length).toBe(2);
    expect(limitedLogs[0].message).toBe("Info 2");
    expect(limitedLogs[1].message).toBe("Error 2");
  });

  it("should enforce ring-buffer max size", () => {
    const store = new ServerLogStore(3);
    const serverId = "srv-3";

    store.addLog(serverId, "info", "Log 1");
    store.addLog(serverId, "info", "Log 2");
    store.addLog(serverId, "info", "Log 3");
    store.addLog(serverId, "info", "Log 4");

    const logs = store.getLogs(serverId);
    expect(logs.length).toBe(3);
    expect(logs[0].message).toBe("Log 2");
    expect(logs[1].message).toBe("Log 3");
    expect(logs[2].message).toBe("Log 4");
  });

  it("should clear logs for a specific server", () => {
    const store = new ServerLogStore(100);
    const serverId = "srv-4";

    store.addLog(serverId, "info", "Test log");
    expect(store.getLogs(serverId).length).toBe(1);

    store.clearLogs(serverId);
    expect(store.getLogs(serverId).length).toBe(0);
  });
});
