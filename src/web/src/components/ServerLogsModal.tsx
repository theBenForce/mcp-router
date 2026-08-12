import React, { useEffect, useState, useRef, useCallback } from "react";
import { Terminal, RefreshCw, Trash2, Copy, Download, Search, X, Check, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useServerEvents, type ServerLogEntryPayload } from "../hooks/useServerEvents";

export interface LogEntry {
  id: string;
  serverId: string;
  timestamp: string;
  level: "stdout" | "stderr" | "info" | "error";
  message: string;
}

interface ServerLogsModalProps {
  server: any | null;
  isOpen: boolean;
  onClose: () => void;
}

const LEVEL_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  stdout: { label: "STDOUT", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  stderr: { label: "STDERR", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  info: { label: "INFO", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  error: { label: "ERROR", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
};

export const ServerLogsModal: React.FC<ServerLogsModalProps> = ({ server, isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleLogReceived = useCallback((newLog: ServerLogEntryPayload) => {
    setLogs((prevLogs) => {
      if (prevLogs.some((l) => l.id === newLog.id)) {
        return prevLogs;
      }
      const updated = [...prevLogs, newLog];
      // Ring-buffer cap at last 1,000 log lines to prevent DOM bloat
      return updated.length > 1000 ? updated.slice(-1000) : updated;
    });
  }, []);

  useServerEvents({
    serverId: server?.id,
    onLogReceived: handleLogReceived,
    enabled: isOpen && Boolean(server?.id),
  });

  useEffect(() => {
    if (!isOpen || !server) return;
    fetchLogs();
  }, [isOpen, server?.id]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const fetchLogs = async (silent = false) => {
    if (!server) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/logs`);
      const data = await res.json();
      if (Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to fetch server logs:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!server) return;
    try {
      await fetch(`/api/servers/${server.id}/logs`, { method: "DELETE" });
      setLogs([]);
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  const handleCopyLogs = () => {
    if (logs.length === 0) return;
    const text = logs
      .map((l) => `[${new Date(l.timestamp).toLocaleString()}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    if (!server || logs.length === 0) return;
    const text = logs
      .map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${server.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-logs.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !server) return null;

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = selectedLevel === "all" || log.level === selectedLevel;
    const matchesQuery = !searchQuery || log.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesQuery;
  });

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col glass-panel bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">{server.name} Server Logs</h2>
                <Badge variant="outline" className="font-mono text-[10px] bg-zinc-900 border-zinc-800 text-zinc-400">
                  {server.transport_type}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 font-mono">In-memory execution & stderr logs ({logs.length} entries)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchLogs()}
              className="h-8 px-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 gap-1.5"
              title="Refresh logs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Level Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: "all", label: "ALL", count: logs.length },
              { id: "stdout", label: "STDOUT", count: logs.filter((l) => l.level === "stdout").length },
              { id: "stderr", label: "STDERR", count: logs.filter((l) => l.level === "stderr").length },
              { id: "info", label: "INFO", count: logs.filter((l) => l.level === "info").length },
              { id: "error", label: "ERROR", count: logs.filter((l) => l.level === "error").length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedLevel(tab.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all flex items-center gap-1.5 ${
                  selectedLevel === tab.id
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-zinc-800/40"
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] text-zinc-500">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Search and Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-7 h-7 text-xs w-48 bg-zinc-950/80 border-zinc-800 text-zinc-200 placeholder:text-zinc-600"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`h-7 px-2 text-[11px] font-mono gap-1 ${
                autoScroll ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" : "text-zinc-400 border-zinc-800"
              }`}
              title="Toggle Auto-Scroll"
            >
              <ArrowDown className="h-3 w-3" />
              <span>Auto-scroll</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="h-7 px-2 text-[11px] font-mono text-zinc-300 border-zinc-800 hover:bg-zinc-800 gap-1"
              title="Copy all logs"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLogs}
              disabled={logs.length === 0}
              className="h-7 px-2 text-[11px] font-mono text-zinc-300 border-zinc-800 hover:bg-zinc-800 gap-1"
              title="Download log file"
            >
              <Download className="h-3 w-3" />
              <span>Download</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLogs}
              disabled={logs.length === 0}
              className="h-7 px-2 text-[11px] font-mono text-rose-400 border-rose-500/20 hover:bg-rose-500/10 gap-1"
              title="Clear in-memory log buffer"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear</span>
            </Button>
          </div>
        </div>

        {/* Terminal Screen Body */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-[300px] max-h-[550px] overflow-y-auto p-4 font-mono text-xs bg-zinc-950 text-zinc-300 space-y-1.5 select-text"
        >
          {loading && logs.length === 0 ? (
            <div className="py-12 text-center text-zinc-600">Loading server logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-zinc-600">
              {searchQuery || selectedLevel !== "all"
                ? "No logs match your filter criteria."
                : "No logs stored yet for this server."}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const meta = LEVEL_BADGES[log.level] || LEVEL_BADGES.info;
              return (
                <div key={log.id} className="flex items-start gap-2.5 leading-relaxed hover:bg-zinc-900/50 p-1 rounded transition-colors">
                  <span className="text-zinc-600 shrink-0 text-[11px] select-none">{formatTime(log.timestamp)}</span>
                  <Badge
                    variant="outline"
                    className={`shrink-0 font-mono text-[9px] px-1.5 py-0 uppercase ${meta.bg} ${meta.text} ${meta.border}`}
                  >
                    {meta.label}
                  </Badge>
                  <span className={`break-all whitespace-pre-wrap ${log.level === "error" || log.level === "stderr" ? "text-amber-200/90" : "text-zinc-200"}`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
