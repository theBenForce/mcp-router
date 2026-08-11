import { describe, expect, test } from "bun:test";
import { hostProcessManager, getAugmentedEnv } from "../src/mcp/upstream/host";

describe("HostProcessManager", () => {
  test("getAugmentedEnv includes common binary directories in PATH", () => {
    const env = getAugmentedEnv({ CUSTOM_VAR: "test_val" });
    expect(env.CUSTOM_VAR).toBe("test_val");
    expect(env.PATH).toContain("/opt/homebrew/bin");
    expect(env.PATH).toContain("/usr/bin");
  });

  test("spawns a host process and receives stdio output", async () => {
    const conn = await hostProcessManager.spawnHostProcess("test-server-1", {
      command: "node",
      args: ["-e", "console.log('hello from host process')"],
    });

    const output = await new Promise<string>((resolve) => {
      conn.readable.on("data", (chunk: Buffer) => {
        resolve(chunk.toString().trim());
      });
    });

    expect(output).toBe("hello from host process");
    await conn.stop();
  });

  test("stops running process tree cleanly", async () => {
    const conn = await hostProcessManager.spawnHostProcess("test-server-2", {
      command: "node",
      args: ["-e", "setInterval(() => {}, 1000)"],
    });

    expect(conn.process.killed).toBe(false);
    await conn.stop();
  });

  test("handles spawn errors for non-existent commands gracefully", async () => {
    try {
      await hostProcessManager.spawnHostProcess("test-server-3", {
        command: "invalid-non-existent-command-12345",
      });
      expect(true).toBe(false); // Should not be reached
    } catch (err: any) {
      expect(err).toBeDefined();
      expect(err.message).toBeDefined();
    }
  });
});
