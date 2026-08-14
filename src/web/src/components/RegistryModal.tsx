import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Sparkles,
  ExternalLink,
  Github,
  Globe,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Terminal,
  Container,
  Layers,
  ArrowRight,
  Shield,
  Key,
  Eye,
  EyeOff,
  Sliders,
  Check,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import { Alert, AlertDescription } from "./ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { getApiUrl } from "../lib/api";

export interface RegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newServer?: any) => void;
  onOpenCustomEditor?: (prefilledData: any) => void;
}

interface RegistryIcon {
  src: string;
  mimeType?: string;
}

interface RegistryHeader {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  value?: string;
}

interface RegistryRemote {
  type: string;
  url: string;
  headers?: RegistryHeader[];
}

interface RegistryEnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  format?: string;
  default?: string;
}

interface RegistryPackage {
  registryType: string;
  identifier: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type: string };
  packageArguments?: { value?: string; type?: string }[];
  environmentVariables?: RegistryEnvVar[];
}

interface RegistryServerDetail {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url: string; source: string };
  icons?: RegistryIcon[];
  remotes?: RegistryRemote[];
  packages?: RegistryPackage[];
  instructions?: string;
}

interface RegistryServerEntry {
  server: RegistryServerDetail;
  _meta?: {
    "io.modelcontextprotocol.registry/official"?: {
      status?: string;
      isLatest?: boolean;
      publishedAt?: string;
    };
  };
}

type FilterCategory = "all" | "remote" | "npm" | "pypi" | "docker";

