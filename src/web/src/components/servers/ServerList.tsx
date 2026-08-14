import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onExploreRegistry?: () => void;
  onAddServer?: () => void;
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
  onExploreRegistry,
  onAddServer,
}) => {
  if (loading) {
    return <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading servers...</div>;
  }

  if (servers.length === 0) {
    return (
      <Card className="p-6 glass-panel border-zinc-800 bg-zinc-900/50 text-center text-xs text-zinc-400 space-y-3">
        <p>
          {searchQuery || statusFilter !== "all"
            ? "No servers match your filter criteria."
            : "No servers added yet to your configuration."}
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          {onExploreRegistry && (
            <Button
              size="sm"
              onClick={onExploreRegistry}
              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Explore Registry</span>
            </Button>
          )}
          {onAddServer && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAddServer}
              className="h-8 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Custom Server</span>
            </Button>
          )}
        </div>
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
