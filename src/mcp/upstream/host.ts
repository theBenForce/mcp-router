import { spawn, execFileSync, type ChildProcess } from "node:child_process";
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

export function clearLoginShellPathCache(): void {
  _resetShellPathCacheForTest();
}

/**
 * Gets the user's default shell path.
 */
export function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
}

function getSubdirectories(baseDir: string): string[] {
  try {
    if (!fs.existsSync(baseDir)) return [];
    return fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch {
    return [];
  }
}

/**
 * Discovers common and toolchain-specific search paths across macOS, Linux, and Windows.
 */
export function getCommonSearchPaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  // Homebrew & MacPorts (macOS / Linux)
  paths.push(
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/opt/local/bin",
    "/opt/local/sbin"
  );

  // Standard System Paths
  paths.push(
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  );

  // Nix Paths
  paths.push(
    path.join(home, ".nix-profile", "bin"),
    "/nix/var/nix/profiles/default/bin",
    "/run/current-system/sw/bin"
  );

  // Mise / rtx paths
  paths.push(
    path.join(home, ".local", "share", "mise", "shims"),
    path.join(home, ".local", "share", "mise", "bin"),
    path.join(home, ".config", "mise", "shims")
  );

  // Dynamic Mise tool installations (node, bun, python, uv, etc.)
  const miseInstallsNode = path.join(home, ".local", "share", "mise", "installs", "node");
  for (const version of getSubdirectories(miseInstallsNode).reverse()) {
    paths.push(path.join(miseInstallsNode, version, "bin"));
  }
  const miseInstallsBun = path.join(home, ".local", "share", "mise", "installs", "bun");
  for (const version of getSubdirectories(miseInstallsBun).reverse()) {
    paths.push(path.join(miseInstallsBun, version, "bin"));
  }
  const miseInstallsPython = path.join(home, ".local", "share", "mise", "installs", "python");
  for (const version of getSubdirectories(miseInstallsPython).reverse()) {
    paths.push(path.join(miseInstallsPython, version, "bin"));
  }
  const miseInstallsUv = path.join(home, ".local", "share", "mise", "installs", "uv");
  for (const version of getSubdirectories(miseInstallsUv).reverse()) {
    paths.push(path.join(miseInstallsUv, version, "bin"));
  }

  // FNM (Fast Node Manager)
  paths.push(
    path.join(home, "Library", "Application Support", "fnm", "current", "bin"),
    path.join(home, ".local", "share", "fnm", "current", "bin"),
    path.join(home, ".fnm", "current", "bin")
  );
  const fnmVersionsMac = path.join(home, "Library", "Application Support", "fnm", "node-versions");
  for (const version of getSubdirectories(fnmVersionsMac).reverse()) {
    paths.push(path.join(fnmVersionsMac, version, "installation", "bin"));
  }
  const fnmVersionsLinux = path.join(home, ".local", "share", "fnm", "node-versions");
  for (const version of getSubdirectories(fnmVersionsLinux).reverse()) {
    paths.push(path.join(fnmVersionsLinux, version, "installation", "bin"));
  }

  // NVM (Node Version Manager)
  paths.push(path.join(home, ".nvm", "versions", "node", "current", "bin"));
  const nvmVersionsDir = path.join(home, ".nvm", "versions", "node");
  for (const version of getSubdirectories(nvmVersionsDir).reverse()) {
    paths.push(path.join(nvmVersionsDir, version, "bin"));
  }

  // ASDF
  paths.push(
    path.join(home, ".asdf", "shims"),
    path.join(home, ".asdf", "bin")
  );
  const asdfNodeDir = path.join(home, ".asdf", "installs", "nodejs");
  for (const version of getSubdirectories(asdfNodeDir).reverse()) {
    paths.push(path.join(asdfNodeDir, version, "bin"));
  }

  // Volta, Pyenv, Rye
  paths.push(
    path.join(home, ".volta", "bin"),
    path.join(home, ".pyenv", "shims"),
    path.join(home, ".pyenv", "bin"),
    path.join(home, ".rye", "shims"),
    path.join(home, ".rye", "bin")
  );

  // Bun & Cargo & Local Binaries & Astral/uv
  paths.push(
    path.join(home, ".bun", "bin"),
    path.join(home, ".cargo", "bin"),
    path.join(home, ".local", "bin"),
    path.join(home, ".astral", "bin"),
    path.join(home, ".local", "share", "uv", "bin"),
    path.join(home, ".uv", "bin")
  );

  // macOS Python framework/user paths
  paths.push(
    path.join(home, "Library", "Python", "3.12", "bin"),
    path.join(home, "Library", "Python", "3.11", "bin"),
    path.join(home, "Library", "Python", "3.10", "bin")
  );
  const pythonMacUser = path.join(home, "Library", "Python");
  for (const pyVer of getSubdirectories(pythonMacUser).reverse()) {
    paths.push(path.join(pythonMacUser, pyVer, "bin"));
  }

  // PNPM & Yarn & Pkgx
  paths.push(
    path.join(home, "Library", "pnpm"),
    path.join(home, ".local", "share", "pnpm"),
    path.join(home, ".pnpm"),
    path.join(home, ".yarn", "bin"),
    path.join(home, ".config", "yarn", "global", "node_modules", ".bin"),
    path.join(home, ".pkgx", "bin")
  );

  // Go
  paths.push(
    path.join(home, "go", "bin"),
    "/usr/local/go/bin"
  );

  // Containers & Desktop tools
  paths.push(
    path.join(home, ".orbstack", "bin"),
    path.join(home, ".docker", "bin"),
    "/Applications/Docker.app/Contents/Resources/bin"
  );

  // Windows specific paths
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    paths.push(
      path.join(appData, "npm"),
      path.join(localAppData, "Programs", "node"),
      path.join(localAppData, "fnm", "current"),
      path.join(localAppData, "pnpm"),
      path.join(localAppData, "Microsoft", "WinGet", "Links"),
      path.join(programFiles, "nodejs"),
      path.join(programFilesX86, "nodejs")
    );
  }

  return paths;
}

