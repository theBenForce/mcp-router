import Docker from "dockerode";
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
  private activeContainers: Map<string, Docker.Container> = new Map();

  constructor(socketPath: string = "/var/run/docker.sock") {
    this.docker = new Docker({ socketPath });
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

    // Attach to raw stdio stream before starting
    const rawStream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    });

    const readable = new PassThrough();
    const stderrStream = new PassThrough();
    const writable = new PassThrough();

    // Demux multiplexed Docker output (stdout / stderr)
    this.docker.modem.demuxStream(rawStream, readable, stderrStream);

    // Pipe input writable stream directly to Docker raw stdin stream
    writable.pipe(rawStream);

    stderrStream.on("data", (chunk: Buffer) => {
      console.error(`[Sidecar ${serverId} stderr]:`, chunk.toString().trim());
    });

    await container.start();

    const stop = async () => {
      try {
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
