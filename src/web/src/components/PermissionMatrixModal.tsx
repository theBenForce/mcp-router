import React, { useState, useEffect } from "react";
import { X, ShieldCheck, Server, Wrench, MessageSquare, CheckSquare, Square, Save } from "lucide-react";

interface ServerItem {
  id: string;
  name: string;
  tools: Array<{ id: string; name: string; namespaced_name: string }>;
}

interface PromptItem {
  id: string;
  name: string;
  title?: string;
}

interface PermissionMatrixModalProps {
  isOpen: boolean;
  keyId: string | null;
  keyName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PermissionMatrixModal: React.FC<PermissionMatrixModalProps> = ({
  isOpen,
  keyId,
  keyName,
  onClose,
  onSuccess,
}) => {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<
    Array<{ serverId?: string | null; toolId?: string | null; promptId?: string | null }>
  >([]);
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
      // 1. Fetch servers with their tools & prompts
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

      // 2. Fetch current permissions for key
      const permsRes = await fetch(`/api/keys/${keyId}/permissions`);
      const permsData = await permsRes.json();

      const permsList = permsData.map((p: any) => ({
        serverId: p.server_id || null,
        toolId: p.tool_id || null,
        promptId: p.prompt_id || null,
      }));
      setSelectedPermissions(permsList);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !keyId) return null;

  const isServerSelected = (serverId: string) => {
    return selectedPermissions.some(
      (p) => p.serverId === serverId && (p.toolId === null || p.toolId === undefined)
    );
  };

  const isToolSelected = (serverId: string, toolId: string) => {
    if (isServerSelected(serverId)) return true;
    return selectedPermissions.some((p) => p.serverId === serverId && p.toolId === toolId);
  };

  const isPromptSelected = (promptId: string) => {
    return selectedPermissions.some((p) => p.promptId === promptId);
  };

  const toggleServerAllTools = (serverId: string) => {
    if (isServerSelected(serverId)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p.serverId !== serverId));
    } else {
      const filtered = selectedPermissions.filter((p) => p.serverId !== serverId);
      setSelectedPermissions([...filtered, { serverId, toolId: null }]);
    }
  };

  const toggleSpecificTool = (serverId: string, toolId: string) => {
    if (isServerSelected(serverId)) {
      const server = servers.find((s) => s.id === serverId);
      if (!server) return;
      const otherTools = server.tools
        .filter((t) => t.id !== toolId)
        .map((t) => ({ serverId, toolId: t.id }));
      const filtered = selectedPermissions.filter((p) => p.serverId !== serverId);
      setSelectedPermissions([...filtered, ...otherTools]);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-zinc-100">Permission Matrix</h2>
              <p className="text-xs text-zinc-400">API Key: <span className="text-indigo-400 font-mono">{keyName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
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
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  MCP Server & Tool Permissions
                </h3>
                {servers.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500 font-mono">No MCP servers registered.</div>
                ) : (
                  servers.map((server) => {
                    const serverAll = isServerSelected(server.id);
                    return (
                      <div
                        key={server.id}
                        className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-indigo-400" />
                            <span className="font-semibold text-sm text-zinc-200">{server.name}</span>
                            <span className="text-xs text-zinc-400 font-mono">({server.tools.length} tools)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleServerAllTools(server.id)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                              serverAll
                                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {serverAll ? <CheckSquare className="h-3.5 w-3.5 text-indigo-400" /> : <Square className="h-3.5 w-3.5" />}
                            <span>All Tools Enabled</span>
                          </button>
                        </div>

                        {server.tools.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/60">
                            {server.tools.map((tool) => {
                              const checked = isToolSelected(server.id, tool.id);
                              return (
                                <button
                                  key={tool.id}
                                  type="button"
                                  onClick={() => toggleSpecificTool(server.id, tool.id)}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                    checked
                                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                                      : "bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:text-zinc-300"
                                  }`}
                                >
                                  <Wrench className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                  <span className="text-xs font-mono truncate">{tool.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
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
                  <div className="grid grid-cols-2 gap-2">
                    {prompts.map((prompt) => {
                      const checked = isPromptSelected(prompt.id);
                      return (
                        <button
                          key={prompt.id}
                          type="button"
                          onClick={() => togglePrompt(prompt.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/40">
          <span className="text-xs text-zinc-400 font-mono">
            {selectedPermissions.length} rule(s) configured
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? "Saving..." : "Save Matrix"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