export function getStaticFallbackPaths(): string[] {
  return getCommonSearchPaths();
}

/**
 * Synchronously extracts PATH from user's login shell on macOS / Linux.
 */
export function getLoginShellPath(): string {
  if (cachedLoginShellPath !== null) {
    return cachedLoginShellPath;
  }

  if (process.platform === "win32") {
    cachedLoginShellPath = process.env.PATH || process.env.Path || "";
    return cachedLoginShellPath;
  }

  try {
    const shell = getDefaultShell();
    const output = execFileSync(shell, ["-l", "-c", "printf '%s' \"$PATH\""], {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    cachedLoginShellPath = (output || "").trim();
  } catch {
    cachedLoginShellPath = "";
  }

  return cachedLoginShellPath;
}

/**
 * Asynchronously extracts PATH from user's login shell on macOS / Linux.
 */
export async function resolveLoginShellPath(timeoutMs = 2000): Promise<string | null> {
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

      const shellArgs = ["-l", "-c", "printf '%s' \"$PATH\""];

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
          const resolved = outputBuffer.trim();
          if (resolved) {
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
 * Combines an array of path strings or arrays into a deduplicated PATH string.
 */
export function combinePaths(sources: (string | null | undefined | string[])[]): string {
  const seen = new Set<string>();
  const validPaths: string[] = [];

  for (const source of sources) {
    if (!source) continue;
    const parts = Array.isArray(source) ? source : source.split(path.delimiter);
    for (const p of parts) {
      if (!p) continue;
      const normalized = path.normalize(p.trim());
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        validPaths.push(normalized);
      }
    }
  }

  return validPaths.join(path.delimiter);
}

/**
 * Augments process.env.PATH with common execution paths on macOS/Linux GUI environments
 * and version manager locations (Homebrew, Mise, FNM, NVM, Volta, ASDF, Bun, Cargo, Pipx, PNPM).
 */
export function getAugmentedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const commonPaths = getCommonSearchPaths();
  const loginShellPath = cachedLoginShellPath || getLoginShellPath();
  const existingPath = process.env.PATH || process.env.Path || "";
  const customPath = customEnv?.PATH || customEnv?.Path || "";

  const combinedPath = combinePaths([
    customPath,
    loginShellPath,
    commonPaths,
    existingPath,
  ]);

  return {
    ...process.env,
    ...customEnv,
    PATH: combinedPath,
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

/**
 * Checks whether a given file path exists and is executable.
 */
export function isExecutable(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return false;
    if (process.platform === "win32") {
      return true;
    }
    // On Unix, check if executable bit is set
    return (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Resolves a command (e.g. 'npx', 'node', 'uv') to its absolute path by searching the augmented PATH.
 */
export function resolveExecutable(command: string, env?: Record<string, string>): string {
  if (!command || typeof command !== "string") {
    return command;
  }

  const trimmed = command.trim();
  if (!trimmed) return trimmed;

  // If already an absolute path or relative path containing separators
  if (trimmed.includes(path.sep) || (process.platform === "win32" && trimmed.includes("/"))) {
    if (path.isAbsolute(trimmed)) {
      if (isExecutable(trimmed)) return trimmed;
    }
    return trimmed;
  }

  const effectiveEnv = env || getAugmentedEnv();
  const searchPath = effectiveEnv.PATH || "";
  const searchDirs = searchPath.split(path.delimiter).filter(Boolean);

  const extensions = process.platform === "win32" ? ["", ".cmd", ".bat", ".exe", ".ps1"] : [""];

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${trimmed}${ext}`);
      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return trimmed;
}

export class HostProcessManager {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  async spawnHostProcess(
    serverId: string,
    config: HostProcessConfig
  ): Promise<HostProcessConnection> {
    const rawCommand = config.command;
    if (!rawCommand) {
      throw new Error("Command must be specified for host process execution");
    }

    const args = config.args || [];
    const env = await getAugmentedEnvAsync(config.env);
    const command = resolveExecutable(rawCommand, env);

    const spawnMsg = `Spawning host process: ${command} ${args.join(" ")}${command !== rawCommand ? ` (resolved from '${rawCommand}')` : ""}`;
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
        if (err.code === "ENOENT" || msg.includes("Executable not found in $PATH") || msg.includes("not found")) {
          msg = `Host command '${rawCommand}' not found on PATH. Please ensure '${rawCommand}' (Node.js/uv/Bun) is installed or switch execution mode to Docker sidecar.`;
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
        const err = new Error(`Failed to initialize stdio pipes for host process: ${rawCommand}`);
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
        } catch {
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

      proc.on("spawn", () => {
        if (!isSettled) {
          isSettled = true;
          resolve({
            process: proc,
            readable: proc.stdout!,
            writable: proc.stdin!,
            getStderr: () => stderrBuffer.join("\n"),
            stop,
          });
        }
      });
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
