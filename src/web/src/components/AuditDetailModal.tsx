import React, { useState } from "react";
import {
  Wrench,
  Clock,
  Key,
  Server,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Copy,
  Check,
  Code2,
  FileText,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { formatLocalDateTime } from "@/lib/utils";

export interface AuditLogEntryDetail {
  id: string;
  api_key_id?: string | null;
  server_id?: string | null;
  tool_name: string;
  status: "allowed" | "denied" | "error" | "success" | string;
  duration_ms?: number | null;
  error_message?: string | null;
  parameters_json?: string | null;
  response_json?: string | null;
  api_key_name?: string | null;
  key_prefix?: string | null;
  server_name?: string | null;
  created_at: string;
}

interface AuditDetailModalProps {
  log: AuditLogEntryDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AuditDetailModal: React.FC<AuditDetailModalProps> = ({
  log,
  isOpen,
  onClose,
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!isOpen || !log) return null;

  const copyText = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => {
      setCopiedSection(null);
    }, 2000);
  };

  const formatJson = (raw?: string | null) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  const formattedParams = formatJson(log.parameters_json);
  const formattedResponse = formatJson(log.response_json);
  const isParamsEmpty =
    !log.parameters_json ||
    log.parameters_json.trim() === "{}" ||
    log.parameters_json.trim() === "null" ||
    log.parameters_json.trim() === "";

  const isResponseTruncated =
    Boolean(log.response_json && log.response_json.includes("... [Truncated:"));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] shadow-2xl p-0 overflow-hidden flex flex-col gap-0 select-text">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="font-semibold text-base text-zinc-100 font-mono">
                  {log.tool_name}
                </DialogTitle>
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
                  <span className="capitalize">{log.status}</span>
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Invocation ID: <span className="text-zinc-500">{log.id}</span>
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Metadata Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mb-1">
                <Key className="h-3.5 w-3.5 text-emerald-400" />
                <span>API Key</span>
              </div>
              <div className="text-xs font-semibold text-zinc-200 truncate">
                {log.api_key_name || "Unknown"}
              </div>
              {log.key_prefix && (
                <div className="text-[10px] font-mono text-emerald-400/80">
                  {log.key_prefix}...
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mb-1">
                <Server className="h-3.5 w-3.5 text-indigo-400" />
                <span>Target Server</span>
              </div>
              <div className="text-xs font-semibold text-zinc-200 truncate">
                {log.server_name || "—"}
              </div>
              <div className="text-[10px] font-mono text-zinc-500">
                {log.server_id ? "Direct Proxy" : "Router Aggregator"}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>Duration</span>
              </div>
              <div className="text-xs font-mono font-semibold text-zinc-200">
                {log.duration_ms !== null && log.duration_ms !== undefined
                  ? `${log.duration_ms}ms`
                  : "—"}
              </div>
              <div className="text-[10px] text-zinc-500">Roundtrip Latency</div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mb-1">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <span>Timestamp</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-300">
                {formatLocalDateTime(log.created_at)}
              </div>
            </div>
          </div>

          {/* Error Message Alert (if present) */}
          {log.error_message && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Execution Error Message</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyText(log.error_message!, "error")}
                  className="h-6 px-2 text-[11px] text-rose-400 hover:bg-rose-500/20 gap-1"
                >
                  {copiedSection === "error" ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedSection === "error" ? "Copied" : "Copy"}</span>
                </Button>
              </div>
              <p className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed pl-6">
                {log.error_message}
              </p>
            </div>
          )}

          {/* Request Parameters Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Request Parameters
                </span>
              </div>
              {!isParamsEmpty && formattedParams && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(formattedParams, "params")}
                  className="h-7 px-2 text-[11px] font-mono text-zinc-300 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 gap-1"
                >
                  {copiedSection === "params" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedSection === "params" ? "Copied" : "Copy Params"}</span>
                </Button>
              )}
            </div>

            {isParamsEmpty ? (
              <div className="p-4 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-xs text-zinc-500 font-mono text-center">
                No parameters sent (empty arguments payload: <code className="text-zinc-400">{"{}"}</code>)
              </div>
            ) : (
              <div className="relative rounded-lg bg-zinc-950 border border-zinc-800/80 p-3.5 max-h-[220px] overflow-y-auto">
                <pre className="font-mono text-xs text-emerald-300/90 whitespace-pre-wrap break-all leading-relaxed select-text">
                  {formattedParams}
                </pre>
              </div>
            )}
          </div>

          {/* Response Payload Section */}
          {log.response_json && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Tool Response / Result
                  </span>
                  {isResponseTruncated && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border-amber-500/30"
                    >
                      Truncated Large Response
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(log.response_json!, "response")}
                  className="h-7 px-2 text-[11px] font-mono text-zinc-300 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 gap-1"
                >
                  {copiedSection === "response" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedSection === "response" ? "Copied" : "Copy Response"}</span>
                </Button>
              </div>

              <div className="relative rounded-lg bg-zinc-950 border border-zinc-800/80 p-3.5 max-h-[260px] overflow-y-auto">
                <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap break-all leading-relaxed select-text">
                  {formattedResponse}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyText(JSON.stringify(log, null, 2), "raw")}
            className="text-xs text-zinc-400 hover:text-zinc-200 gap-1.5"
          >
            {copiedSection === "raw" ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copiedSection === "raw" ? "Copied Record" : "Copy Raw Log JSON"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 text-xs px-4"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
