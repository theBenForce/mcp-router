import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import path from "node:path";
import os from "node:os";

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
  stop: () => Promise<void>;
}

/**
 * Augments process.env.PATH with common execution paths on macOS/Linux GUI environments
 * where terminal environment variables (Homebrew, Cargo, NVM, Pipx, Bun) are omitted.
 */
export function getAugmentedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const home = os.homedir();
  const commonPaths = [
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
    path.join(home, ".bun", "bin"),
    path.join(home, ".nvm", "versions", "node", "current", "bin"),
  ];

  const existingPath = process.env.PATH || "";
  const combinedPath = Array.from(
    new Set([...commonPaths, ...existingPath.split(path.delimiter).filter(Boolean)])
  ).join(path.delimiter);

  return {
    ...process.env,
    PATH: combinedPath,
    ...customEnv,
  };
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
    const env = getAugmentedEnv(config.env);

    console.log(`[HostProcessManager] Spawning host process for ${serverId}: ${command} ${args.join(" ")}`);

    return new Promise((resolve, reject) => {
      let isSettled = false;

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
        this.activeProcesses.delete(serverId);
        if (!isSettled) {
          isSettled = true;
          reject(new Error(msg));
        }
      });

      if (!proc.stdout || !proc.stdin) {
        const err = new Error(`Failed to initialize stdio pipes for host process: ${command}`);
        this.activeProcesses.delete(serverId);
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
        return;
      }

      if (proc.stderr) {
        proc.stderr.on("data", (chunk: Buffer) => {
          console.error(`[HostProcess ${serverId.substring(0, 8)} stderr]:`, chunk.toString().trim());
        });
      }

      const stop = async (): Promise<void> => {
        try {
          if (proc.pid && !proc.killed) {
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
        console.log(`[HostProcess ${serverId.substring(0, 8)}] Process exited with code ${code}, signal ${signal}`);
        this.activeProcesses.delete(serverId);
      });

      if (!isSettled) {
        isSettled = true;
        resolve({
          process: proc,
          readable: proc.stdout,
          writable: proc.stdin,
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
