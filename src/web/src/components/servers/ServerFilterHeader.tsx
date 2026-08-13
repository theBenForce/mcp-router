import React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type StatusFilterOption = "all" | "connected" | "need_auth" | "error";

interface ServerFilterHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilterOption;
  onStatusFilterChange: (filter: StatusFilterOption) => void;
  onAddClick: () => void;
}

export const ServerFilterHeader: React.FC<ServerFilterHeaderProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onAddClick,
}) => {
  return (
    <div className="p-4 border-b border-border/40 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Servers</h2>
        <Button onClick={onAddClick} size="sm" className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Add Server</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Filter servers or tools..."
          className="pl-8 bg-background/50 text-sm"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {(["all", "connected", "need_auth", "error"] as StatusFilterOption[]).map((f) => (
          <button
            key={f}
            onClick={() => onStatusFilterChange(f)}
            className={`px-2.5 py-1 rounded-full font-medium capitalize transition-colors whitespace-nowrap ${
              statusFilter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>
    </div>
  );
};
