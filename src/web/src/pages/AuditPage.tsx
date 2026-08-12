import React, { useEffect, useState } from "react";
import { Activity, CheckCircle, AlertTriangle, ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatLocalDateTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit?limit=100");
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Audit Logs</h1>
          <p className="text-sm text-zinc-400">Real-time log of tool invocations, permission decisions, and execution status</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadLogs}
          className="gap-1.5 border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Logs</span>
        </Button>
      </div>

      {/* Audit Log Table */}
      <Card className="glass-panel border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">No tool invocation logs recorded yet.</div>
        ) : (
          <Table>
            <TableHeader className="bg-zinc-950/40 border-b border-zinc-800">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Timestamp</TableHead>
                <TableHead className="text-zinc-400">API Key</TableHead>
                <TableHead className="text-zinc-400">Requested Tool</TableHead>
                <TableHead className="text-zinc-400">Target Server</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-right text-zinc-400">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="font-mono">
              {logs.map((log) => (
                <TableRow key={log.id} className="border-zinc-800/60 hover:bg-zinc-900/40">
                  <TableCell className="text-zinc-400 text-xs font-mono">
                    {formatLocalDateTime(log.created_at)}
                  </TableCell>
                  <TableCell className="text-zinc-200">
                    {log.api_key_name || "Unknown"} <span className="text-zinc-500">({log.key_prefix || "none"})</span>
                  </TableCell>
                  <TableCell className="font-semibold text-indigo-400">{log.tool_name}</TableCell>
                  <TableCell className="text-zinc-300">{log.server_name || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`gap-1 font-mono text-[11px] ${
                        log.status === "success"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : log.status === "denied"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }`}
                    >
                      {log.status === "success" && <CheckCircle className="h-3 w-3" />}
                      {log.status === "denied" && <ShieldAlert className="h-3 w-3" />}
                      {log.status === "error" && <AlertTriangle className="h-3 w-3" />}
                      <span>{log.status}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">
                    {log.duration_ms ? `${log.duration_ms}ms` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};
