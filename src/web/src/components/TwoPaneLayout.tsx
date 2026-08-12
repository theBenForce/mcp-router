import React, { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TwoPaneLayoutProps {
  title: string;
  description: string;
  actionLabel?: string;
  onActionClick?: () => void;
  actionIcon?: ReactNode;
  banner?: ReactNode;

  // Left Column
  leftHeader?: ReactNode;
  leftContent: ReactNode;

  // Right Column
  rightContent: ReactNode;
}

export const TwoPaneLayout: React.FC<TwoPaneLayoutProps> = ({
  title,
  description,
  actionLabel,
  onActionClick,
  actionIcon = <Plus className="h-4 w-4" />,
  banner,
  leftHeader,
  leftContent,
  rightContent,
}) => {
  return (
    <div className="flex flex-col h-full space-y-6 min-h-0 overflow-hidden">
      {/* Top Page Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-400">{description}</p>
        </div>
        {actionLabel && onActionClick && (
          <Button
            onClick={onActionClick}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-600/20"
          >
            {actionIcon}
            <span>{actionLabel}</span>
          </Button>
        )}
      </div>

      {/* Optional Top Banner / Alert */}
      {banner}

      {/* Grid: Left Column & Right Column */}
      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Left Column */}
        <div className="col-span-5 flex flex-col min-h-0 h-full overflow-hidden space-y-3">
          {leftHeader}
          <ScrollArea className="flex-1 min-h-0 pr-1">
            {leftContent}
          </ScrollArea>
        </div>

        {/* Right Column */}
        <div className="col-span-7 flex flex-col min-h-0 h-full overflow-hidden">
          {rightContent}
        </div>
      </div>
    </div>
  );
};
