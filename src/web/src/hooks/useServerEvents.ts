import { useEffect, useRef } from "react";
import { getApiUrl } from "../lib/api";

export interface ServerStatusEventPayload {
  serverId: string;
  status: "disconnected" | "connecting" | "connected" | "need_auth" | "error";
  lastError?: string | null;
  server?: any;
}

export interface ServerLogEntryPayload {
  id: string;
  serverId: string;
  timestamp: string;
  level: "stdout" | "stderr" | "info" | "error";
  message: string;
}

export interface UseServerEventsOptions {
  serverId?: string;
  onStatusChange?: (event: ServerStatusEventPayload) => void;
  onLogReceived?: (log: ServerLogEntryPayload) => void;
  enabled?: boolean;
}

export function useServerEvents(options: UseServerEventsOptions = {}) {
  const { serverId, onStatusChange, onLogReceived, enabled = true } = options;

  const onStatusRef = useRef(onStatusChange);
  const onLogRef = useRef(onLogReceived);

  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onLogRef.current = onLogReceived;
  }, [onLogReceived]);

  useEffect(() => {
    if (!enabled) return;

    const path = serverId
      ? `/api/servers/events?serverId=${encodeURIComponent(serverId)}`
      : "/api/servers/events";
    const fullUrl = getApiUrl(path);

    const eventSource = new EventSource(fullUrl);

    eventSource.addEventListener("server_status", (e: MessageEvent) => {
      try {
        const data: ServerStatusEventPayload = JSON.parse(e.data);
        if (onStatusRef.current) {
          onStatusRef.current(data);
        }
      } catch (err) {
        console.error("[SSE] Failed to parse server_status payload:", err);
      }
    });

    eventSource.addEventListener("server_log", (e: MessageEvent) => {
      try {
        const data: ServerLogEntryPayload = JSON.parse(e.data);
        if (onLogRef.current) {
          onLogRef.current(data);
        }
      } catch (err) {
        console.error("[SSE] Failed to parse server_log payload:", err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [serverId, enabled]);
}
