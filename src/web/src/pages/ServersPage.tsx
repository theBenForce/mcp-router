import React, { useEffect, useState } from "react";
import { Plus, Server, RefreshCw, Trash2, CheckCircle, XCircle, AlertTriangle, Terminal, Globe, Container, Wrench, Key, Pencil, Eye, Edit3, Trash, Play } from "lucide-react";
import { AddServerModal } from "../components/AddServerModal";
import { ServerModal } from "../components/ServerModal";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const ACTION_BADGES: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
  read: { label: "READ", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", icon: Eye },
  write: { label: "WRITE", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", icon: Edit3 },
  delete: { label: "DELETE", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", icon: Trash },
  execute: { label: "EXEC", bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", icon: Play },
};

export const ServersPage: React.FC = () => {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/servers");
      const data = await res.json();
      setServers(data);
      if (data.length > 0 && !selectedServer) {
        loadServerDetails(data[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch servers:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadServerDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/servers/${id}`);
      const data = await res.json();
      setSelectedServer(data);
    } catch (e) {
      console.error("Failed to load server detail:", e);
    }
  };

  const handleReconnect = async (id: string) => {
    try {
      await fetch(`/api/servers/${id}/connect`, { method: "POST" });
      loadServers();
      if (selectedServer?.id === id) {
        loadServerDetails(id);
      }
    } catch (e) {
      console.error("Reconnect failed:", e);
    }
  };

  const handleOAuthAuthorize = (id: string) => {
    window.location.href = `/api/oauth/authorize?serverId=${id}`;
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this server configuration?")) return;
    try {
      await fetch(`/api/servers/${id}`, { method: "DELETE" });
      setSelectedServer(null);
      loadServers();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleUpdateToolAction = async (toolId: string, actionType: string) => {
    try {
      await fetch(`/api/tools/${toolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_type: actionType }),
      });
      if (selectedServer) {
        loadServerDetails(selectedServer.id);
      }
    } catch (e) {
      console.error("Failed to update tool action type:", e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">MCP Servers</h1>
          <p className="text-sm text-zinc-400">Manage upstream stdio sidecars, remote SSE, and Streamable HTTP OAuth endpoints</p>
        </div>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Add MCP Server</span>
        </Button>
      </div>

      {/* Grid: Server List on Left, Selected Server Detail on Right */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Servers List */}
        <div className="col-span-5 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading servers...</div>
          ) : servers.length === 0 ? (
            <Card className="p-6 glass-panel border-zinc-800 bg-zinc-900/50 text-center text-xs text-zinc-500 font-mono">
              No servers added yet. Click "Add MCP Server" to get started.
            </Card>
          ) : (
            servers.map((server) => {
              const isSelected = selectedServer?.id === server.id;
              return (
                <Card
                  key={server.id}
                  onClick={() => loadServerDetails(server.id)}
                  className={`p-4 cursor-pointer border transition-all ${
                    isSelected
                      ? "bg-indigo-600/10 border-indigo-500/50 shadow-md shadow-indigo-500/5"
                      : "glass-panel bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900/80"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      {server.transport_type === "stdio" ? (
                        <Terminal className="h-4 w-4 text-indigo-400 shrink-0" />
                      ) : server.transport_type === "docker" ? (
                        <Container className="h-4 w-4 text-cyan-400 shrink-0" />
                      ) : (
                        <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                      <div>
                        <h3 className="font-semibold text-sm text-zinc-100">{server.name}</h3>
                        <p className="text-xs text-zinc-400 line-clamp-1">{server.description || "No description"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Edit button on list item */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingServer(server);
                        }}
                        className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                        title="Edit MCP Server"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      {/* Status Badge */}
                      <Badge
                        variant="outline"
                        className={`gap-1 font-mono text-[11px] ${
                          server.status === "connected"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : server.status === "need_auth"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : server.status === "error"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {server.status === "connected" && <CheckCircle className="h-3 w-3" />}
                        {server.status === "need_auth" && <Key className="h-3 w-3" />}
                        {server.status === "error" && <XCircle className="h-3 w-3" />}
                        {server.status === "need_auth" ? "Needs Auth" : server.status}
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Right Column: Server Details & Tools */}
        <div className="col-span-7">
          {selectedServer ? (
            <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
              {/* Server Header & Actions */}
              <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-zinc-100">{selectedServer.name}</h2>
                    {selectedServer.server_version && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        v{selectedServer.server_version}
                      </Badge>
                    )}
                  </div>
                  {selectedServer.server_title && selectedServer.server_title !== selectedServer.name && (
                    <p className="text-xs font-medium text-indigo-400">{selectedServer.server_title}</p>
                  )}
                  <p className="text-xs text-zinc-400">{selectedServer.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedServer.status === "need_auth" || selectedServer.auth_type === "oauth2") && (
                    <Button
                      size="sm"
                      onClick={() => handleOAuthAuthorize(selectedServer.id)}
                      className="gap-1.5 bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20"
                    >
                      <Key className="h-3.5 w-3.5" />
                      <span>Authenticate</span>
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingServer(selectedServer)}
                    className="gap-1.5"
                    title="Edit MCP Server parameters"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleReconnect(selectedServer.id)}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reconnect</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(selectedServer.id)}
                    className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    title="Delete MCP Server"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Config & Metadata Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block mb-1">Transport</span>
                  <span className="font-mono text-zinc-200">{selectedServer.transport_type}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block mb-1">Auth Type</span>
                  <span className="font-mono text-zinc-200">{selectedServer.auth_type}</span>
                </div>
                {selectedServer.server_version && (
                  <div>
                    <span className="text-zinc-500 block mb-1">Server Version</span>
                    <span className="font-mono text-zinc-200">{selectedServer.server_version}</span>
                  </div>
                )}
                {selectedServer.website_url && (
                  <div>
                    <span className="text-zinc-500 block mb-1">Website</span>
                    <a
                      href={selectedServer.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Globe className="h-3 w-3 inline" />
                      <span>{selectedServer.website_url}</span>
                    </a>
                  </div>
                )}
              </div>

              {/* System Instructions if provided by MCP server */}
              {selectedServer.instructions && (
                <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10 space-y-1">
                  <span className="text-[11px] font-semibold tracking-wider text-indigo-400 uppercase block">System Instructions</span>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap">{selectedServer.instructions}</p>
                </div>
              )}

              {/* Docker-specific details */}
              {selectedServer.transport_type === "docker" && selectedServer.config && (
                <div className="space-y-2 p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60">
                  <div>
                    <span className="text-zinc-500 block mb-1 text-xs">Docker Image</span>
                    <span className="font-mono text-zinc-200 text-xs">{selectedServer.config.image}</span>
                  </div>
                  {selectedServer.config.env && Object.keys(selectedServer.config.env).length > 0 && (
                    <div>
                      <span className="text-zinc-500 block mb-1 text-xs">Environment Variables</span>
                      <div className="space-y-1">
                        {Object.entries(selectedServer.config.env).map(([k, v]) => (
                          <div key={k} className="font-mono text-xs text-zinc-300">
                            <span className="text-indigo-400">{k}</span>=<span className="text-zinc-400">{v as string}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedServer.last_error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
                  Error: {selectedServer.last_error}
                </div>
              )}

              {/* Discovered Tools List Grouped by Permission Action */}
              {(() => {
                const toolsByAction: Record<string, any[]> = {
                  read: [],
                  write: [],
                  delete: [],
                  execute: [],
                };
                for (const tool of selectedServer.tools || []) {
                  const type = tool.action_type || "write";
                  if (!toolsByAction[type]) toolsByAction[type] = [];
                  toolsByAction[type].push(tool);
                }

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-400">
                        Discovered Tools ({selectedServer.tools?.length || 0})
                      </h3>
                      <span className="text-[11px] text-zinc-500">Grouped by permission action type</span>
                    </div>

                    {selectedServer.tools?.length === 0 ? (
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
                                            onChange={(e) => handleUpdateToolAction(tool.id, e.target.value)}
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
              })()}
            </Card>
          ) : (
            <Card className="glass-panel border-zinc-800 bg-zinc-900/50 p-12 text-center text-xs text-zinc-500 font-mono">
              Select a server to view details and discovered tools.
            </Card>
          )}
        </div>
      </div>

      {/* Add Modal */}
      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadServers}
      />

      {/* Edit Modal */}
      <ServerModal
        isOpen={Boolean(editingServer)}
        server={editingServer}
        onClose={() => setEditingServer(null)}
        onSuccess={() => {
          loadServers();
          if (editingServer?.id) {
            loadServerDetails(editingServer.id);
          }
        }}
      />
    </div>
  );
};
