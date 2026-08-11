import React, { useState, useEffect } from "react";
import {
  X,
  ShieldCheck,
  Server,
  Wrench,
  MessageSquare,
  CheckSquare,
  Square,
  Save,
  Eye,
  Edit3,
  Trash,
  Play,
  Search,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface ToolItem {
  id: string;
  name: string;
  namespaced_name: string;
  action_type?: "read" | "write" | "delete" | "execute";
}

interface ServerItem {
  id: string;
  name: string;
  tools: ToolItem[];
}

interface PromptItem {
  id: string;
  name: string;
  title?: string;
}

interface PermissionRule {
  serverId?: string | null;
  toolId?: string | null;
  promptId?: string | null;
  actionType?: string | null;
  action_type?: string | null;
}

interface PermissionMatrixModalProps {
  isOpen: boolean;
  keyId: string | null;
  keyName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ACTION_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; activeBg: string; icon: any }> = {
  read: { label: "READ", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", activeBg: "bg-blue-500/20", icon: Eye },
  write: { label: "WRITE", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", activeBg: "bg-amber-500/20", icon: Edit3 },
  delete: { label: "DELETE", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", activeBg: "bg-rose-500/20", icon: Trash },
  execute: { label: "EXEC", bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", activeBg: "bg-purple-500/20", icon: Play },
};

export const PermissionMatrixModal: React.FC<PermissionMatrixModalProps> = ({
  isOpen,
  keyId,
  keyName,
  onClose,
  onSuccess,
}) => {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && keyId) {
      loadData();
    }
  }, [isOpen, keyId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [serversRes, promptsRes] = await Promise.all([
        fetch("/api/servers"),
        fetch("/api/prompts"),
      ]);
      const serversData = await serversRes.json();
      const promptsData = await promptsRes.json();

      setPrompts(promptsData || []);

      const serverItems: ServerItem[] = [];
      for (const s of serversData) {
        const detailRes = await fetch(`/api/servers/${s.id}`);
        const detail = await detailRes.json();
        serverItems.push({
          id: s.id,
          name: s.name,
          tools: detail.tools || [],
        });
      }
      setServers(serverItems);

      const permsRes = await fetch(`/api/keys/${keyId}/permissions`);
      const permsData = await permsRes.json();

      const permsList = permsData.map((p: any) => ({
        serverId: p.server_id || null,
        toolId: p.tool_id || null,
        promptId: p.prompt_id || null,
        actionType: p.action_type || null,
      }));
      setSelectedPermissions(permsList);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !keyId) return null;

  const isServerAllSelected = (serverId: string) => {
    return selectedPermissions.some(
      (p) => p.serverId === serverId && !p.toolId && (!p.actionType && !p.action_type)
    );
  };

  const isActionTypeSelected = (serverId: string, actionType: string) => {
    if (isServerAllSelected(serverId)) return true;
    return selectedPermissions.some(
      (p) => p.serverId === serverId && !p.toolId && (p.actionType === actionType || p.action_type === actionType)
    );
  };

  const isToolSelected = (serverId: string, toolId: string, actionType?: string) => {
    if (isServerAllSelected(serverId)) return true;
    if (actionType && isActionTypeSelected(serverId, actionType)) return true;
    return selectedPermissions.some((p) => p.serverId === serverId && p.toolId === toolId);
  };

  const isPromptSelected = (promptId: string) => {
    return selectedPermissions.some((p) => p.promptId === promptId);
  };

  const toggleServerAllTools = (serverId: string) => {
    if (isServerAllSelected(serverId)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p.serverId !== serverId));
    } else {
      const filtered = selectedPermissions.filter((p) => p.serverId !== serverId);
      setSelectedPermissions([...filtered, { serverId, toolId: null, actionType: null }]);
    }
  };

  const toggleActionType = (serverId: string, actionType: string) => {
    const isSelected = isActionTypeSelected(serverId, actionType);
    const filtered = selectedPermissions.filter(
      (p) => !(p.serverId === serverId && (p.actionType === actionType || p.action_type === actionType)) &&
             !(p.serverId === serverId && !p.toolId && !p.actionType && !p.action_type)
    );

    if (isSelected) {
      setSelectedPermissions(filtered);
    } else {
      setSelectedPermissions([...filtered, { serverId, toolId: null, actionType }]);
    }
  };

  const toggleSpecificTool = (serverId: string, toolId: string, actionType?: string) => {
    if (isServerAllSelected(serverId) || (actionType && isActionTypeSelected(serverId, actionType))) {
      const server = servers.find((s) => s.id === serverId);
      if (!server) return;
      
      const enabledTools = server.tools
        .filter((t) => t.id !== toolId && isToolSelected(serverId, t.id, t.action_type))
        .map((t) => ({ serverId, toolId: t.id }));

      const filtered = selectedPermissions.filter((p) => p.serverId !== serverId);
      setSelectedPermissions([...filtered, ...enabledTools]);
    } else if (isToolSelected(serverId, toolId)) {
      setSelectedPermissions(
        selectedPermissions.filter((p) => !(p.serverId === serverId && p.toolId === toolId))
      );
    } else {
      setSelectedPermissions([...selectedPermissions, { serverId, toolId }]);
    }
  };

  const togglePrompt = (promptId: string) => {
    if (isPromptSelected(promptId)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p.promptId !== promptId));
    } else {
      setSelectedPermissions([...selectedPermissions, { promptId }]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${keyId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: selectedPermissions }),
      });

      if (!res.ok) {
        throw new Error("Failed to update permissions");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getEnabledCount = (server: ServerItem) => {
    if (isServerAllSelected(server.id)) return server.tools.length;
    return server.tools.filter((t) => isToolSelected(server.id, t.id, t.action_type)).length;
  };

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 w-[92vw] max-w-4xl lg:max-w-5xl max-h-[88vh] overflow-hidden flex flex-col p-0 gap-0 shadow-2xl">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-zinc-100">Permission Matrix</DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Configure tool & server permissions for key:{" "}
                  <span className="text-indigo-400 font-mono font-semibold">{keyName}</span>
                </p>
              </div>
            </div>

            {/* Global Search */}
            <div className="relative w-64 hidden sm:block">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Filter tools across servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-indigo-500/30"
              />
            </div>
          </DialogHeader>

          {/* Content */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center text-xs text-zinc-500 font-mono flex items-center justify-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                Loading servers and tools...
              </div>
            ) : (
              <>
                {/* Mobile Search */}
                <div className="relative sm:hidden">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                  <Input
                    placeholder="Filter tools across servers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-200"
                  />
                </div>

                {/* Server & Tools Permissions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-indigo-400" />
                      MCP Server & Tool Permissions
                    </h3>
                    <span className="text-[11px] text-zinc-500">
                      Toggle servers, action groups, or granular tools
                    </span>
                  </div>

                  {servers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500 font-mono">No MCP servers registered.</div>
                  ) : (
                    <Accordion type="multiple" defaultValue={servers.map((s) => s.id)} className="space-y-3">
                      {servers.map((server) => {
                        const serverAll = isServerAllSelected(server.id);
                        const enabledCount = getEnabledCount(server);

                        // Categorize tools
                        const toolsByAction: Record<string, ToolItem[]> = {
                          all: [],
                          read: [],
                          write: [],
                          delete: [],
                          execute: [],
                        };

                        const query = searchQuery.trim().toLowerCase();
                        for (const tool of server.tools) {
                          if (query && !tool.name.toLowerCase().includes(query) && !tool.namespaced_name.toLowerCase().includes(query)) {
                            continue;
                          }
                          const type = tool.action_type || "write";
                          toolsByAction.all.push(tool);
                          if (!toolsByAction[type]) toolsByAction[type] = [];
                          toolsByAction[type].push(tool);
                        }

                        const currentTab = activeTabs[server.id] || "all";
                        const displayedTools = toolsByAction[currentTab] || toolsByAction.all;

                        return (
                          <AccordionItem
                            key={server.id}
                            value={server.id}
                            className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/40"
                          >
                            <AccordionTrigger className="hover:no-underline py-3 px-4 bg-zinc-900/60 hover:bg-zinc-900 transition-colors">
                              <div className="flex items-center justify-between w-full pr-3">
                                <div className="flex items-center gap-3">
                                  <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400">
                                    <Server className="h-4 w-4" />
                                  </div>
                                  <span className="font-bold text-sm text-zinc-100">{server.name}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[11px] font-mono ${
                                      enabledCount === server.tools.length
                                        ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                        : enabledCount > 0
                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                        : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50"
                                    }`}
                                  >
                                    {enabledCount}/{server.tools.length} Enabled
                                  </Badge>
                                </div>

                                {/* Single Header Toggle Button */}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleServerAllTools(server.id);
                                  }}
                                  className={`h-7 px-3 text-xs font-medium border transition-all gap-1.5 ${
                                    serverAll
                                      ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30"
                                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                                  }`}
                                >
                                  {serverAll ? <CheckSquare className="h-3.5 w-3.5 text-indigo-400" /> : <Square className="h-3.5 w-3.5" />}
                                  <span>All Tools</span>
                                </Button>
                              </div>
                            </AccordionTrigger>

                            <AccordionContent className="p-4 pt-3 space-y-4">
                              {server.tools.length > 0 ? (
                                <Tabs
                                  value={currentTab}
                                  onValueChange={(val) =>
                                    setActiveTabs((prev) => ({ ...prev, [server.id]: val }))
                                  }
                                  className="w-full space-y-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-3">
                                    {/* Action Filter Tabs */}
                                    <TabsList className="bg-zinc-950 border border-zinc-800 p-1 h-9">
                                      <TabsTrigger
                                        value="all"
                                        className="text-xs px-3 data-[state=active]:bg-indigo-600/20 data-[state=active]:text-indigo-300"
                                      >
                                        All ({toolsByAction.all.length})
                                      </TabsTrigger>
                                      {(["read", "write", "delete", "execute"] as const).map((type) => {
                                        const count = toolsByAction[type].length;
                                        if (count === 0 && !query) return null;
                                        const cfg = ACTION_CONFIG[type];
                                        return (
                                          <TabsTrigger
                                            key={type}
                                            value={type}
                                            className={`text-xs px-2.5 gap-1.5 data-[state=active]:${cfg.bg} data-[state=active]:${cfg.text}`}
                                          >
                                            <span>{cfg.label}</span>
                                            <span className="font-mono text-[10px] opacity-80">({count})</span>
                                          </TabsTrigger>
                                        );
                                      })}
                                    </TabsList>

                                    {/* Category Bulk Action Button */}
                                    {currentTab !== "all" && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => toggleActionType(server.id, currentTab)}
                                        className={`h-7 px-3 text-xs font-medium border ${
                                          isActionTypeSelected(server.id, currentTab)
                                            ? `${ACTION_CONFIG[currentTab]?.bg} ${ACTION_CONFIG[currentTab]?.border} ${ACTION_CONFIG[currentTab]?.text}`
                                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                                        }`}
                                      >
                                        {isActionTypeSelected(server.id, currentTab)
                                          ? `Deselect All ${ACTION_CONFIG[currentTab]?.label}`
                                          : `Select All ${ACTION_CONFIG[currentTab]?.label}`}
                                      </Button>
                                    )}
                                  </div>

                                  {/* Tool Grid */}
                                  {displayedTools.length === 0 ? (
                                    <div className="py-6 text-center text-xs text-zinc-500 font-mono">
                                      No tools match the filter criteria.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                      {displayedTools.map((tool) => {
                                        const checked = isToolSelected(server.id, tool.id, tool.action_type);
                                        const type = tool.action_type || "write";
                                        const cfg = ACTION_CONFIG[type];
                                        const Icon = cfg.icon;

                                        return (
                                          <Tooltip key={tool.id}>
                                            <TooltipTrigger asChild>
                                              <button
                                                type="button"
                                                onClick={() => toggleSpecificTool(server.id, tool.id, tool.action_type)}
                                                className={`group flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                                                  checked
                                                    ? `${cfg.bg} ${cfg.border} text-zinc-100 shadow-sm`
                                                    : "bg-zinc-950/60 border-zinc-800/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                                                }`}
                                              >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                                                  <div
                                                    className={`p-1 rounded ${
                                                      checked ? cfg.activeBg : "bg-zinc-900 text-zinc-500"
                                                    }`}
                                                  >
                                                    <Icon className={`h-3.5 w-3.5 ${checked ? cfg.text : "text-zinc-500"}`} />
                                                  </div>
                                                  <span className="text-xs font-mono font-medium truncate group-hover:text-zinc-100">
                                                    {tool.name}
                                                  </span>
                                                </div>

                                                <div
                                                  className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                                                    checked
                                                      ? "bg-indigo-600 border-indigo-500 text-white"
                                                      : "border-zinc-700 bg-zinc-900/80 group-hover:border-zinc-600"
                                                  }`}
                                                >
                                                  {checked && <Check className="h-3 w-3 stroke-[3]" />}
                                                </div>
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-zinc-900 border-zinc-800 text-xs font-mono">
                                              {tool.namespaced_name || tool.name} ({type})
                                            </TooltipContent>
                                          </Tooltip>
                                        );
                                      })}
                                    </div>
                                  )}
                                </Tabs>
                              ) : (
                                <div className="py-2 text-center text-xs text-zinc-500 font-mono">
                                  No tools registered on server.
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  )}
                </div>

                {/* Prompts Permissions */}
                <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
                      Prompt Permissions
                    </h3>
                    <span className="text-[11px] text-zinc-500">
                      Grant access to executable user prompts
                    </span>
                  </div>

                  {prompts.length === 0 ? (
                    <div className="py-4 text-center text-xs text-zinc-500 font-mono">No prompts defined.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {prompts.map((prompt) => {
                        const checked = isPromptSelected(prompt.id);
                        return (
                          <button
                            key={prompt.id}
                            type="button"
                            onClick={() => togglePrompt(prompt.id)}
                            className={`group flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                              checked
                                ? "bg-purple-500/10 border-purple-500/30 text-purple-200 shadow-sm"
                                : "bg-zinc-900/40 border-zinc-800/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <div
                                className={`p-1 rounded ${
                                  checked ? "bg-purple-500/20 text-purple-300" : "bg-zinc-900 text-zinc-500"
                                }`}
                              >
                                <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
                              </div>
                              <div className="truncate">
                                <span className="text-xs font-bold block text-zinc-200 truncate">
                                  {prompt.title || prompt.name}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400">/{prompt.name}</span>
                              </div>
                            </div>

                            <div
                              className={`h-4 w-4 rounded flex items-center justify-center border transition-all ${
                                checked
                                  ? "bg-purple-600 border-purple-500 text-white"
                                  : "border-zinc-700 bg-zinc-900/80 group-hover:border-zinc-600"
                              }`}
                            >
                              {checked && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/60">
            <span className="text-xs text-zinc-400 font-mono">
              <span className="text-indigo-400 font-bold">{selectedPermissions.length}</span> permission rule(s) active
            </span>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || loading}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 px-4"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? "Saving..." : "Save Matrix"}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

