import React, { useEffect, useState, useMemo } from "react";
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  Search,
  Filter,
  X,
  Eye,
  Key,
  Server,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatLocalDateTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditDetailModal, type AuditLogEntryDetail } from "../components/AuditDetailModal";

interface ApiKeyOption {
  id: string;
  name: string;
  key_prefix: string;
}

interface ServerOption {
  id: string;
  name: string;
}

interface ToolOption {
  id: string;
  name: string;
  namespaced_name: string;
}

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntryDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // Available filter options fetched from backend
  const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [tools, setTools] = useState<ToolOption[]>([]);

  // Filter selections
  const [selectedApiKey, setSelectedApiKey] = useState<string>("all");
  const [selectedServer, setSelectedServer] = useState<string>("all");
  const [selectedTool, setSelectedTool] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal detail selection
  const [selectedLog, setSelectedLog] = useState<AuditLogEntryDetail | null>(null);

  // Initial load for metadata options
  useEffect(() => {
    loadFilterOptions();
  }, []);

  // Fetch logs whenever filters change
  useEffect(() => {
    loadLogs();
  }, [selectedApiKey, selectedServer, selectedTool, selectedStatus, searchQuery]);

  const loadFilterOptions = async () => {
    try {
      const [kRes, sRes, tRes] = await Promise.all([
        fetch("/api/keys"),
        fetch("/api/servers"),
        fetch("/api/tools"),
      ]);
      const [kData, sData, tData] = await Promise.all([
        kRes.json(),
        sRes.json(),
        tRes.json(),
      ]);

      if (Array.isArray(kData)) setApiKeys(kData);
      if (Array.isArray(sData)) setServers(sData);
      if (Array.isArray(tData)) setTools(tData);
    } catch (e) {
      console.error("Failed to load audit filter options:", e);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");

      if (selectedApiKey && selectedApiKey !== "all") {
        params.set("apiKeyId", selectedApiKey);
      }
      if (selectedServer && selectedServer !== "all") {
        params.set("serverId", selectedServer);
      }
      if (selectedTool && selectedTool !== "all") {
        params.set("toolName", selectedTool);
      }
      if (selectedStatus && selectedStatus !== "all") {
        params.set("status", selectedStatus);
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLogs(data);
      }
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    } finally {
      setLoading(false);
    }
  };

  // Compile list of unique tool names from discovered tools and current logs
  const availableToolNames = useMemo(() => {
    const toolSet = new Set<string>();
    for (const t of tools) {
      if (t.namespaced_name) toolSet.add(t.namespaced_name);
      if (t.name) toolSet.add(t.name);
    }
    for (const l of logs) {
      if (l.tool_name) toolSet.add(l.tool_name);
    }
    return Array.from(toolSet).sort();
  }, [tools, logs]);

  const hasActiveFilters =
    selectedApiKey !== "all" ||
    selectedServer !== "all" ||
    selectedTool !== "all" ||
    selectedStatus !== "all" ||
    searchQuery.trim() !== "";

  const clearAllFilters = () => {
    setSelectedApiKey("all");
    setSelectedServer("all");
    setSelectedTool("all");
    setSelectedStatus("all");
    setSearchQuery("");
  };

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Audit Logs</h1>
          <p className="text-sm text-zinc-400">
            Real-time log of tool invocations, request parameters, permission decisions, and execution status
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            loadFilterOptions();
            loadLogs();
          }}
          className="gap-1.5 border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
          <span>Refresh Logs</span>
        </Button>
      </div>

      {/* Filter Toolbar Card */}
      <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 pb-1 border-b border-zinc-800/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            <Filter className="h-3.5 w-3.5 text-indigo-400" />
            <span>Filter Audit Logs</span>
            <Badge variant="outline" className="ml-1 text-[10px] font-mono border-zinc-800 text-zinc-400">
              {logs.length} entries
            </Badge>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-6 px-2 text-[11px] text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 gap-1"
            >
              <X className="h-3 w-3" />
              <span>Clear Filters</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          {/* API Key Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Key className="h-3 w-3 text-emerald-400" />
              <span>API Key</span>
            </label>
            <select
              value={selectedApiKey}
              onChange={(e) => setSelectedApiKey(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All API Keys</option>
              {apiKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.key_prefix}...)
                </option>
              ))}
            </select>
          </div>

          {/* Target Server Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Server className="h-3 w-3 text-indigo-400" />
              <span>Target Server</span>
            </label>
            <select
              value={selectedServer}
              onChange={(e) => setSelectedServer(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Targets</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tool Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Wrench className="h-3 w-3 text-purple-400" />
              <span>Tool</span>
            </label>
            <select
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-mono"
            >
              <option value="all">All Tools</option>
              {availableToolNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Activity className="h-3 w-3 text-amber-400" />
              <span>Status</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-mono"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="error">Error</option>
            </select>
          </div>

          {/* Search Query */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Search className="h-3 w-3 text-zinc-400" />
              <span>Search Keywords</span>
            </label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search params, tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs bg-zinc-950 border-zinc-800 text-zinc-200 pr-7"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Audit Log Table */}
      <Card className="glass-panel border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 font-mono">
            Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="text-xs text-zinc-500 font-mono">
              {hasActiveFilters
                ? "No tool invocation logs match your filter criteria."
                : "No tool invocation logs recorded yet."}
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="h-7 text-xs border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              >
                Clear Filters
              </Button>
            )}
          </div>
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
                <TableHead className="text-center text-zinc-400 w-16">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="font-mono">
              {logs.map((log) => (
                <TableRow
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="border-zinc-800/60 hover:bg-zinc-800/40 cursor-pointer transition-colors group"
                >
                  <TableCell className="text-zinc-400 text-xs font-mono">
                    {formatLocalDateTime(log.created_at)}
                  </TableCell>
                  <TableCell className="text-zinc-200">
                    <span className="font-medium">{log.api_key_name || "Unknown"}</span>{" "}
                    <span className="text-zinc-500">({log.key_prefix || "none"})</span>
                  </TableCell>
                  <TableCell className="font-semibold text-indigo-400 group-hover:text-indigo-300">
                    {log.tool_name}
                  </TableCell>
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
                    {log.duration_ms !== null && log.duration_ms !== undefined
                      ? `${log.duration_ms}ms`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedLog(log)}
                      className="h-7 w-7 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                      title="Inspect request parameters & details"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Details Inspection Modal */}
      <AuditDetailModal
        log={selectedLog}
        isOpen={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
};

