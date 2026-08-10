import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { downstreamAuthMiddleware } from "./auth_middleware";
import { filterEngine } from "./filter";
import { upstreamManager } from "../upstream/manager";
import { auditService } from "../../services/audit.service";
import { promptService } from "../../services/prompt.service";
import { serverService } from "../../services/server.service";

const app = new Hono();

// Apply Auth Middleware to all downstream MCP proxy routes
app.use("/mcp", downstreamAuthMiddleware);
app.use("/mcp/*", downstreamAuthMiddleware);
app.use("/sse", downstreamAuthMiddleware);
app.use("/sse/*", downstreamAuthMiddleware);

/**
 * Extract query parameters from request URL to preserve auth token in SSE endpoint events
 */
function getQueryString(c: any): string {
  const rawUrl = c.req.raw?.url || c.req.url || "";
  const qIdx = rawUrl.indexOf("?");
  if (qIdx !== -1) {
    return rawUrl.substring(qIdx);
  }
  const keyParam = c.req.query("key") || c.req.query("apiKey");
  return keyParam ? `?key=${keyParam}` : "";
}

/**
 * Handle JSON-RPC requests for MCP endpoints
 */
async function handleJsonRpc(apiKey: any, body: any, targetServerId?: string) {
  const { id, method, params } = body;

  // 1. Standard Protocol Ping (used by Zed, AGY, Cursor, etc. to check server liveness)
  if (method === "ping") {
    return {
      jsonrpc: "2.0",
      id,
      result: {},
    };
  }

  // 2. Standard Protocol Notifications (e.g. notifications/initialized)
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) {
    return {
      jsonrpc: "2.0",
      ...(id !== undefined ? { id } : {}),
      result: {},
    };
  }

  // ----------------------------------------------------
  // Dedicated Prompts Endpoint (/mcp/servers/prompts)
  // ----------------------------------------------------
  if (targetServerId === "prompts") {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { prompts: {} },
          serverInfo: { name: "mcp-router-prompts", version: "1.0.0" },
        },
      };
    }

    if (method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: [] } };
    }

    if (method === "prompts/list") {
      const allowedPrompts = filterEngine.filterPromptsList(apiKey.id);
      const mcpPrompts = allowedPrompts.map((p: any) => ({
        name: p.name,
        title: p.title || undefined,
        description: p.description || undefined,
        arguments: p.arguments.map((a: any) => ({
          name: a.name,
          description: a.description || undefined,
          required: a.required || undefined,
        })),
      }));

      return { jsonrpc: "2.0", id, result: { prompts: mcpPrompts } };
    }

    if (method === "prompts/get") {
      const promptName = params?.name;
      const args = params?.arguments || {};

      try {
        filterEngine.authorizePromptAccess(apiKey.id, promptName);
        const rendered = promptService.renderPrompt(promptName, args);
        return { jsonrpc: "2.0", id, result: rendered };
      } catch (err: any) {
        const isPermissionDenied = err.message?.includes("Permission denied");
        const isNotFoundOrMissingArg =
          err.message?.includes("not found") || err.message?.includes("Missing required argument");

        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: isPermissionDenied ? -32001 : isNotFoundOrMissingArg ? -32602 : -32603,
            message: err.message,
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method '${method}' not supported on prompts endpoint` },
    };
  }

  // ----------------------------------------------------
  // Per-Server Proxy Endpoint (/mcp/servers/:serverId)
  // ----------------------------------------------------
  if (targetServerId) {
    const server = serverService.getServer(targetServerId);
    if (!server) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `MCP Server with ID '${targetServerId}' not found` },
      };
    }

    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: server.server_title || server.name,
            version: server.server_version || "1.0.0",
          },
          instructions: server.instructions || undefined,
        },
      };
    }

    if (method === "tools/list") {
      const allowedTools = filterEngine.filterToolsListForServer(apiKey.id, targetServerId);
      const mcpTools = allowedTools.map((t: any) => ({
        name: t.name, // Original tool name (un-prefixed for direct per-server endpoint)
        description: t.description,
        inputSchema: JSON.parse(t.input_schema_json || "{}"),
      }));

      return { jsonrpc: "2.0", id, result: { tools: mcpTools } };
    }

    if (method === "tools/call") {
      const originalToolName = params?.name;
      const args = params?.arguments || {};
      const startTime = Date.now();

      try {
        const { serverId, originalToolName: validatedName } =
          filterEngine.authorizeToolCallForServer(apiKey.id, targetServerId, originalToolName);

        const result = await upstreamManager.callTool(serverId, validatedName, args);
        const durationMs = Date.now() - startTime;

        auditService.logToolCall({
          apiKeyId: apiKey.id,
          serverId,
          toolName: originalToolName,
          status: "success",
          durationMs,
        });

        return { jsonrpc: "2.0", id, result };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const isPermissionDenied = err.message?.includes("Permission denied");

        auditService.logToolCall({
          apiKeyId: apiKey.id,
          toolName: originalToolName || "unknown",
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

    if (method === "prompts/list") {
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method '${method}' not supported by server '${server.name}'` },
    };
  }

  // ----------------------------------------------------
  // Root Aggregated Router Endpoint (/mcp)
  // ----------------------------------------------------
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "mcp-router", version: "1.0.0" },
      },
    };
  }

  if (method === "tools/list") {
    const allowedTools = filterEngine.filterToolsList(apiKey.id);
    const mcpTools = allowedTools.map((t: any) => ({
      name: t.namespaced_name,
      description: t.description,
      inputSchema: JSON.parse(t.input_schema_json || "{}"),
    }));

    return { jsonrpc: "2.0", id, result: { tools: mcpTools } };
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

      return { jsonrpc: "2.0", id, result };
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

  if (method === "prompts/list") {
    const allowedPrompts = filterEngine.filterPromptsList(apiKey.id);
    const mcpPrompts = allowedPrompts.map((p: any) => ({
      name: p.name,
      title: p.title || undefined,
      description: p.description || undefined,
      arguments: p.arguments.map((a: any) => ({
        name: a.name,
        description: a.description || undefined,
        required: a.required || undefined,
      })),
    }));

    return { jsonrpc: "2.0", id, result: { prompts: mcpPrompts } };
  }

  if (method === "prompts/get") {
    const promptName = params?.name;
    const args = params?.arguments || {};

    try {
      filterEngine.authorizePromptAccess(apiKey.id, promptName);
      const rendered = promptService.renderPrompt(promptName, args);
      return { jsonrpc: "2.0", id, result: rendered };
    } catch (err: any) {
      const isPermissionDenied = err.message?.includes("Permission denied");
      const isNotFoundOrMissingArg =
        err.message?.includes("not found") || err.message?.includes("Missing required argument");

      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: isPermissionDenied ? -32001 : isNotFoundOrMissingArg ? -32602 : -32603,
          message: err.message,
        },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method '${method}' not supported by MCP Router` },
  };
}

// ----------------------------------------------------
// Streamable HTTP & POST Endpoints
// ----------------------------------------------------

async function processPostRequest(c: any, targetServerId?: string) {
  const apiKey = c.get("apiKey");
  try {
    const body = await c.req.json();
    const response = await handleJsonRpc(apiKey, body, targetServerId);
    return c.json(response);
  } catch (err: any) {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
}

// 1. Root aggregated router POST endpoints
app.post("/mcp", (c) => processPostRequest(c));
app.post("/sse", (c) => processPostRequest(c));
app.post("/mcp/sse", (c) => processPostRequest(c));

// 2. Dedicated Prompts POST endpoints
app.post("/mcp/servers/prompts", (c) => processPostRequest(c, "prompts"));
app.post("/mcp/servers/prompts/sse", (c) => processPostRequest(c, "prompts"));
app.post("/sse/servers/prompts", (c) => processPostRequest(c, "prompts"));

// 3. Per-Server Proxy POST endpoints
app.post("/mcp/servers/:serverId", (c) => processPostRequest(c, c.req.param("serverId")));
app.post("/mcp/servers/:serverId/sse", (c) => processPostRequest(c, c.req.param("serverId")));
app.post("/sse/servers/:serverId", (c) => processPostRequest(c, c.req.param("serverId")));

// ----------------------------------------------------
// Server-Sent Events Endpoints (GET)
// ----------------------------------------------------

// 1. Root SSE (GET /sse or GET /mcp/sse)
const handleRootSse = (c: any) => {
  const apiKey = c.get("apiKey");
  const qs = getQueryString(c);
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "endpoint", data: `/mcp${qs}` });
    stream.onAbort(() => {
      console.log(`[SSE] Client with key ${apiKey.name} disconnected from root /mcp`);
    });
  });
};
app.get("/sse", handleRootSse);
app.get("/mcp/sse", handleRootSse);

// 2. Dedicated Prompts SSE (GET /mcp/servers/prompts/sse or GET /sse/servers/prompts)
const handlePromptsSse = (c: any) => {
  const apiKey = c.get("apiKey");
  const qs = getQueryString(c);
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "endpoint", data: `/mcp/servers/prompts${qs}` });
    stream.onAbort(() => {
      console.log(`[SSE] Client with key ${apiKey.name} disconnected from prompts server`);
    });
  });
};
app.get("/mcp/servers/prompts/sse", handlePromptsSse);
app.get("/sse/servers/prompts", handlePromptsSse);

// 3. Per-Server Proxy SSE (GET /mcp/servers/:serverId/sse or GET /sse/servers/:serverId)
const handleServerSse = (c: any) => {
  const apiKey = c.get("apiKey");
  const serverId = c.req.param("serverId");
  const qs = getQueryString(c);
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "endpoint", data: `/mcp/servers/${serverId}${qs}` });
    stream.onAbort(() => {
      console.log(`[SSE] Client with key ${apiKey.name} disconnected from server ${serverId}`);
    });
  });
};
app.get("/mcp/servers/:serverId/sse", handleServerSse);
app.get("/sse/servers/:serverId", handleServerSse);

export default app;
