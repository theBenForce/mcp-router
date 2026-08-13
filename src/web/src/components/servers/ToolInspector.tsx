import React from "react";
import { Wrench, Eye, Edit3, Trash, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../ui/accordion";

const ACTION_BADGES: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
  read: { label: "READ", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", icon: Eye },
  write: { label: "WRITE", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", icon: Edit3 },
  delete: { label: "DELETE", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", icon: Trash },
  execute: { label: "EXEC", bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", icon: Play },
};

interface ToolInspectorProps {
  tools: any[];
  onUpdateToolAction: (toolId: string, actionType: string) => void;
}

export const ToolInspector: React.FC<ToolInspectorProps> = ({ tools, onUpdateToolAction }) => {
  const toolsByAction: Record<string, any[]> = {
    read: [],
    write: [],
    delete: [],
    execute: [],
  };

  for (const tool of tools || []) {
    const type = tool.action_type || "write";
    if (!toolsByAction[type]) toolsByAction[type] = [];
    toolsByAction[type].push(tool);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-400">
          Discovered Tools ({tools?.length || 0})
        </h3>
        <span className="text-[11px] text-zinc-500">Grouped by permission action type</span>
      </div>

      {(!tools || tools.length === 0) ? (
        <div className="py-6 text-center text-xs text-zinc-500 font-mono">
          No tools discovered. Reconnect server to discover tools.
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={["read", "write", "delete", "execute"]} className="space-y-3">
          {(["read", "write", "delete", "execute"] as const).map((type) => {
            const categoryTools = toolsByAction[type];
            if (categoryTools.length === 0) return null;
            const badge = ACTION_BADGES[type];
            const Icon = badge.icon;

            return (
              <AccordionItem key={type} value={type} className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/60 px-4">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${badge.text}`} />
                      <span className="font-semibold text-xs uppercase tracking-wider text-zinc-200">
                        {type} Tools
                      </span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-mono font-semibold ${badge.bg} ${badge.text} ${badge.border}`}>
                      {categoryTools.length} tool(s)
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pt-1">
                    {categoryTools.map((tool: any) => (
                      <div
                        key={tool.id}
                        className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                            <span className="font-mono text-xs font-semibold text-zinc-200">
                              {tool.namespaced_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={tool.action_type || "write"}
                              onChange={(e) => onUpdateToolAction(tool.id, e.target.value)}
                              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                                tool.action_type === "read"
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                  : tool.action_type === "delete"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                  : tool.action_type === "execute"
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}
                              title="Click to override action permissions category"
                            >
                              <option value="read" className="bg-zinc-900 text-blue-400">READ</option>
                              <option value="write" className="bg-zinc-900 text-amber-400">WRITE</option>
                              <option value="delete" className="bg-zinc-900 text-rose-400">DELETE</option>
                              <option value="execute" className="bg-zinc-900 text-purple-400">EXECUTE</option>
                            </select>
                            <span className="text-[10px] text-zinc-500 font-mono">({tool.name})</span>
                          </div>
                        </div>
                        {tool.description && (
                          <p className="text-xs text-zinc-400 pl-5">{tool.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
};
