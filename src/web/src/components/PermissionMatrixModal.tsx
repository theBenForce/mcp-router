import React, { useState, useEffect } from "react";
import { X, ShieldCheck, Server, Wrench, MessageSquare, CheckSquare, Square, Save, Eye, Edit3, Trash, Play } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

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

const ACTION_BADGES: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
  read: { label: "READ", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", icon: Eye },
  write: { label: "WRITE", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", icon: Edit3 },
  delete: { label: "DELETE", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", icon: Trash },
  execute: { label: "EXEC", bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", icon: Play },
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
      serverItems.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
      );
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

  const normalizePermissions = (rawPermissions: PermissionRule[]): PermissionRule[] => {
    const result: PermissionRule[] = [];
    const serverMap = new Map<string, PermissionRule[]>();
    const promptRules: PermissionRule[] = [];

    for (const rule of rawPermissions) {
      if (rule.promptId) {
        promptRules.push({ promptId: rule.promptId });
        continue;
      }
      if (!rule.serverId) continue;

      if (!serverMap.has(rule.serverId)) {
        serverMap.set(rule.serverId, []);
      }
      serverMap.get(rule.serverId)!.push(rule);
    }

    for (const [serverId, rules] of serverMap.entries()) {
      const server = servers.find((s) => s.id === serverId);

      // If server has an explicit "all tools" rule
      if (rules.some((r) => !r.toolId && (!r.actionType && !r.action_type))) {
        result.push({ serverId, toolId: null, actionType: null });
        continue;
      }

      if (!server || server.tools.length === 0) {
        result.push(...rules);
        continue;
      }

      const totalToolsCount = server.tools.length;
      const selectedToolIds = new Set<string>();

      for (const t of server.tools) {
        const type = t.action_type || "write";
        const isSelectedByAction = rules.some(
          (r) => !r.toolId && (r.actionType === type || r.action_type === type)
        );
        const isSelectedByToolId = rules.some((r) => r.toolId === t.id);
        if (isSelectedByAction || isSelectedByToolId) {
          selectedToolIds.add(t.id);
        }
      }

      // If ALL server tools are selected -> compress to a single server-wide rule
      if (selectedToolIds.size === totalToolsCount && totalToolsCount > 0) {
        result.push({ serverId, toolId: null, actionType: null });
        continue;
      }

      // Group server tools by action_type
      const actionCategories = (["read", "write", "delete", "execute"] as const);
      for (const cat of actionCategories) {
        const catTools = server.tools.filter((t) => (t.action_type || "write") === cat);
        if (catTools.length === 0) continue;

        const catSelectedTools = catTools.filter((t) => selectedToolIds.has(t.id));

        if (catSelectedTools.length === catTools.length) {
          // ALL tools in this action category selected -> store category rule
          result.push({ serverId, toolId: null, actionType: cat });
        } else {
          // Partial category selection -> store specific toolId rules
          for (const t of catSelectedTools) {
            result.push({ serverId, toolId: t.id });
          }
        }
      }
    }

    return [...result, ...promptRules];
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const normalizedPermissions = normalizePermissions(selectedPermissions);
      const res = await fetch(`/api/keys/${keyId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: normalizedPermissions }),
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 w-[92vw] sm:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 shadow-2xl">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-zinc-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Permission Matrix</DialogTitle>
              <p className="text-xs text-zinc-400 mt-0.5">API Key: <span className="text-indigo-400 font-mono">{keyName}</span></p>
            </div>
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
            <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading servers and tools...</div>
          ) : (
            <>
              {/* Server & Tools Permissions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    MCP Server & Tool Action Permissions
                  </h3>
                  <span className="text-[11px] text-zinc-500">Expand Accordion items to configure permission tiers per action type</span>
                </div>

                {servers.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500 font-mono">No MCP servers registered.</div>
                ) : (
                  <Accordion type="multiple" className="space-y-3">
                    {servers.map((server) => {
                      const serverAll = isServerAllSelected(server.id);

                      // Group tools by action_type
                      const toolsByAction: Record<string, ToolItem[]> = {
                        read: [],
                        write: [],
                        delete: [],
                        execute: [],
                      };
                      for (const tool of server.tools) {
                        const type = tool.action_type || "write";
                        if (!toolsByAction[type]) toolsByAction[type] = [];
                        toolsByAction[type].push(tool);
                      }

                      return (
                        <AccordionItem key={server.id} value={server.id} className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/60 px-4">
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex items-center justify-between w-full pr-2">
                              <div className="flex items-center gap-2">
                                <Server className="h-4 w-4 text-indigo-400" />
                                <span className="font-semibold text-sm text-zinc-200">{server.name}</span>
                                <span className="text-xs text-zinc-400 font-mono">({server.tools.length} tools)</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                {/* All Tools Toggle */}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleServerAllTools(server.id)}
                                  className={`h-7 px-2.5 text-xs font-medium border transition-all ${
                                    serverAll
                                      ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                                  }`}
                                >
                                  {serverAll ? <CheckSquare className="h-3 w-3 text-indigo-400" /> : <Square className="h-3 w-3" />}
                                  <span>All Tools</span>
                                </Button>

                                {/* Read/Write/Delete/Exec Action Type Toggles */}
                                {(["read", "write", "delete", "execute"] as const).map((type) => {
                                  const count = toolsByAction[type].length;
                                  if (count === 0) return null;
                                  const selected = isActionTypeSelected(server.id, type);
                                  const badge = ACTION_BADGES[type];
                                  const Icon = badge.icon;
                                  return (
                                    <Button
                                      key={type}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => toggleActionType(server.id, type)}
                                      className={`h-7 px-2 text-xs font-medium border transition-all ${
                                        selected
                                          ? `${badge.bg} ${badge.border} ${badge.text}`
                                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                                      }`}
                                      title={`Toggle all ${type} tools on ${server.name}`}
                                    >
                                      <Icon className="h-3 w-3" />
                                      <span>{badge.label} ({count})</span>
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          </AccordionTrigger>

                          <AccordionContent>
                            {/* Categorized Tools Nested Accordion Groups */}
                            {server.tools.length > 0 ? (
                              <Accordion type="multiple" className="space-y-2 pt-2">
                                {(["read", "write", "delete", "execute"] as const).map((type) => {
                                  const categoryTools = toolsByAction[type];
                                  if (categoryTools.length === 0) return null;
                                  const badge = ACTION_BADGES[type];
                                  const Icon = badge.icon;
                                  const actionSelected = isActionTypeSelected(server.id, type);

                                  return (
                                    <AccordionItem key={type} value={`${server.id}:${type}`} className="border border-zinc-800/40 rounded-lg px-3 bg-zinc-950/40">
                                      <AccordionTrigger className="hover:no-underline py-2">
                                        <div className="flex items-center justify-between w-full pr-2">
                                          <div className="flex items-center gap-2">
                                            <Icon className={`h-3.5 w-3.5 ${badge.text}`} />
                                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                                              {type} Tools
                                            </span>
                                            <Badge variant="outline" className={`text-[10px] font-mono ${badge.bg} ${badge.text} ${badge.border}`}>
                                              {categoryTools.length} tool(s)
                                            </Badge>
                                          </div>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleActionType(server.id, type);
                                            }}
                                            className={`h-6 text-[11px] font-medium px-2 border transition-all ${
                                              actionSelected
                                                ? `${badge.bg} ${badge.border} ${badge.text}`
                                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                                            }`}
                                          >
                                            {actionSelected ? "Group Selected" : "Select Group"}
                                          </Button>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1 pb-1">
                                          {categoryTools.map((tool) => {
                                            const checked = isToolSelected(server.id, tool.id, tool.action_type);
                                            return (
                                              <Button
                                                key={tool.id}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => toggleSpecificTool(server.id, tool.id, tool.action_type)}
                                                className={`h-auto justify-between px-2.5 py-1.5 text-left border transition-all ${
                                                  checked
                                                    ? `${badge.bg} ${badge.border} ${badge.text}`
                                                    : "bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:text-zinc-300"
                                                }`}
                                              >
                                                <div className="flex items-center gap-2 truncate">
                                                  <Wrench className="h-3 w-3 shrink-0 opacity-70" />
                                                  <span className="text-xs font-mono truncate">{tool.name}</span>
                                                </div>
                                                <Badge variant="outline" className={`text-[9px] font-mono px-1 uppercase ${badge.bg} ${badge.text} ${badge.border}`}>
                                                  {type}
                                                </Badge>
                                              </Button>
                                            );
                                          })}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  );
                                })}
                              </Accordion>
                            ) : (
                              <div className="py-2 text-center text-xs text-zinc-500 font-mono">No tools registered on server.</div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>

              {/* Prompts Permissions */}
              <div className="space-y-3 pt-4 border-t border-zinc-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Prompt Permissions
                </h3>
                {prompts.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500 font-mono">No prompts defined.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {prompts.map((prompt) => {
                      const checked = isPromptSelected(prompt.id);
                      return (
                        <Button
                          key={prompt.id}
                          type="button"
                          variant="outline"
                          onClick={() => togglePrompt(prompt.id)}
                          className={`h-auto justify-start gap-2 px-3 py-2 text-left border transition-all ${
                            checked
                              ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                              : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-300"
                          }`}
                        >
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                          <div className="truncate">
                            <span className="text-xs font-semibold block text-zinc-200">{prompt.title || prompt.name}</span>
                            <span className="text-[10px] font-mono text-zinc-400">/{prompt.name}</span>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/40">
          <span className="text-xs text-zinc-400 font-mono">
            {selectedPermissions.length} rule(s) configured
          </span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || loading}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? "Saving..." : "Save Matrix"}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
