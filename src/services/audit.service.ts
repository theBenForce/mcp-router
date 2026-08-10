import { getDb } from "../db";

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
    db.query(`
      INSERT INTO audit_logs (id, api_key_id, server_id, tool_name, status, duration_ms, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.apiKeyId || null,
      input.serverId || null,
      input.toolName,
      input.status,
      input.durationMs || null,
      input.errorMessage || null
    );
    return id;
  }

  queryLogs(filters?: {
    apiKeyId?: string;
    serverId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = getDb();
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

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

    return db.query(query).all(...params);
  }
}

export const auditService = new AuditService();
