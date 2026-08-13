import React from "react";
import { Cpu, Terminal, Container, Globe, CheckCircle, Key, XCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ServerItem {
  id: string;
  name: string;
  description?: string;
  transport_type: string;
  executor_type?: string;
  status: string;
  tools?: any[];
  [key: string]: any;
}

interface ServerCardProps {
  server: ServerItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpenLogs: (server: ServerItem, e: React.MouseEvent) => void;
  onEdit: (server: ServerItem, e: React.MouseEvent) => void;
}

export const ServerCard: React.FC<ServerCardProps> = React.memo(({
  server,
  isSelected,
  onSelect,
  onOpenLogs,
  onEdit,
}) => {
  const toolCount = server.tools ? server.tools.length : undefined;

  return (
    <div
      onClick={() => onSelect(server.id)}
      className={`group relative p-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? "bg-indigo-600/10 border-indigo-500/40 shadow-md shadow-indigo-500/5 text-zinc-100"
          : "glass-panel bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700/80 text-zinc-300"
      }`}
    >
      {isSelected && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-500 rounded-r-full shadow-sm shadow-indigo-500" />
      )}

      <div className="space-y-2 pl-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {server.transport_type === "stdio" && server.executor_type === "host" ? (
              <Cpu className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : server.transport_type === "stdio" ? (
              <Terminal className="h-4 w-4 text-indigo-400 shrink-0" />
            ) : server.transport_type === "docker" ? (
              <Container className="h-4 w-4 text-cyan-400 shrink-0" />
            ) : (
              <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            <h3 className="font-semibold text-sm text-zinc-100 truncate">{server.name}</h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => onOpenLogs(server, e)}
              className="h-6 w-6 text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800/80"
              title="View Server Logs"
            >
              <Terminal className="h-3 w-3 text-indigo-400" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => onEdit(server, e)}
              className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
              title="Edit MCP Server"
            >
              <Pencil className="h-3 w-3" />
            </Button>

            <Badge
              variant="outline"
              className={`gap-1 font-mono text-[10px] px-2 py-0.5 shrink-0 ${
                server.status === "connected"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : server.status === "need_auth"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : server.status === "error"
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
              }`}
            >
              {server.status === "connected" && <CheckCircle className="h-2.5 w-2.5" />}
              {server.status === "need_auth" && <Key className="h-2.5 w-2.5" />}
              {server.status === "error" && <XCircle className="h-2.5 w-2.5" />}
              {server.status === "need_auth" ? "Needs Auth" : server.status}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-zinc-400 line-clamp-1">
          {server.description || "No description provided"}
        </p>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-500 font-mono">
          <span className="capitalize">{server.transport_type}</span>
          {server.executor_type && (
            <>
              <span>•</span>
              <span className="capitalize">{server.executor_type}</span>
            </>
          )}
          {typeof toolCount === "number" && (
            <>
              <span>•</span>
              <span>{toolCount} tool(s)</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

ServerCard.displayName = "ServerCard";
