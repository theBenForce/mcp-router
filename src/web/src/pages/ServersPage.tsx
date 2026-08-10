import React, { useEffect, useState } from "react";
import { Plus, Server, RefreshCw, Trash2, CheckCircle, XCircle, AlertTriangle, Terminal, Globe, Container, Wrench } from "lucide-react";
import { AddServerModal } from "../components/AddServerModal";

export const ServersPage: React.FC = () => {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">MCP Servers</h1>
          <p className="text-sm text-zinc-400">Manage upstream stdio sidecars and remote SSE endpoints</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Add MCP Server</span>
        </button>
      </div>

      {/* Grid: Server List on Left, Selected Server Detail on Right */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Servers List */}
        <div className="col-span-5 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading servers...</div>
          ) : servers.length === 0 ? (
            <div className="p-6 rounded-xl glass-panel text-center text-xs text-zinc-500 font-mono">
              No servers added yet. Click "Add MCP Server" to get started.
            </div>
          ) : (
            servers.map((server) => {
              const isSelected = selectedServer?.id === server.id;
              return (
                <div
                  key={server.id}
                  onClick={() => loadServerDetails(server.id)}
                  className={`p-4 rounded-xl cursor-pointer border transition-all ${
                    isSelected
                      ? "bg-indigo-600/10 border-indigo-500/50 shadow-md shadow-indigo-500/5"
                      : "glass-panel hover:bg-zinc-900/60"
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
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono ${
                        server.status === "connected"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : server.status === "error"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {server.status === "connected" && <CheckCircle className="h-3 w-3" />}
                      {server.status === "error" && <XCircle className="h-3 w-3" />}
                      {server.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Server Details & Tools */}
        <div className="col-span-7">
          {selectedServer ? (
            <div className="glass-panel p-6 rounded-xl space-y-6">
              {/* Server Header & Actions */}
              <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-100">{selectedServer.name}</h2>
                  <p className="text-xs text-zinc-400">{selectedServer.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReconnect(selectedServer.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reconnect</span>
                  </button>
                  <button
                    onClick={() => handleDelete(selectedServer.id)}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Config Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block mb-1">Transport</span>
                  <span className="font-mono text-zinc-200">{selectedServer.transport_type}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block mb-1">Auth Type</span>
                  <span className="font-mono text-zinc-200">{selectedServer.auth_type}</span>
                </div>
              </div>

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

              {/* Discovered Tools List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-400">
                    Discovered Tools ({selectedServer.tools?.length || 0})
                  </h3>
                </div>

                {selectedServer.tools?.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500 font-mono">
                    No tools discovered. Reconnect server to discover tools.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedServer.tools?.map((tool: any) => (
                      <div
                        key={tool.id}
                        className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5 text-indigo-400" />
                            <span className="font-mono text-xs font-semibold text-zinc-200">
                              {tool.namespaced_name}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">({tool.name})</span>
                        </div>
                        {tool.description && (
                          <p className="text-xs text-zinc-400 pl-5">{tool.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-12 rounded-xl text-center text-xs text-zinc-500 font-mono">
              Select a server to view details and discovered tools.
            </div>
          )}
        </div>
      </div>

      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadServers}
      />
    </div>
  );
};
