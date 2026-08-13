import React from "react";
import { Card } from "@/components/ui/card";
import { ServerCard, type ServerItem } from "./ServerCard";

interface ServerListProps {
  servers: ServerItem[];
  selectedServerId: string | null;
  loading: boolean;
  searchQuery: string;
  statusFilter: string;
  onSelectServer: (id: string) => void;
  onOpenLogs: (server: ServerItem, e: React.MouseEvent) => void;
  onEditServer: (server: ServerItem, e: React.MouseEvent) => void;
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  selectedServerId,
  loading,
  searchQuery,
  statusFilter,
  onSelectServer,
  onOpenLogs,
  onEditServer,
}) => {
  if (loading) {
    return <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading servers...</div>;
  }

  if (servers.length === 0) {
    return (
      <Card className="p-6 glass-panel border-zinc-800 bg-zinc-900/50 text-center text-xs text-zinc-500 font-mono">
        {searchQuery || statusFilter !== "all"
          ? "No servers match your filter criteria."
          : 'No servers added yet. Click "Add MCP Server" to get started.'}
      </Card>
    );
  }

  return (
    <div className="space-y-2.5 pr-1">
      {servers.map((server) => (
        <ServerCard
          key={server.id}
          server={server}
          isSelected={selectedServerId === server.id}
          onSelect={onSelectServer}
          onOpenLogs={onOpenLogs}
          onEdit={onEditServer}
        />
      ))}
    </div>
  );
};
