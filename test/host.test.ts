import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import {
  hostProcessManager,
  getAugmentedEnv,
  getAugmentedEnvAsync,
  getStaticFallbackPaths,
  getCommonSearchPaths,
  combinePaths,
  resolveLoginShellPath,
  getLoginShellPath,
  _resetShellPathCacheForTest,
  clearLoginShellPathCache,
  resolveExecutable,
  isExecutable,
} from "../src/mcp/upstream/host";

describe("HostProcessManager and PATH Resolution", () => {
  beforeEach(() => {
    _resetShellPathCacheForTest();
  });

  test("getStaticFallbackPaths includes Python, uv, astral, pyenv, bun, and cargo dirs", () => {
    const fallbackPaths = getStaticFallbackPaths();
    const home = os.homedir();

    expect(fallbackPaths).toContain(path.join(home, ".cargo", "bin"));
    expect(fallbackPaths).toContain(path.join(home, ".local", "bin"));
    expect(fallbackPaths).toContain(path.join(home, ".astral", "bin"));
    expect(fallbackPaths).toContain(path.join(home, ".local", "share", "uv", "bin"));
    expect(fallbackPaths).toContain(path.join(home, ".uv", "bin"));
    expect(fallbackPaths).toContain(path.join(home, ".pyenv", "shims"));
    expect(fallbackPaths).toContain(path.join(home, ".rye", "shims"));
    expect(fallbackPaths).toContain(path.join(home, ".volta", "bin"));
    expect(fallbackPaths).toContain(path.join(home, ".bun", "bin"));
    expect(fallbackPaths).toContain(path.join(home, "Library", "Python", "3.12", "bin"));
  });

  test("getCommonSearchPaths returns common directories for toolchains", () => {
    const paths = getCommonSearchPaths();
    expect(paths).toBeArray();
    expect(paths.length).toBeGreaterThan(5);

    const home = os.homedir();
    // Verify common version manager paths exist in list
    expect(paths).toContain("/opt/homebrew/bin");
    expect(paths).toContain("/usr/bin");
    expect(paths).toContain(path.join(home, ".local", "share", "mise", "shims"));
    expect(paths).toContain(path.join(home, ".bun", "bin"));
    expect(paths).toContain(path.join(home, ".cargo", "bin"));
    expect(paths).toContain(path.join(home, ".volta", "bin"));
  });

  test("combinePaths merges and deduplicates paths preserving order", () => {
    const merged = combinePaths([
      "/custom/bin",
      "/opt/homebrew/bin:/usr/bin",
      "/custom/bin:/usr/local/bin:/usr/bin",
    ]);

    expect(merged).toBe("/custom/bin:/opt/homebrew/bin:/usr/bin:/usr/local/bin");
  });

  test("getLoginShellPath returns non-empty PATH on Unix", () => {
    clearLoginShellPathCache();
    const shellPath = getLoginShellPath();
    if (process.platform !== "win32") {
      expect(typeof shellPath).toBe("string");
      expect(shellPath.length).toBeGreaterThan(0);
      expect(shellPath).toContain("/usr/bin");
    }
  });

  test("resolveLoginShellPath executes login shell and caches result across concurrent calls", async () => {
    const [path1, path2] = await Promise.all([
      resolveLoginShellPath(2000),
      resolveLoginShellPath(2000),
    ]);

    if (process.platform !== "win32") {
      expect(path1).toBeDefined();
      expect(typeof path1).toBe("string");
      expect(path1).toBe(path2);
    }
  });

  test("getAugmentedEnv includes common binary directories in PATH synchronously", () => {
    const env = getAugmentedEnv({ CUSTOM_VAR: "test_val" });
    expect(env.CUSTOM_VAR).toBe("test_val");
    expect(env.PATH).toBeDefined();
    expect(env.PATH).toContain("/opt/homebrew/bin");
    expect(env.PATH).toContain("/usr/bin");
    expect(env.PATH).toContain(".local/bin");
    expect(env.PATH).toContain(".cargo/bin");
    expect(env.PATH).toContain("mise");
  });

  test("getAugmentedEnvAsync resolves dynamic shell path and merges custom env", async () => {
    const env = await getAugmentedEnvAsync({ MY_TEST_FLAG: "true" });
    expect(env.MY_TEST_FLAG).toBe("true");
    expect(env.PATH).toBeDefined();
    expect(env.PATH).toContain("/usr/bin");
  });

  test("isExecutable correctly identifies executable files", () => {
    expect(isExecutable("/bin/sh")).toBe(true);
    expect(isExecutable("/non/existent/path/for/sure")).toBe(false);
  });

  test("resolveExecutable resolves standard executables to absolute paths", () => {
    const resolvedSh = resolveExecutable("sh");
    expect(path.isAbsolute(resolvedSh)).toBe(true);
    expect(resolvedSh).toMatch(/sh$/);

    const resolvedNonExistent = resolveExecutable("definitely-not-a-real-executable-xyz123");
    expect(resolvedNonExistent).toBe("definitely-not-a-real-executable-xyz123");
  });

  test("resolves and augments PATH in simulated stripped GUI environment", () => {
    const strippedEnv = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" };
    const augmented = getAugmentedEnv(strippedEnv);

    expect(augmented.PATH).toContain("/usr/bin");
    expect(augmented.PATH.length).toBeGreaterThan(strippedEnv.PATH.length);

    const resolvedNode = resolveExecutable("node", augmented);
    expect(path.isAbsolute(resolvedNode)).toBe(true);
  });

  test("spawns a host process and receives stdio output in stripped GUI environment", async () => {
    const conn = await hostProcessManager.spawnHostProcess("test-server-gui-sim", {
      command: "node",
      args: ["-e", "console.log('hello from stripped env')"],
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    });

    const output = await new Promise<string>((resolve) => {
      conn.readable.on("data", (chunk: Buffer) => {
        resolve(chunk.toString().trim());
      });
    });

    expect(output).toBe("hello from stripped env");
    await conn.stop();
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
      expect(err.message).toContain("Host command 'invalid-non-existent-command-12345' not found on PATH");
    }
  });
});
