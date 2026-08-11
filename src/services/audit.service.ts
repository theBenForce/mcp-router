import { getDb, getRawDb } from "../db";
import { auditLogs } from "../db/schema";

export interface LogToolCallInput {
  apiKeyId?: string | null;
  serverId?: string | null;
  toolName: string;
  status: "allowed" | "denied" | "error" | "success";
  durationMs?: number | null;
  errorMessage?: string | null;
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
        createdAt: new Date().toISOString(),
      })
      .run();
    return id;
  }

  queryLogs(filters?: {
    apiKeyId?: string;
    serverId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
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

    if (filters?.status) {
      query += " AND a.status = ?";
      params.push(filters.status);
    }

    query += " ORDER BY a.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rawDb = getRawDb();
    return rawDb.query(query).all(...params);
  }
}

export const auditService = new AuditService();
