import { EventEmitter } from "node:events";
import type { ServerLogEntry } from "./logger";

export interface ServerStatusEvent {
  serverId: string;
  status: "disconnected" | "connecting" | "connected" | "need_auth" | "error";
  lastError?: string | null;
  server?: any;
}

export class ServerEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(500);
  }

  emitStatus(event: ServerStatusEvent) {
    this.emit("server_status", event);
  }

  emitLog(entry: ServerLogEntry) {
    this.emit("server_log", entry);
  }
}

export const serverEvents = new ServerEventBus();
