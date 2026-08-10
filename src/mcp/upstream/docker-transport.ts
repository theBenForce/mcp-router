import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Readable, Writable } from "node:stream";

export interface DockerTransportOptions {
  readable: Readable;
  writable: Writable;
  stop: () => Promise<void>;
}

export class DockerTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private readable: Readable;
  private writable: Writable;
  private stopFn: () => Promise<void>;
  private buffer: ReadBuffer;

  constructor(options: DockerTransportOptions) {
    this.readable = options.readable;
    this.writable = options.writable;
    this.stopFn = options.stop;
    this.buffer = new ReadBuffer();
  }

  async start(): Promise<void> {
    this.readable.on("data", (chunk: Buffer) => {
      this.buffer.append(chunk);
      try {
        let message: JSONRPCMessage | null;
        while ((message = this.buffer.readMessage()) !== null) {
          if (this.onmessage) {
            this.onmessage(message);
          }
        }
      } catch (err) {
        if (this.onerror) {
          this.onerror(err as Error);
        }
      }
    });

    this.readable.on("end", () => {
      this.close();
    });

    this.readable.on("error", (err: Error) => {
      if (this.onerror) {
        this.onerror(err);
      }
    });
  }

  async close(): Promise<void> {
    await this.stopFn();
    if (this.onclose) {
      this.onclose();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const serialized = serializeMessage(message);
      const flushed = this.writable.write(serialized, (err) => {
        if (err) {
          reject(err);
        }
      });
      if (!flushed) {
        this.writable.once('drain', resolve);
      } else {
        resolve();
      }
    });
  }
}
