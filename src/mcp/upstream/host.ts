import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { serverLogStore } from "./logger";

export interface HostProcessConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HostProcessConnection {
  process: ChildProcess;
  readable: Readable;
  writable: Writable;
  getStderr: () => string;
  stop: () => Promise<void>;
}

let cachedLoginShellPath: string | null = null;
let inFlightLoginShellPromise: Promise<string | null> | null = null;

/**
 * Resets the in-memory shell path cache (for unit testing isolation).
 */
export function _resetShellPathCacheForTest(): void {
  cachedLoginShellPath = null;
  inFlightLoginShellPromise = null;
}

/**
 * Common directories where Node.js, Python, uv, uvx, Bun, Pyenv, Cargo, and Homebrew binaries reside.
 */
export function getStaticFallbackPaths(): string[] {
  const home = os.homedir();
  const paths = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    path.join(home, ".cargo", "bin"),
    path.join(home, ".local", "bin"),
    path.join(home, ".astral", "bin"),
    path.join(home, ".local", "share", "uv", "bin"),
    path.join(home, ".uv", "bin"),
    path.join(home, ".pyenv", "shims"),
    path.join(home, ".pyenv", "bin"),
    path.join(home, ".rye", "shims"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".nvm", "versions", "node", "current", "bin"),
    path.join(home, "Library", "Python", "3.13", "bin"),
    path.join(home, "Library", "Python", "3.12", "bin"),
    path.join(home, "Library", "Python", "3.11", "bin"),
    path.join(home, "Library", "Python", "3.10", "bin"),
    path.join(home, "Library", "Python", "3.9", "bin"),
    path.join(home, "Library", "Python", "3.8", "bin"),
  ];

  if (process.platform === "win32") {
    paths.push(
      path.join(home, "AppData", "Local", "uv", "bin"),
      path.join(home, "AppData", "Local", "Programs", "Python", "Python312", "Scripts"),
      path.join(home, "AppData", "Roaming", "Python", "Python312", "Scripts")
    );
  }

  return paths;
}

/**
 * Determines the default interactive login shell to execute.
 */
function getDefaultShell(): string {
  if (process.platform === "win32") return "";
  if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
    return process.env.SHELL;
  }
  if (process.platform === "darwin") {
    if (fs.existsSync("/bin/zsh")) return "/bin/zsh";
    if (fs.existsSync("/bin/bash")) return "/bin/bash";
  }
  if (fs.existsSync("/bin/bash")) return "/bin/bash";
  return "/bin/sh";
}

/**
 * Combines multiple PATH strings or arrays into a single deduplicated PATH string.
 */
export function combinePaths(sources: (string | undefined | null)[]): string {
  const segments: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    for (const part of src.split(path.delimiter)) {
      const trimmed = part.trim();
      if (trimmed && !segments.includes(trimmed)) {
        segments.push(trimmed);
      }
    }
  }
  return segments.join(path.delimiter);
}

/**
 * Dynamically resolves the user's interactive login shell PATH (e.g. from .zshrc, .bashrc).
 * Uses single-flight Promise memoization to deduplicate concurrent calls.
 */
export async function resolveLoginShellPath(timeoutMs = 1500): Promise<string | null> {
  if (process.platform === "win32") {
    return process.env.PATH || process.env.Path || null;
  }
  if (cachedLoginShellPath !== null) {
    return cachedLoginShellPath;
  }
  if (inFlightLoginShellPromise) {
    return inFlightLoginShellPromise;
  }

  inFlightLoginShellPromise = (async () => {
    const shell = getDefaultShell();
    if (!shell) return null;

    return new Promise<string | null>((resolve) => {
      let settled = false;
      let outputBuffer = "";

      // Run env command in login interactive mode (-l -i -c) to source rc files
      const shellArgs = shell.endsWith("sh") || shell.endsWith("bash") || shell.endsWith("zsh") || shell.endsWith("fish")
        ? ["-l", "-i", "-c", "/usr/bin/env || printenv || env"]
        : ["-l", "-c", "env"];

      let proc: ChildProcess;
      try {
        proc = spawn(shell, shellArgs, {
          stdio: ["ignore", "pipe", "ignore"],
          detached: process.platform !== "win32",
          env: {
            ...process.env,
            CI: "1",
            TERM: "dumb",
            PAGER: "cat",
            GIT_TERMINAL_PROMPT: "0",
          },
        });
      } catch {
        resolve(null);
        return;
      }

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            if (proc.pid && process.platform !== "win32") {
              process.kill(-proc.pid, "SIGKILL");
            } else if (proc.pid) {
              proc.kill("SIGKILL");
            }
          } catch {}
          resolve(null);
        }
      }, timeoutMs);

      proc.stdout?.on("data", (chunk: Buffer) => {
        outputBuffer += chunk.toString("utf8");
      });

      proc.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });

      proc.on("close", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const match = outputBuffer.match(/^PATH=(.+)$/m);
          if (match && match[1]?.trim()) {
            const resolved = match[1].trim();
            cachedLoginShellPath = resolved;
            resolve(resolved);
            return;
          }
          resolve(null);
        }
      });
    });
  })().finally(() => {
    inFlightLoginShellPromise = null;
  });

  return inFlightLoginShellPromise;
}

