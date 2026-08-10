import Docker from "dockerode";
import net from "node:net";
import { PassThrough, Readable, Writable } from "node:stream";

export interface StdioConfig {
  image?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  volumes?: string[];
}

export interface SidecarConnection {
  container: Docker.Container;
  readable: Readable;
  writable: Writable;
  stop: () => Promise<void>;
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
    config: StdioConfig
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

    // Create sidecar container
    const containerOpts: Docker.ContainerCreateOptions = {
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

    const container = await this.docker.createContainer(containerOpts);

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
