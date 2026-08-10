import React, { useEffect, useState } from "react";
import { Activity, CheckCircle, AlertTriangle, ShieldAlert, RefreshCw } from "lucide-react";

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Audit Logs</h1>
          <p className="text-sm text-zinc-400">Real-time log of tool invocations, permission decisions, and execution status</p>
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">No tool invocation logs recorded yet.</div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 font-medium">
                <th className="p-4">Timestamp</th>
                <th className="p-4">API Key</th>
                <th className="p-4">Requested Tool</th>
                <th className="p-4">Target Server</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="p-4 text-zinc-400">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="p-4 text-zinc-200">
                    {log.api_key_name || "Unknown"} <span className="text-zinc-500">({log.key_prefix || "none"})</span>
                  </td>
                  <td className="p-4 font-semibold text-indigo-400">{log.tool_name}</td>
                  <td className="p-4 text-zinc-300">{log.server_name || "—"}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono ${
                        log.status === "success"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : log.status === "denied"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {log.status === "success" && <CheckCircle className="h-3 w-3" />}
                      {log.status === "denied" && <ShieldAlert className="h-3 w-3" />}
                      {log.status === "error" && <AlertTriangle className="h-3 w-3" />}
                      <span>{log.status}</span>
                    </span>
                  </td>
                  <td className="p-4 text-right text-zinc-400">
                    {log.duration_ms ? `${log.duration_ms}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
