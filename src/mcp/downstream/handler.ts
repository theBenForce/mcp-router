import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { downstreamAuthMiddleware } from "./auth_middleware";
import { filterEngine } from "./filter";
import { upstreamManager } from "../upstream/manager";
import { auditService } from "../../services/audit.service";

const app = new Hono();

// Apply Auth Middleware to all downstream MCP proxy endpoints
app.use("*", downstreamAuthMiddleware);

/**
 * Handle JSON-RPC request for MCP
 */
async function handleJsonRpc(apiKey: any, body: any) {
  const { id, method, params } = body;

  if (method === "tools/list") {
    const allowedTools = filterEngine.filterToolsList(apiKey.id);
    const mcpTools = allowedTools.map((t: any) => ({
      name: t.namespaced_name,
      description: t.description,
      inputSchema: JSON.parse(t.input_schema_json || "{}"),
    }));

    return {
      jsonrpc: "2.0",
      id,
      result: { tools: mcpTools },
    };
  }

  if (method === "tools/call") {
    const namespacedName = params?.name;
    const args = params?.arguments || {};
    const startTime = Date.now();

    try {
      const { serverId, originalToolName } = filterEngine.authorizeToolCall(
        apiKey.id,
        namespacedName
      );

      const result = await upstreamManager.callTool(serverId, originalToolName, args);
      const durationMs = Date.now() - startTime;

      auditService.logToolCall({
        apiKeyId: apiKey.id,
        serverId,
        toolName: namespacedName,
        status: "success",
        durationMs,
      });

      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isPermissionDenied = err.message?.includes("Permission denied");

      auditService.logToolCall({
        apiKeyId: apiKey.id,
        toolName: namespacedName || "unknown",
        status: isPermissionDenied ? "denied" : "error",
        durationMs,
        errorMessage: err.message,
      });

      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: isPermissionDenied ? -32001 : -32603,
          message: err.message,
        },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method '${method}' not supported by MCP Router`,
    },
  };
}

// 1. Streamable HTTP Endpoint (POST /mcp)
app.post("/mcp", async (c) => {
  const apiKey = c.get("apiKey");
  try {
    const body = await c.req.json();
    const response = await handleJsonRpc(apiKey, body);
    return c.json(response);
  } catch (err: any) {
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      400
    );
  }
});

// 2. Server-Sent Events Endpoint (GET /sse)
app.get("/sse", (c) => {
  const apiKey = c.get("apiKey");
  return streamSSE(c, async (stream) => {
    // Send initial endpoint connection event
    await stream.writeSSE({
      event: "endpoint",
      data: "/mcp",
    });

    stream.onAbort(() => {
      console.log(`[SSE] Client with key ${apiKey.name} disconnected`);
    });
  });
});

export default app;
