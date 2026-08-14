import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { AddServerModal } from "../components/AddServerModal";
import { ServerModal } from "../components/ServerModal";
import { RegistryModal } from "../components/RegistryModal";
import { AuthModal } from "../components/AuthModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { ServerLogsModal } from "../components/ServerLogsModal";
import { TwoPaneLayout } from "../components/TwoPaneLayout";
import { Button } from "@/components/ui/button";
import { useServerEvents, type ServerStatusEventPayload } from "../hooks/useServerEvents";
import { ServerFilterHeader, type StatusFilterOption } from "../components/servers/ServerFilterHeader";
import { ServerList } from "../components/servers/ServerList";
import { ServerDetailPane } from "../components/servers/ServerDetailPane";
import type { ServerItem } from "../components/servers/ServerCard";

export const ServersPage: React.FC = () => {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [selectedServer, setSelectedServer] = useState<ServerItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRegistryModalOpen, setIsRegistryModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerItem | null>(null);
  const [authModalServer, setAuthModalServer] = useState<ServerItem | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [logsModalServer, setLogsModalServer] = useState<ServerItem | null>(null);
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("all");
  const [loading, setLoading] = useState(false);

  const handleStatusChange = useCallback((event: ServerStatusEventPayload) => {
    setServers((prevServers) =>
      prevServers.map((srv) =>
        srv.id === event.serverId
          ? { ...srv, status: event.status, last_error: event.lastError ?? srv.last_error }
          : srv
      )
    );

    if (selectedServer?.id === event.serverId) {
      loadServerDetails(event.serverId);
    }
  }, [selectedServer?.id]);

  useServerEvents({
    onStatusChange: handleStatusChange,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("oauth_error");
    if (err) {
      setAuthError(err);
      window.history.replaceState({}, "", window.location.pathname);
    }
    loadServers();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "MCP_OAUTH_COMPLETE") {
        loadServers();
        if (event.data.serverId) {
          loadServerDetails(event.data.serverId);
        }
        if (event.data.error) {
          setAuthError(event.data.error);
        } else {
          setAuthError(null);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const loadServers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/servers");
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? [...data].sort((a: ServerItem, b: ServerItem) =>
            (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
          )
        : [];
      setServers(sorted);
      if (sorted.length > 0 && !selectedServer) {
        loadServerDetails(sorted[0].id);
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

  const handleOAuthAuthorize = async (id: string) => {
    setAuthError(null);
    const authPath = `/api/oauth/authorize?serverId=${id}`;
    const fullUrl = new URL(authPath, window.location.origin).href;

    const isTauri = Boolean(
      (window as any).__TAURI__ ||
      (window as any).__TAURI_INTERNALS__
    );

    if (isTauri) {
      try {
        const tauri = (window as any).__TAURI__;
        if (tauri?.shell?.open) {
          await tauri.shell.open(fullUrl);
        } else if (tauri?.core?.invoke) {
          await tauri.core.invoke("plugin:shell|open", { path: fullUrl });
        } else if ((window as any).__TAURI_INTERNALS__?.invoke) {
          await (window as any).__TAURI_INTERNALS__.invoke("plugin:shell|open", { path: fullUrl });
        } else {
          window.open(fullUrl, "_blank");
        }
      } catch (err: any) {
        console.error("Tauri shell open failed, falling back to window.open:", err);
        window.open(fullUrl, "_blank");
      }

      const timer = setInterval(() => {
        loadServers();
        if (selectedServer?.id === id) {
          loadServerDetails(id);
        }
      }, 2000);

      setTimeout(() => clearInterval(timer), 180000);
      return;
    }

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      fullUrl,
      "mcp_oauth_auth",
      `width=${width},height=${height},top=${top},left=${left},status=no,menubar=no,toolbar=no`
    );

    if (!popup) {
      window.location.href = fullUrl;
      return;
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        loadServers();
        if (selectedServer?.id) {
          loadServerDetails(selectedServer.id);
        }
      }
    }, 1000);
  };

  const handleDelete = (id: string) => {
    setDeletingServerId(id);
  };

  const confirmDeleteServer = async () => {
    if (!deletingServerId) return;
    try {
      await fetch(`/api/servers/${deletingServerId}`, { method: "DELETE" });
      if (selectedServer?.id === deletingServerId) {
        setSelectedServer(null);
      }
      loadServers();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingServerId(null);
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

  const filteredServers = servers.filter((server) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      server.name.toLowerCase().includes(q) ||
      (server.description && server.description.toLowerCase().includes(q)) ||
      (server.transport_type && server.transport_type.toLowerCase().includes(q)) ||
      (server.executor_type && server.executor_type.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === "all" ? true : server.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <TwoPaneLayout
        title="MCP Servers"
        description="Manage upstream stdio sidecars, remote SSE, and Streamable HTTP OAuth endpoints"
        headerActions={
          <Button
            variant="outline"
            onClick={() => setIsRegistryModalOpen(true)}
            className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border-indigo-500/30 gap-2 shadow-xs"
          >
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>Explore Registry</span>
          </Button>
        }
        actionLabel="Add Custom Server"
        onActionClick={() => setIsAddModalOpen(true)}
        banner={
          authError ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAuthError(null)}
                className="h-7 text-xs text-rose-400 hover:text-rose-200 hover:bg-rose-500/20"
              >
                Dismiss
              </Button>
            </div>
          ) : undefined
        }
        leftHeader={
          <ServerFilterHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onAddClick={() => setIsAddModalOpen(true)}
          />
        }
        leftContent={
          <ServerList
            servers={filteredServers}
            selectedServerId={selectedServer?.id || null}
            loading={loading}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            onSelectServer={loadServerDetails}
            onOpenLogs={(server, e) => {
              e.stopPropagation();
              setLogsModalServer(server);
            }}
            onEditServer={(server, e) => {
              e.stopPropagation();
              setEditingServer(server);
            }}
            onExploreRegistry={() => setIsRegistryModalOpen(true)}
            onAddServer={() => setIsAddModalOpen(true)}
          />
        }
        rightContent={
          <ServerDetailPane
            server={selectedServer}
            onOpenCliAuth={(server) => {
              setAuthModalServer(server);
              setIsAuthModalOpen(true);
            }}
            onOAuthAuthorize={handleOAuthAuthorize}
            onOpenLogs={setLogsModalServer}
            onEdit={setEditingServer}
            onReconnect={handleReconnect}
            onDelete={handleDelete}
            onUpdateToolAction={handleUpdateToolAction}
          />
        }
      />

      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadServers}
      />

      {/* Registry Explorer Modal */}
      <RegistryModal
        isOpen={isRegistryModalOpen}
        onClose={() => setIsRegistryModalOpen(false)}
        onSuccess={(newServer) => {
          loadServers();
          if (newServer?.id) {
            setSelectedServer(newServer);
            loadServerDetails(newServer.id);
          }
        }}
        onOpenCustomEditor={(prefilledData) => {
          setEditingServer(prefilledData);
        }}
      />

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

      <AuthModal
        isOpen={isAuthModalOpen}
        server={authModalServer}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          loadServers();
          if (authModalServer?.id) {
            loadServerDetails(authModalServer.id);
          }
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deletingServerId)}
        title="Delete MCP Server"
        description="Are you sure you want to delete this server configuration? This will also disconnect active sidecars."
        confirmText="Delete Server"
        onClose={() => setDeletingServerId(null)}
        onConfirm={confirmDeleteServer}
      />

      <ServerLogsModal
        isOpen={Boolean(logsModalServer)}
        server={logsModalServer}
        onClose={() => setLogsModalServer(null)}
      />
    </>
  );
};