export const RegistryModal: React.FC<RegistryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenCustomEditor,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [servers, setServers] = useState<RegistryServerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected server for configuration step
  const [selectedEntry, setSelectedEntry] = useState<RegistryServerEntry | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");
  const [customServerName, setCustomServerName] = useState<string>("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [authToken, setAuthToken] = useState<string>("");
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch servers from official registry API
  const fetchRegistryServers = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(getApiUrl("/api/registry/servers"), window.location.origin);
      if (query.trim()) {
        url.searchParams.set("search", query.trim());
      }
      url.searchParams.set("limit", "40");

      const res = await fetch(url.toString());
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Registry error (${res.status})`);
      }

      const data = await res.json();
      setServers(Array.isArray(data.servers) ? data.servers : []);
    } catch (err: any) {
      setError(err.message || "Failed to load servers from official MCP registry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRegistryServers(debouncedQuery);
    } else {
      setSelectedEntry(null);
      setInstallError(null);
    }
  }, [isOpen, debouncedQuery, fetchRegistryServers]);

  // Available options for currently configured server
  const activeServerOptions = useMemo(() => {
    if (!selectedEntry) return [];
    const server = selectedEntry.server;
    const options: any[] = [];

    // Remotes
    if (Array.isArray(server.remotes)) {
      server.remotes.forEach((remote, i) => {
        const isHttp = remote.type === "streamable-http" || remote.type === "http";
        const hasAuth = (remote.headers || []).some(
          (h) => h.name.toLowerCase() === "authorization" || /token|api[-_]?key/i.test(h.name)
        );
        options.push({
          id: `remote-${i}`,
          type: isHttp ? "streamable-http" : "sse",
          label: isHttp ? "Streamable HTTP Remote" : "SSE Remote",
          description: remote.url,
          transportType: isHttp ? "streamable-http" : "sse",
          executorType: "host",
          url: remote.url,
          headers: remote.headers || [],
          requiresAuth: hasAuth,
        });
      });
    }

    // Packages
    if (Array.isArray(server.packages)) {
      server.packages.forEach((pkg, i) => {
        const regType = (pkg.registryType || "").toLowerCase();
        if (regType === "npm") {
          options.push({
            id: `package-${i}-npm`,
            type: "npm",
            label: "Node.js Package (npm / npx)",
            description: `npx -y ${pkg.identifier}${pkg.version ? `@${pkg.version}` : ""}`,
            transportType: "stdio",
            executorType: "host",
            command: pkg.runtimeHint || "npx",
            args: ["-y", pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier],
            envVars: pkg.environmentVariables || [],
          });
        } else if (regType === "pypi") {
          options.push({
            id: `package-${i}-pypi`,
            type: "pypi",
            label: "Python Package (PyPI / uvx)",
            description: `uvx ${pkg.identifier}`,
            transportType: "stdio",
            executorType: "host",
            command: pkg.runtimeHint || "uvx",
            args: [pkg.identifier],
            envVars: pkg.environmentVariables || [],
          });
        } else if (regType === "oci" || pkg.runtimeHint === "docker") {
          options.push({
            id: `package-${i}-oci`,
            type: "docker",
            label: "Docker Container (OCI)",
            description: pkg.identifier,
            transportType: "docker",
            executorType: "docker",
            image: pkg.identifier,
            envVars: pkg.environmentVariables || [],
          });
        }
      });
    }

    return options;
  }, [selectedEntry]);

  // When user clicks a server card to configure
  const handleSelectServer = (entry: RegistryServerEntry) => {
    setSelectedEntry(entry);
    setInstallError(null);

    // Sanitize default name
    const rawName = entry.server.name || "";
    const parts = rawName.split("/").filter(Boolean);
    const cleanName = (parts[parts.length - 1] || rawName)
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setCustomServerName(cleanName || "mcp-server");

    // Initialize default option
    const server = entry.server;
    let defaultOptId = "";
    if (server.remotes && server.remotes.length > 0) {
      defaultOptId = "remote-0";
    } else if (server.packages && server.packages.length > 0) {
      const p = server.packages[0];
      const reg = (p.registryType || "").toLowerCase();
      defaultOptId = `package-0-${reg === "pypi" ? "pypi" : reg === "oci" ? "oci" : "npm"}`;
    }
    setSelectedOptionId(defaultOptId);

    // Initialize default environment variable values
    const initialEnv: Record<string, string> = {};
    if (server.packages) {
      for (const pkg of server.packages) {
        if (pkg.environmentVariables) {
          for (const ev of pkg.environmentVariables) {
            if (ev.name) {
              initialEnv[ev.name] = ev.default || "";
            }
          }
        }
      }
    }
    setEnvValues(initialEnv);
    setAuthToken("");
  };

  const handleInstallServer = async () => {
    if (!selectedEntry) return;
    setInstalling(true);
    setInstallError(null);

    try {
      const activeOpt = activeServerOptions.find((o) => o.id === selectedOptionId) || activeServerOptions[0];

      let authData: Record<string, any> | undefined;
      if (authToken.trim()) {
        authData = { token: authToken.trim() };
      }

      const payload = {
        server: selectedEntry.server,
        optionId: activeOpt?.id,
        name: customServerName.trim() || undefined,
        env: Object.keys(envValues).length > 0 ? envValues : undefined,
        authData,
      };

      const res = await fetch(getApiUrl("/api/registry/install"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to install server (${res.status})`);
      }

      const createdServer = await res.json();
      onSuccess(createdServer);
      onClose();
    } catch (err: any) {
      setInstallError(err.message || "Failed to install server");
    } finally {
      setInstalling(false);
    }
  };

  const handleOpenCustomEditorFromRegistry = () => {
    if (!selectedEntry || !onOpenCustomEditor) return;

    const activeOpt = activeServerOptions.find((o) => o.id === selectedOptionId) || activeServerOptions[0];
    const server = selectedEntry.server;

    const draftServer: any = {
      name: customServerName.trim() || server.name,
      description: server.description || "",
      serverTitle: server.title || undefined,
      serverVersion: server.version || undefined,
      websiteUrl: server.websiteUrl || server.repository?.url || undefined,
      iconsJson: server.icons && server.icons.length > 0 ? JSON.stringify(server.icons) : undefined,
      transportType: activeOpt?.transportType || "streamable-http",
      executorType: activeOpt?.executorType || "host",
      config: {
        ...(activeOpt?.url ? { url: activeOpt.url } : {}),
        ...(activeOpt?.command ? { command: activeOpt.command } : {}),
        ...(activeOpt?.args ? { args: activeOpt.args } : {}),
        ...(activeOpt?.image ? { image: activeOpt.image } : {}),
        ...(Object.keys(envValues).length > 0 ? { env: envValues } : {}),
      },
      authType: authToken.trim() ? "bearer" : "none",
      authData: authToken.trim() ? { token: authToken.trim() } : {},
    };

    onClose();
    onOpenCustomEditor(draftServer);
  };

  // Filter servers based on category tab
  const filteredServers = useMemo(() => {
    return servers.filter((entry) => {
      const s = entry.server;
      if (filterCategory === "all") return true;
      if (filterCategory === "remote") {
        return Array.isArray(s.remotes) && s.remotes.length > 0;
      }
      if (filterCategory === "npm") {
        return Array.isArray(s.packages) && s.packages.some((p) => (p.registryType || "").toLowerCase() === "npm");
      }
      if (filterCategory === "pypi") {
        return Array.isArray(s.packages) && s.packages.some((p) => (p.registryType || "").toLowerCase() === "pypi");
      }
      if (filterCategory === "docker") {
        return (
          Array.isArray(s.packages) &&
          s.packages.some((p) => (p.registryType || "").toLowerCase() === "oci" || p.runtimeHint === "docker")
        );
      }
      return true;
    });
  }, [servers, filterCategory]);

  const currentOption = activeServerOptions.find((o) => o.id === selectedOptionId) || activeServerOptions[0];

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-4xl shadow-2xl p-0 overflow-hidden flex flex-col h-[85vh] max-h-[85vh] gap-0">
          {/* Modal Top Header */}
          <DialogHeader className="px-6 py-4 border-b border-zinc-800 flex flex-row items-center justify-between shrink-0 bg-zinc-900/80">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-xs">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="font-semibold text-lg text-zinc-100">
                    MCP Registry Explorer
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="bg-indigo-500/10 text-indigo-300 border-indigo-500/30 text-[10px] uppercase font-mono tracking-wider"
                  >
                    Official
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400">
                  Discover and quick-add servers directly from{" "}
                  <a
                    href="https://registry.modelcontextprotocol.io/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                  >
                    registry.modelcontextprotocol.io
                  </a>
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Content Body: Split between Browser and Configure Step */}
          {!selectedEntry ? (
            /* ======================================================== */
            /* 1. BROWSER VIEW: Search, Categories, Grid List           */
            /* ======================================================== */
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Search Bar & Category Filters */}
              <div className="p-4 border-b border-zinc-800/80 space-y-3 bg-zinc-900/40 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    type="search"
                    placeholder="Search MCP servers by name, tools, publisher, or keywords (e.g. github, tandem, memory)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9 h-10 text-sm bg-zinc-900/90 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500/60 focus:ring-indigo-500/20"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1.5 top-1.5 h-7 w-7 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Category Tabs using shadcn Tabs */}
                <Tabs
                  value={filterCategory}
                  onValueChange={(val) => setFilterCategory(val as FilterCategory)}
                  className="w-full"
                >
                  <TabsList className="bg-zinc-900 border border-zinc-800/80 p-1 h-auto flex flex-wrap gap-1">
                    <TabsTrigger
                      value="all"
                      className="text-xs px-3 py-1.5 data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-1.5"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>All Servers</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="remote"
                      className="text-xs px-3 py-1.5 data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-1.5"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>Remote (HTTP / SSE)</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="npm"
                      className="text-xs px-3 py-1.5 data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-1.5"
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      <span>Node.js (npm)</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="pypi"
                      className="text-xs px-3 py-1.5 data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-1.5"
                    >
                      <Cpu className="h-3.5 w-3.5" />
                      <span>Python (uvx / PyPI)</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="docker"
                      className="text-xs px-3 py-1.5 data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-1.5"
                    >
                      <Container className="h-3.5 w-3.5" />
                      <span>Docker (OCI)</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Error / Loading / Server Grid */}
              <ScrollArea className="flex-1 p-4 min-h-0">
                {error && (
                  <Alert variant="destructive" className="mb-4 bg-rose-500/10 border-rose-500/20 text-rose-400 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {loading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-500 font-mono text-xs">
                    <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
                    <span>Searching official MCP registry...</span>
                  </div>
                ) : filteredServers.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center space-y-2">
                    <Layers className="h-10 w-10 text-zinc-600 mb-2" />
                    <div className="text-sm font-medium text-zinc-300">No servers found</div>
                    <p className="text-xs text-zinc-500 max-w-sm">
                      {searchQuery
                        ? `No MCP servers matching "${searchQuery}". Try a different keyword or check the spelling.`
                        : "No servers available in this category."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredServers.map((entry) => {
                      const server = entry.server;
                      const iconUrl = server.icons && server.icons.length > 0 ? server.icons[0].src : null;
                      const hasRemotes = Array.isArray(server.remotes) && server.remotes.length > 0;
                      const hasNpm =
                        Array.isArray(server.packages) &&
                        server.packages.some((p) => (p.registryType || "").toLowerCase() === "npm");
                      const hasPypi =
                        Array.isArray(server.packages) &&
                        server.packages.some((p) => (p.registryType || "").toLowerCase() === "pypi");
                      const hasDocker =
                        Array.isArray(server.packages) &&
                        server.packages.some((p) => (p.registryType || "").toLowerCase() === "oci" || p.runtimeHint === "docker");

                      return (
                        <Card
                          key={`${server.name}-${server.version || "latest"}`}
                          className="glass-panel p-4 border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700/80 transition-all flex flex-col justify-between group rounded-xl gap-3 shadow-xs"
                        >
                          {/* Top info */}
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                {iconUrl ? (
                                  <img
                                    src={iconUrl}
                                    alt={server.title || server.name}
                                    className="h-10 w-10 rounded-lg object-contain bg-zinc-950 border border-zinc-800 p-1 shrink-0"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                                    {(server.title || server.name || "M").charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-semibold text-sm text-zinc-100 truncate group-hover:text-indigo-300 transition-colors">
                                      {server.title || server.name}
                                    </h3>
                                    {server.version && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0 bg-zinc-800 text-zinc-400 font-mono font-normal"
                                      >
                                        v{server.version}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-500 font-mono truncate">{server.name}</div>
                                </div>
                              </div>
                            </div>

                            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                              {server.description || "Official Model Context Protocol server."}
                            </p>
                          </div>

                          {/* Bottom action row */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 mt-1">
                            {/* Transport Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {hasRemotes && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-300 border-blue-500/30"
                                >
                                  Remote
                                </Badge>
                              )}
                              {hasNpm && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-300 border-amber-500/30 font-mono"
                                >
                                  npm
                                </Badge>
                              )}
                              {hasPypi && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-mono"
                                >
                                  uvx
                                </Badge>
                              )}
                              {hasDocker && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 bg-cyan-500/10 text-cyan-300 border-cyan-500/30 font-mono"
                                >
                                  docker
                                </Badge>
                              )}
                            </div>

                            {/* Quick Add Button & Action Links */}
                            <div className="flex items-center gap-1 shrink-0">
                              {server.repository?.url && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a
                                      href={server.repository.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors inline-flex items-center justify-center"
                                    >
                                      <Github className="h-3.5 w-3.5" />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <span>View GitHub Repository</span>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {server.websiteUrl && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a
                                      href={server.websiteUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors inline-flex items-center justify-center"
                                    >
                                      <Globe className="h-3.5 w-3.5" />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <span>View Documentation</span>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleSelectServer(entry)}
                                className="h-7 px-2.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 shadow-sm shadow-indigo-500/20 ml-1"
                              >
                                <span>Quick Add</span>
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            /* ======================================================== */
            /* 2. CONFIGURATION STEP: Options, Env Vars, Auth           */
            /* ======================================================== */
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Header banner showing selected server info */}
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEntry(null)}
                    className="h-8 px-2 text-zinc-400 hover:text-zinc-200"
                  >
                    ← Back to Registry
                  </Button>
                  <div className="h-4 w-[1px] bg-zinc-800" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-100 truncate">
                        {selectedEntry.server.title || selectedEntry.server.name}
                      </span>
                      {selectedEntry.server.version && (
                        <Badge variant="outline" className="text-[10px] font-mono py-0 text-zinc-400">
                          v{selectedEntry.server.version}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono">{selectedEntry.server.name}</span>
                  </div>
                </div>

                {onOpenCustomEditor && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenCustomEditorFromRegistry}
                    className="h-8 text-xs border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 gap-1.5"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    <span>Customize in Full Editor</span>
                  </Button>
                )}
              </div>

              {/* Config Form Body */}
              <ScrollArea className="flex-1 p-6 space-y-6 min-h-0">
                <div className="space-y-6 max-w-2xl mx-auto">
                  {installError && (
                    <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-400 text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <AlertDescription>{installError}</AlertDescription>
                    </Alert>
                  )}

                  {/* Name setting using shadcn Label and Input */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                      Server Identifier (Local Name)
                    </Label>
                    <Input
                      type="text"
                      value={customServerName}
                      onChange={(e) => setCustomServerName(e.target.value)}
                      placeholder="e.g. pretrip or tandem-docs"
                      className="h-9 text-xs bg-zinc-900 border-zinc-800 text-zinc-100 font-mono"
                    />
                    <p className="text-[11px] text-zinc-500">
                      Unique name used to namespace tools in your local MCP Router instance.
                    </p>
                  </div>

                  {/* Transport / Package selector (if multiple available) */}
                  {activeServerOptions.length > 1 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                        Select Transport / Distribution Mode
                      </Label>
                      <div className="grid grid-cols-1 gap-2">
                        {activeServerOptions.map((opt) => {
                          const isSelected = (selectedOptionId || activeServerOptions[0]?.id) === opt.id;
                          return (
                            <div
                              key={opt.id}
                              onClick={() => setSelectedOptionId(opt.id)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? "bg-indigo-600/15 border-indigo-500/50 text-zinc-100"
                                  : "bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-900 text-zinc-400"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                    isSelected ? "border-indigo-500 bg-indigo-600 text-white" : "border-zinc-700"
                                  }`}
                                >
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div>
                                  <div className="text-xs font-medium text-zinc-200">{opt.label}</div>
                                  <div className="text-[11px] text-zinc-500 font-mono">{opt.description}</div>
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase font-mono border-zinc-700 text-zinc-400"
                              >
                                {opt.transportType}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Command Preview */}
                  {currentOption && (
                    <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1.5">
                      <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Configuration Preview:</span>
                      </div>
                      <div className="font-mono text-xs text-indigo-300 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60 break-all select-all">
                        {currentOption.url
                          ? currentOption.url
                          : `${currentOption.command || "npx"} ${(currentOption.args || []).join(" ")}`}
                      </div>
                    </div>
                  )}

                  {/* Remote Auth Header / Token Input */}
                  {currentOption?.headers && currentOption.headers.length > 0 && (
                    <div className="space-y-3 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80">
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                        <Key className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Authentication / API Key</span>
                      </div>
                      {currentOption.headers.map((h: RegistryHeader) => (
                        <div key={h.name} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <Label className="font-mono text-zinc-300">{h.name}</Label>
                            {h.isRequired && (
                              <span className="text-[10px] text-amber-400 font-mono font-medium">Required</span>
                            )}
                          </div>
                          {h.description && <p className="text-[11px] text-zinc-500">{h.description}</p>}
                          <div className="relative">
                            <Input
                              type={visibleSecrets[h.name] ? "text" : "password"}
                              placeholder={h.value || "Enter bearer token or API key..."}
                              value={authToken}
                              onChange={(e) => setAuthToken(e.target.value)}
                              className="pr-10 h-9 text-xs bg-zinc-950 border-zinc-800 font-mono"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setVisibleSecrets((prev) => ({ ...prev, [h.name]: !prev[h.name] }))
                              }
                              className="absolute right-1 top-1 h-7 w-7 text-zinc-500 hover:text-zinc-300"
                            >
                              {visibleSecrets[h.name] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Environment Variables (e.g. for npm/pypi packages) */}
                  {currentOption?.envVars && currentOption.envVars.length > 0 && (
                    <div className="space-y-3 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                          <Key className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Required Environment Variables</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                          {currentOption.envVars.length} variable(s)
                        </Badge>
                      </div>

                      <div className="space-y-3 pt-1">
                        {currentOption.envVars.map((ev: RegistryEnvVar) => {
                          const isSecret = ev.isSecret !== false;
                          const isVisible = visibleSecrets[ev.name];

                          return (
                            <div key={ev.name} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <Label className="font-mono text-zinc-300 font-medium">{ev.name}</Label>
                                {ev.isRequired && (
                                  <span className="text-[10px] text-amber-400 font-mono font-medium">Required</span>
                                )}
                              </div>
                              {ev.description && (
                                <p className="text-[11px] text-zinc-500 leading-tight">{ev.description}</p>
                              )}
                              <div className="relative">
                                <Input
                                  type={isSecret && !isVisible ? "password" : "text"}
                                  placeholder={ev.default ? `Default: ${ev.default}` : `Value for ${ev.name}`}
                                  value={envValues[ev.name] || ""}
                                  onChange={(e) =>
                                    setEnvValues((prev) => ({ ...prev, [ev.name]: e.target.value }))
                                  }
                                  className="pr-10 h-9 text-xs bg-zinc-950 border-zinc-800 font-mono"
                                />
                                {isSecret && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setVisibleSecrets((prev) => ({ ...prev, [ev.name]: !prev[ev.name] }))
                                    }
                                    className="absolute right-1 top-1 h-7 w-7 text-zinc-500 hover:text-zinc-300"
                                  >
                                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Bottom confirmation action bar */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between gap-4 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedEntry(null)}
                  disabled={installing}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleInstallServer}
                  disabled={installing || !customServerName.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-600/20 px-5"
                >
                  {installing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Adding to Router...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Add Server to Router</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
