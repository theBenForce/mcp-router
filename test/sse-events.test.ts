import { describe, expect, test, afterAll } from "bun:test";
import app from "../src/index";
import { closeDb } from "../src/db";
import { serverEvents } from "../src/mcp/upstream/events";
import { serverLogStore } from "../src/mcp/upstream/logger";

describe("SSE Real-Time Events API (/api/servers/events)", () => {
  afterAll(() => {
    closeDb();
  });

  test("GET /api/servers/events returns 200 with text/event-stream headers", async () => {
    const res = await app.fetch(new Request("http://localhost/api/servers/events"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  test("receives server_status event on status broadcast", async () => {
    const res = await app.fetch(new Request("http://localhost/api/servers/events"));
    const reader = res.body!.getReader();

    const testServerId = crypto.randomUUID();
    setTimeout(() => {
      serverEvents.emitStatus({ serverId: testServerId, status: "connected" });
    }, 50);

    let receivedStatus = false;
    const decoder = new TextDecoder();

    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes("event: server_status") && text.includes(testServerId)) {
        receivedStatus = true;
        break;
      }
    }

    await reader.cancel();
    expect(receivedStatus).toBe(true);
  });

  test("receives server_log event on log store entry addition", async () => {
    const res = await app.fetch(new Request("http://localhost/api/servers/events"));
    const reader = res.body!.getReader();

    const testServerId = crypto.randomUUID();
    const logMsg = `Test SSE log entry ${crypto.randomUUID()}`;

    setTimeout(() => {
      serverLogStore.addLog(testServerId, "info", logMsg);
    }, 50);

    let receivedLog = false;
    const decoder = new TextDecoder();

    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes("event: server_log") && text.includes(logMsg)) {
        receivedLog = true;
        break;
      }
    }

    await reader.cancel();
    expect(receivedLog).toBe(true);
  });

  test("filters events by query param serverId", async () => {
    const targetServerId = crypto.randomUUID();
    const otherServerId = crypto.randomUUID();

    const res = await app.fetch(
      new Request(`http://localhost/api/servers/events?serverId=${targetServerId}`)
    );
    const reader = res.body!.getReader();

    setTimeout(() => {
      serverEvents.emitStatus({ serverId: otherServerId, status: "connected" });
      serverEvents.emitStatus({ serverId: targetServerId, status: "connected" });
    }, 50);

    let receivedTargetStatus = false;
    let receivedOtherStatus = false;
    const decoder = new TextDecoder();

    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes("event: server_status")) {
        if (text.includes(targetServerId)) receivedTargetStatus = true;
        if (text.includes(otherServerId)) receivedOtherStatus = true;
        if (receivedTargetStatus) break;
      }
    }

    await reader.cancel();
    expect(receivedTargetStatus).toBe(true);
    expect(receivedOtherStatus).toBe(false);
  });

  test("cleans up event listeners when stream reader is cancelled", async () => {
    const initialStatusListeners = serverEvents.listenerCount("server_status");
    const initialLogListeners = serverEvents.listenerCount("server_log");

    const res = await app.fetch(new Request("http://localhost/api/servers/events"));
    const reader = res.body!.getReader();
    // Read initial chunk or connect event to ensure stream handler initializes
    reader.read();
    await new Promise((r) => setTimeout(r, 10));

    expect(serverEvents.listenerCount("server_status")).toBe(initialStatusListeners + 1);
    expect(serverEvents.listenerCount("server_log")).toBe(initialLogListeners + 1);

    await reader.cancel();

    // Yield to allow onAbort callback to execute
    await new Promise((r) => setTimeout(r, 100));

    expect(serverEvents.listenerCount("server_status")).toBe(initialStatusListeners);
    expect(serverEvents.listenerCount("server_log")).toBe(initialLogListeners);
  });
});