/**
 * Augments process.env.PATH with cached login shell PATH and common fallback directories.
 */
export function getAugmentedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const commonFallback = getStaticFallbackPaths().join(path.delimiter);
  const combinedPath = combinePaths([
    customEnv?.PATH || customEnv?.Path,
    cachedLoginShellPath,
    process.env.PATH || process.env.Path,
    commonFallback,
  ]);

  return {
    ...process.env,
    PATH: combinedPath,
    ...customEnv,
  };
}

/**
 * Dynamically resolves the user's login shell PATH asynchronously, then returns the augmented environment.
 */
export async function getAugmentedEnvAsync(
  customEnv?: Record<string, string>
): Promise<Record<string, string>> {
  await resolveLoginShellPath();
  return getAugmentedEnv(customEnv);
}

export class HostProcessManager {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  async spawnHostProcess(
    serverId: string,
    config: HostProcessConfig
  ): Promise<HostProcessConnection> {
    const command = config.command;
    if (!command) {
      throw new Error("Command must be specified for host process execution");
    }

    const args = config.args || [];
    const env = await getAugmentedEnvAsync(config.env);

    const spawnMsg = `Spawning host process: ${command} ${args.join(" ")}`;
    console.log(`[HostProcessManager] ${spawnMsg} for ${serverId}`);
    serverLogStore.addLog(serverId, "info", `[HostProcess] ${spawnMsg}`);

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const stderrBuffer: string[] = [];

      // Spawn as process group leader (detached: true on Unix/macOS) for tree-killing
      const proc = spawn(command, args, {
        env,
        cwd: config.cwd || process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });

      this.activeProcesses.set(serverId, proc);

      // Trapping spawn errors (e.g. ENOENT command not found) immediately
      proc.on("error", (err: any) => {
        let msg = err.message || String(err);
        if (err.code === "ENOENT") {
          msg = `Host command '${command}' not found on PATH. Please ensure '${command}' (Node.js/uv/Bun) is installed or switch execution mode to Docker sidecar.`;
        }
        console.error(`[HostProcessManager] Spawn error for ${serverId}:`, msg);
        serverLogStore.addLog(serverId, "error", `[HostProcess Error] ${msg}`);
        this.activeProcesses.delete(serverId);
        if (!isSettled) {
          isSettled = true;
          reject(new Error(msg));
        }
      });

      if (!proc.stdout || !proc.stdin) {
        const err = new Error(`Failed to initialize stdio pipes for host process: ${command}`);
        serverLogStore.addLog(serverId, "error", `[HostProcess Error] ${err.message}`);
        this.activeProcesses.delete(serverId);
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
        return;
      }

      if (proc.stderr) {
        proc.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString().trim();
          if (text) {
            console.error(`[HostProcess ${serverId.substring(0, 8)} stderr]:`, text);
            stderrBuffer.push(text);
            if (stderrBuffer.length > 50) stderrBuffer.shift();
            serverLogStore.addLog(serverId, "stderr", text);
          }
        });
      }

      const stop = async (): Promise<void> => {
        try {
          if (proc.pid && !proc.killed) {
            serverLogStore.addLog(serverId, "info", `[HostProcess] Stopping host process (PID: ${proc.pid})`);
            if (process.platform !== "win32") {
              // Kill entire process group tree (negative PID)
              try {
                process.kill(-proc.pid, "SIGTERM");
              } catch {
                proc.kill("SIGTERM");
              }

              setTimeout(() => {
                try {
                  if (proc.pid && !proc.killed) {
                    process.kill(-proc.pid, "SIGKILL");
                  }
                } catch {
                  // Ignore if already dead
                }
              }, 1500);
            } else {
              proc.kill("SIGTERM");
            }
          }
        } catch (err) {
          // Process might have exited already
        } finally {
          this.activeProcesses.delete(serverId);
        }
      };

      proc.on("exit", (code, signal) => {
        const exitMsg = `Process exited with code ${code}, signal ${signal}`;
        console.log(`[HostProcess ${serverId.substring(0, 8)}] ${exitMsg}`);
        serverLogStore.addLog(serverId, code === 0 ? "info" : "error", `[HostProcess] ${exitMsg}`);
        this.activeProcesses.delete(serverId);
      });

      if (!isSettled) {
        isSettled = true;
        resolve({
          process: proc,
          readable: proc.stdout,
          writable: proc.stdin,
          getStderr: () => stderrBuffer.join("\n"),
          stop,
        });
      }
    });
  }

  async stopHostProcess(serverId: string): Promise<void> {
    const proc = this.activeProcesses.get(serverId);
    if (proc) {
      try {
        if (proc.pid && process.platform !== "win32") {
          process.kill(-proc.pid, "SIGTERM");
        } else {
          proc.kill("SIGTERM");
        }
      } catch {
        // Ignore
      } finally {
        this.activeProcesses.delete(serverId);
      }
    }
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.activeProcesses.keys());
    await Promise.all(ids.map((id) => this.stopHostProcess(id)));
  }
}

export const hostProcessManager = new HostProcessManager();
