import Docker from "dockerode";
import net from "node:net";
import { PassThrough, Readable, Writable } from "node:stream";

export interface StdioConfig {
  image?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  volumes?: string[];
  name?: string;
}

export interface SidecarConnection {
  container: Docker.Container;
  readable: Readable;
  writable: Writable;
  stop: () => Promise<void>;
}

/**
 * Sanitizes a raw string into a valid, Docker-compliant container name substring.
 * Allowed characters in Docker container names: [a-zA-Z0-9_.-]
 */
export function sanitizeContainerName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "sidecar";
}

/**
 * Generates a meaningful, unique Docker container name for a sidecar instance.
 * Format: mcp-sidecar-<sanitized-name>-<short-server-id>
 */
export function generateContainerName(
  serverId: string,
  config: StdioConfig,
  serverName?: string
): string {
  let rawName = config.name;

  if (!rawName && serverName) {
    rawName = serverName;
  }

  if (!rawName && config.image) {
    const parts = config.image.split("/");
    const basename = parts[parts.length - 1];
    rawName = basename.split(":")[0].split("@")[0].replace(/^mcp[-_]/, "");
  }

  if (!rawName && (config.command || (config.args && config.args.length > 0))) {
    const fullCmd = [config.command, ...(config.args || [])].filter(Boolean).join(" ");
    const match = fullCmd.match(/(?:@[\w-]+\/)?[\w-]+(?:-server|-mcp)?/g);
    if (match && match.length > 0) {
      const lastMatch = match[match.length - 1];
      rawName = lastMatch
        .replace(/^@[\w-]+\//, "")
        .replace(/^mcp[-_]/, "")
        .replace(/^server[-_]/, "");
    }
  }

  if (!rawName) {
    rawName = "sidecar";
  }

  const sanitized = sanitizeContainerName(rawName);
  const shortId = serverId.includes("-") ? serverId.split("-")[0] : serverId.substring(0, 8);
  return `mcp-sidecar-${sanitized}-${shortId}`;
}

export class SidecarManager {
  private docker: Docker;
  private socketPath: string;
  private activeContainers: Map<string, Docker.Container> = new Map();

  constructor(socketPath: string = "/var/run/docker.sock") {
    this.docker = new Docker({ socketPath });
    this.socketPath = socketPath;
  }

  /**
   * Attach to a running container's stdio using a raw TCP socket upgrade.
   * This bypasses Dockerode's hijack which hangs in Docker-in-Docker (DinD)
   * environments and Bun's broken HTTP upgrade event handling.
   */
  private attachRawStream(
    containerId: string
  ): Promise<{ socket: net.Socket; readable: Readable; writable: Writable }> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      const reqStr =
        `POST /containers/${containerId}/attach?stream=1&stdin=1&stdout=1&stderr=1 HTTP/1.1\r\n` +
        `Host: localhost\r\n` +
        `Content-Type: application/vnd.docker.raw-stream\r\n` +
        `Upgrade: tcp\r\n` +
        `Connection: Upgrade\r\n\r\n`;

      let headersDone = false;
      let buf = Buffer.alloc(0);

      const readable = new PassThrough();
      const stderrStream = new PassThrough();
      const writable = new PassThrough();

      stderrStream.on("data", (chunk: Buffer) => {
        console.error(`[Sidecar ${containerId.substring(0, 12)} stderr]:`, chunk.toString().trim());
      });

      socket.on("data", (chunk: Buffer) => {
        if (!headersDone) {
          buf = Buffer.concat([buf, chunk]);
          const idx = buf.indexOf("\r\n\r\n");
          if (idx !== -1) {
            const statusLine = buf.slice(0, idx).toString().split("\r\n")[0];
            headersDone = true;
            const remaining = buf.slice(idx + 4);

            if (!statusLine.includes("101")) {
              reject(new Error(`Docker attach failed: ${statusLine}`));
              socket.destroy();
              return;
            }

            // Set up demux for remaining data and future data
            this.docker.modem.demuxStream(socket, readable, stderrStream);
            if (remaining.length > 0) {
              socket.unshift(remaining);
            }

            // Pipe writable to socket for stdin
            writable.pipe(socket, { end: false });

            resolve({ socket, readable, writable });
          }
        }
      });

      socket.on("error", (err) => {
        if (!headersDone) reject(err);
      });

      socket.write(reqStr);
    });
  }

  /**
   * Spawns a sidecar container for an upstream stdio MCP server
   */
  async spawnSidecar(
    serverId: string,
    config: StdioConfig,
    serverName?: string
  ): Promise<SidecarConnection> {
    // Determine the Docker image to use
    let image: string;
    if (config.image) {
      image = config.image;
    } else if (config.command) {
      const isPython =
        config.command.includes("python") ||
        config.command.includes("pip") ||
        config.command.includes("uv");
      image = isPython ? "python:3.12-slim" : "node:22-alpine";
    } else {
      throw new Error("Either image or command must be specified");
    }

    // Build the container command: only pass Cmd when explicit command/args are provided
    // Otherwise, omit Cmd so Docker uses the image's ENTRYPOINT/CMD
    const cmd = config.command
      ? [config.command, ...(config.args || [])]
      : undefined;

    const env = config.env
      ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`)
      : [];

    // Parse volume binds (e.g. ["/host/path:/container/path"])
    const binds = config.volumes || [];

    // Pull image if not already present locally
    try {
      await this.docker.getImage(image).inspect();
    } catch {
      console.log(`[Sidecar] Pulling image ${image}...`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: Error | null, stream: Readable) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (pullErr) => {
            if (pullErr) reject(pullErr);
            else resolve();
          });
        });
      });
    }

    const containerName = generateContainerName(serverId, config, serverName);

    // Create sidecar container with meaningful container name
    const containerOpts: Docker.ContainerCreateOptions & { name?: string } = {
      name: containerName,
      Image: image,
      Env: env,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      HostConfig: {
        AutoRemove: true,
        Memory: 512 * 1024 * 1024, // 512MB limit
        ExtraHosts: ["host.docker.internal:host-gateway"],
        Binds: binds.length > 0 ? binds : undefined,
      },
    };

    // Only set Cmd when we have an explicit command to run
    if (cmd) {
      containerOpts.Cmd = cmd;
    }

    let container: Docker.Container;
    try {
      container = await this.docker.createContainer(containerOpts);
    } catch (err: any) {
      if (err?.statusCode === 409 || (err?.message && String(err.message).includes("already in use"))) {
        try {
          const existing = this.docker.getContainer(containerName);
          await existing.remove({ force: true });
        } catch {
          // ignore error if container was already cleaned up
        }
        containerOpts.name = `${containerName}-${Math.random().toString(36).substring(2, 6)}`;
        container = await this.docker.createContainer(containerOpts);
      } else {
        throw err;
      }
    }

    this.activeContainers.set(serverId, container);

    // Start the container first, then attach via raw TCP socket.
    // This avoids Dockerode's hijack mode which hangs in DinD environments
    // and works around Bun's lack of HTTP upgrade event support.
    await container.start();

    const { socket: rawSocket, readable, writable } = await this.attachRawStream(container.id);

    const stop = async () => {
      try {
        rawSocket.destroy();
        await container.stop({ t: 5 });
      } catch (err) {
        // Container might have auto-removed already
      } finally {
        this.activeContainers.delete(serverId);
      }
    };

    container.wait().then(() => {
      this.activeContainers.delete(serverId);
    });

    return {
      container,
      readable,
      writable,
      stop,
    };
  }

  async stopSidecar(serverId: string): Promise<void> {
    const container = this.activeContainers.get(serverId);
    if (container) {
      try {
        await container.stop({ t: 5 });
      } catch {
        // Ignore if already stopped
      } finally {
        this.activeContainers.delete(serverId);
      }
    }
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.activeContainers.keys()).map((id) =>
      this.stopSidecar(id)
    );
    await Promise.all(stopPromises);
  }
}

export const sidecarManager = new SidecarManager();
