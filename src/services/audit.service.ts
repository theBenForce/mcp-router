import { getDb, getRawDb } from "../db";
import { auditLogs } from "../db/schema";

export const MAX_AUDIT_PAYLOAD_LENGTH = 20000;

export function truncateAuditPayload(payload?: string | null, maxLen = MAX_AUDIT_PAYLOAD_LENGTH): string | null {
  if (!payload) return null;
  if (typeof payload !== "string") {
    try {
      payload = JSON.stringify(payload);
    } catch {
      payload = String(payload);
    }
  }
  if (payload.length <= maxLen) return payload;
  const truncatedPart = payload.slice(0, maxLen);
  return `${truncatedPart}\n\n... [Truncated: total length ${payload.length} characters]`;
}

export interface LogToolCallInput {
  apiKeyId?: string | null;
  serverId?: string | null;
  toolName: string;
  status: "allowed" | "denied" | "error" | "success";
  durationMs?: number | null;
  errorMessage?: string | null;
  parametersJson?: string | null;
  responseJson?: string | null;
}

export interface AuditLogFilters {
  apiKeyId?: string;
  serverId?: string;
  toolName?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class AuditService {
  logToolCall(input: LogToolCallInput) {
    const db = getDb();
    const id = crypto.randomUUID();
    db.insert(auditLogs)
      .values({
        id,
        apiKeyId: input.apiKeyId || null,
        serverId: input.serverId || null,
        toolName: input.toolName,
        status: input.status,
        durationMs: input.durationMs || null,
        errorMessage: input.errorMessage || null,
        parametersJson: truncateAuditPayload(input.parametersJson),
        responseJson: truncateAuditPayload(input.responseJson),
        createdAt: new Date().toISOString(),
      })
      .run();
    return id;
  }

  getLogById(id: string) {
    const rawDb = getRawDb();
    const query = `
      SELECT
        a.*,
        k.name as api_key_name,
        k.key_prefix,
        s.name as server_name
      FROM audit_logs a
      LEFT JOIN api_keys k ON a.api_key_id = k.id
      LEFT JOIN mcp_servers s ON a.server_id = s.id
      WHERE a.id = ?
    `;
    return rawDb.query(query).get(id);
  }

  queryLogs(filters?: AuditLogFilters) {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    // For the dynamic filter query, we use raw SQL via the underlying
    // bun:sqlite connection since Drizzle's dynamic WHERE chaining is verbose.
    // The Drizzle schema is still the source of truth for table definitions.
    let query = `
      SELECT
        a.*,
        k.name as api_key_name,
        k.key_prefix,
        s.name as server_name
      FROM audit_logs a
      LEFT JOIN api_keys k ON a.api_key_id = k.id
      LEFT JOIN mcp_servers s ON a.server_id = s.id
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (filters?.apiKeyId) {
      query += " AND a.api_key_id = ?";
      params.push(filters.apiKeyId);
    }

    if (filters?.serverId) {
      query += " AND a.server_id = ?";
      params.push(filters.serverId);
    }

    if (filters?.toolName) {
      query += " AND a.tool_name = ?";
      params.push(filters.toolName);
    }

    if (filters?.status) {
      query += " AND a.status = ?";
      params.push(filters.status);
    }

    if (filters?.search) {
      query += " AND (a.tool_name LIKE ? OR a.parameters_json LIKE ? OR a.error_message LIKE ?)";
      const pattern = `%${filters.search}%`;
      params.push(pattern, pattern, pattern);
    }

    query += " ORDER BY a.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rawDb = getRawDb();
    return rawDb.query(query).all(...params);
  }
}

export const auditService = new AuditService();

