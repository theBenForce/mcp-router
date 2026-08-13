import React from "react";
import { Terminal, Key, Pencil, RefreshCw, Trash2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ServerItem } from "./ServerCard";
import { ServerConfigMetadata } from "./ServerConfigMetadata";
import { ToolInspector } from "./ToolInspector";

interface ServerDetailPaneProps {
  server: ServerItem | null;
  onOpenCliAuth: (server: ServerItem) => void;
  onOAuthAuthorize: (id: string) => void;
  onOpenLogs: (server: ServerItem) => void;
  onEdit: (server: ServerItem) => void;
  onReconnect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateToolAction: (toolId: string, actionType: string) => void;
}

export const ServerDetailPane: React.FC<ServerDetailPaneProps> = ({
  server,
  onOpenCliAuth,
  onOAuthAuthorize,
  onOpenLogs,
  onEdit,
  onReconnect,
  onDelete,
  onUpdateToolAction,
}) => {
  if (!server) {
    return (
      <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500 h-full flex flex-col items-center justify-center space-y-3">
        <Server className="h-10 w-10 text-zinc-600 animate-pulse" />
        <div className="space-y-1">
          <h3 className="font-semibold text-sm text-zinc-300">No Server Selected</h3>
          <p className="text-xs text-zinc-500">Select an MCP server from the list to view configuration and tools</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-6 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Server Header & Actions */}
      <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-zinc-100">{server.name}</h2>
            {server.server_version && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                v{server.server_version}
              </Badge>
            )}
          </div>
          {server.server_title && server.server_title !== server.name && (
            <p className="text-xs font-medium text-indigo-400">{server.server_title}</p>
          )}
          <p className="text-xs text-zinc-400">{server.description}</p>
        </div>

        <div className="flex items-center gap-2">
          {server.auth_type === "cli_command" || server.auth_data?.command ? (
            <Button
              size="sm"
              onClick={() => onOpenCliAuth(server)}
              className="gap-1.5 bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Authenticate (CLI)</span>
            </Button>
          ) : server.status === "need_auth" || server.auth_type === "oauth2" ? (
            <Button
              size="sm"
              onClick={() => onOAuthAuthorize(server.id)}
              className="gap-1.5 bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20"
            >
              <Key className="h-3.5 w-3.5" />
              <span>Authenticate</span>
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenLogs(server)}
            className="gap-1.5"
            title="View Server Logs"
          >
            <Terminal className="h-3.5 w-3.5 text-indigo-400" />
            <span>Logs</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(server)}
            className="gap-1.5"
            title="Edit MCP Server parameters"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onReconnect(server.id)}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reconnect</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(server.id)}
            className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            title="Delete MCP Server"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable details & tools container */}
      <ScrollArea className="flex-1 min-h-0 pt-4 pr-2">
        <div className="space-y-6">
          <ServerConfigMetadata server={server} />

          {server.last_error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
              Error: {server.last_error}
            </div>
          )}

          <ToolInspector tools={server.tools || []} onUpdateToolAction={onUpdateToolAction} />
        </div>
      </ScrollArea>
    </Card>
  );
};
