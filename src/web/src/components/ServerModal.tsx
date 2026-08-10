import React, { useState, useEffect } from "react";
import { X, Server, Terminal, Globe, Container, Key, Shield, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";

export interface ServerModalProps {
  isOpen: boolean;
  server?: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Minimal docker run command parser for the frontend.
 * Extracts image, env vars, and inferred name from a docker run command string.
 */
function parseDockerRunCommand(cmd: string) {
  const tokens = cmd.trim().split(/\s+/);
  let i = 0;
  if (tokens[0] === "docker") i++;
  if (tokens[i] === "run") i++;

  const env: { key: string; value: string }[] = [];
  const volumes: { hostPath: string; containerPath: string }[] = [];
  let image = "";

  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "-e" || t === "--env") {
      i++;
      if (i < tokens.length) {
        const [k, ...vParts] = tokens[i].split("=");
        env.push({ key: k, value: vParts.join("=") });
      }
    } else if (t === "-v" || t === "--volume") {
      i++;
      if (i < tokens.length) {
        const parts = tokens[i].split(":");
        if (parts.length >= 2) {
          volumes.push({ hostPath: parts[0], containerPath: parts.slice(1).join(":") });
        } else {
          volumes.push({ hostPath: tokens[i], containerPath: tokens[i] });
        }
      }
    } else if (t.startsWith("-")) {
      if (
        t === "-p" || t === "--name" ||
        t === "--network" || t === "--publish" || t === "--user" || t === "--workdir"
      ) {
        i++; // skip value
      }
    } else {
      image = t;
      break;
    }
    i++;
  }

  const parts = image.split("/");
  const basename = parts[parts.length - 1]?.split(":")[0]?.split("@")[0] || "";
  const inferredName = basename.replace(/^mcp[-_]/, "");

  return { image, env, volumes, inferredName };
}

export const ServerModal: React.FC<ServerModalProps> = ({
  isOpen,
  server = null,
  onClose,
  onSuccess,
}) => {
  const isEdit = Boolean(server && server.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transportType, setTransportType] = useState<"stdio" | "docker" | "sse" | "streamable-http">("streamable-http");

  // Stdio fields
  const [command, setCommand] = useState("npx");
  const [argsStr, setArgsStr] = useState("-y @modelcontextprotocol/server-filesystem /data");
  const [image, setImage] = useState("");

  // Remote (SSE / HTTP) fields
  const [url, setUrl] = useState("");

  // Docker / Sidecar shared fields
  const [rawCommand, setRawCommand] = useState("");
  const [dockerImage, setDockerImage] = useState("");
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [volumes, setVolumes] = useState<{ hostPath: string; containerPath: string }[]>([]);

  // Auth fields
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key" | "oauth2">("none");
  const [bearerToken, setBearerToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [headerName, setHeaderName] = useState("X-API-Key");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (server) {
      setName(server.name || "");
      setDescription(server.description || "");
      const tType = server.transport_type || server.transportType || "streamable-http";
      setTransportType(tType);

      const cfg = typeof server.config === "object" && server.config !== null
        ? server.config
        : server.config_json
        ? JSON.parse(server.config_json)
        : {};

      const authData = typeof server.auth_data === "object" && server.auth_data !== null
        ? server.auth_data
        : server.auth_data_json
        ? JSON.parse(server.auth_data_json)
        : {};

      const parseVolumes = (vList: any) => {
        if (Array.isArray(vList)) {
          return vList.map((vStr: string) => {
            const parts = String(vStr).split(":");
            if (parts.length >= 2) {
              return { hostPath: parts[0], containerPath: parts.slice(1).join(":") };
            }
            return { hostPath: String(vStr), containerPath: String(vStr) };
          });
        }
        return [];
      };

      if (tType === "stdio") {
        setCommand(cfg.command || "npx");
        setArgsStr(Array.isArray(cfg.args) ? cfg.args.join(" ") : cfg.args || "");
        setImage(cfg.image || "");
        if (cfg.env && typeof cfg.env === "object") {
          setEnvVars(Object.entries(cfg.env).map(([k, v]) => ({ key: k, value: String(v) })));
        } else {
          setEnvVars([]);
        }
        setVolumes(parseVolumes(cfg.volumes));
      } else if (tType === "docker") {
        setRawCommand(cfg.rawCommand || "");
        setDockerImage(cfg.image || "");
        if (cfg.env && typeof cfg.env === "object") {
          setEnvVars(Object.entries(cfg.env).map(([k, v]) => ({ key: k, value: String(v) })));
        } else {
          setEnvVars([]);
        }
        setVolumes(parseVolumes(cfg.volumes));
      } else {
        setUrl(cfg.url || "");
      }

      const aType = server.auth_type || server.authType || "none";
      setAuthType(aType);
      if (aType === "bearer") {
        setBearerToken(authData.token || "");
      } else if (aType === "api_key") {
        setApiKey(authData.apiKey || "");
        setHeaderName(authData.headerName || "X-API-Key");
      }
    } else {
      // Default initial state for Create mode
      setName("");
      setDescription("");
      setTransportType("streamable-http");
      setCommand("npx");
      setArgsStr("-y @modelcontextprotocol/server-filesystem /data");
      setImage("");
      setUrl("");
      setRawCommand("");
      setDockerImage("");
      setEnvVars([]);
      setVolumes([]);
      setAuthType("none");
      setBearerToken("");
      setApiKey("");
      setHeaderName("X-API-Key");
    }
    setError(null);
  }, [isOpen, server]);

  if (!isOpen) return null;

  const handleRawCommandChange = (value: string) => {
    setRawCommand(value);
    if (value.trim()) {
      const parsed = parseDockerRunCommand(value);
      setDockerImage(parsed.image);
      setEnvVars(parsed.env);
      setVolumes(parsed.volumes);
      if (!name && parsed.inferredName) {
        setName(parsed.inferredName);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let config: Record<string, unknown> = {};

      const volumeStrs: string[] = [];
      for (const vol of volumes) {
        if (vol.hostPath.trim() && vol.containerPath.trim()) {
          volumeStrs.push(`${vol.hostPath.trim()}:${vol.containerPath.trim()}`);
        }
      }

      if (transportType === "stdio") {
        const args = argsStr
          .trim()
          .split(" ")
          .filter((a) => a.length > 0);

        const envObj: Record<string, string> = {};
        for (const ev of envVars) {
          if (ev.key.trim()) {
            envObj[ev.key.trim()] = ev.value;
          }
        }

        config = {
          command: command.trim(),
          args,
          ...(image.trim() ? { image: image.trim() } : {}),
          ...(Object.keys(envObj).length > 0 ? { env: envObj } : {}),
          ...(volumeStrs.length > 0 ? { volumes: volumeStrs } : {}),
        };
      } else if (transportType === "docker") {
        const envObj: Record<string, string> = {};
        for (const ev of envVars) {
          if (ev.key.trim()) {
            envObj[ev.key.trim()] = ev.value;
          }
        }
        config = {
          image: dockerImage.trim(),
          env: envObj,
          ...(rawCommand.trim() ? { rawCommand: rawCommand.trim() } : {}),
          ...(volumeStrs.length > 0 ? { volumes: volumeStrs } : {}),
        };
      } else {
        config = {
          url: url.trim(),
        };
      }

      let authData: Record<string, unknown> = {};
      if (authType === "bearer") {
        authData = { token: bearerToken.trim() };
      } else if (authType === "api_key") {
        authData = { apiKey: apiKey.trim(), headerName: headerName.trim() };
      }

      const endpoint = isEdit ? `/api/servers/${server.id}` : "/api/servers";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          transportType,
          config,
          authType,
          authData,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${isEdit ? "update" : "create"} server`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg shadow-2xl p-0 overflow-hidden flex flex-col max-h-[85vh] gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-zinc-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Server className="h-5 w-5" />
            </div>
            <DialogTitle className="font-semibold text-lg text-zinc-100">
              {isEdit ? "Edit MCP Server" : "Add MCP Server"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-400 font-mono text-xs p-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Server Name *</label>
            <Input
              type="text"
              required
              placeholder="e.g. atlassian, filesystem, github"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 text-sm focus:border-indigo-500"
            />
            <p className="text-[11px] text-zinc-400 mt-1">Used as tool namespace prefix (e.g. atlassian__get_issue)</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Description</label>
            <Input
              type="text"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 text-sm focus:border-indigo-500"
            />
          </div>

          {/* Transport Type Select */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Transport Type *</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransportType("streamable-http")}
                className={`justify-start gap-1.5 p-2.5 h-auto text-xs font-medium transition-all ${
                  transportType === "streamable-http"
                    ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Streamable HTTP (Remote)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransportType("sse")}
                className={`justify-start gap-1.5 p-2.5 h-auto text-xs font-medium transition-all ${
                  transportType === "sse"
                    ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>HTTP / SSE</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransportType("stdio")}
                className={`justify-start gap-1.5 p-2.5 h-auto text-xs font-medium transition-all ${
                  transportType === "stdio"
                    ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Stdio Sidecar</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransportType("docker")}
                className={`justify-start gap-1.5 p-2.5 h-auto text-xs font-medium transition-all ${
                  transportType === "docker"
                    ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <Container className="h-3.5 w-3.5" />
                <span>Docker Container</span>
              </Button>
            </div>
          </div>

          {/* Stdio Specific Inputs */}
          {transportType === "stdio" ? (
            <div className="space-y-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Command *</label>
                <Input
                  type="text"
                  required
                  placeholder="npx, python, uvx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Arguments</label>
                <Input
                  type="text"
                  placeholder="-y @modelcontextprotocol/server-filesystem /data"
                  value={argsStr}
                  onChange={(e) => setArgsStr(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Custom Docker Image (Optional)</label>
                <Input
                  type="text"
                  placeholder="Defaults to node:22-alpine or ghcr.io/astral-sh/uv:python3.12-bookworm-slim"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500"
                />
              </div>

              {/* Environment Variables */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-300">Environment Variables</label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setEnvVars([...envVars, { key: "", value: "" }])}
                    className="h-auto p-0 text-[11px] text-indigo-400 hover:text-indigo-300 gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add</span>
                  </Button>
                </div>
                {envVars.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 font-mono">No environment variables set</p>
                ) : (
                  <div className="space-y-2">
                    {envVars.map((ev, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="KEY"
                          value={ev.key}
                          onChange={(e) => {
                            const updated = [...envVars];
                            updated[idx].key = e.target.value;
                            setEnvVars(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-indigo-500 h-8"
                        />
                        <span className="text-zinc-600 text-xs">=</span>
                        <Input
                          type="text"
                          placeholder="value"
                          value={ev.value}
                          onChange={(e) => {
                            const updated = [...envVars];
                            updated[idx].value = e.target.value;
                            setEnvVars(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-indigo-500 h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEnvVars(envVars.filter((_, i) => i !== idx))}
                          className="h-7 w-7 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Volume Mappings */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-300">Volume Mappings</label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setVolumes([...volumes, { hostPath: "", containerPath: "" }])}
                    className="h-auto p-0 text-[11px] text-indigo-400 hover:text-indigo-300 gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Volume</span>
                  </Button>
                </div>
                {volumes.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 font-mono">No volume mappings configured</p>
                ) : (
                  <div className="space-y-2">
                    {volumes.map((vol, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="/host/path"
                          value={vol.hostPath}
                          onChange={(e) => {
                            const updated = [...volumes];
                            updated[idx].hostPath = e.target.value;
                            setVolumes(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-indigo-500 h-8"
                        />
                        <span className="text-zinc-600 text-xs">:</span>
                        <Input
                          type="text"
                          placeholder="/container/path"
                          value={vol.containerPath}
                          onChange={(e) => {
                            const updated = [...volumes];
                            updated[idx].containerPath = e.target.value;
                            setVolumes(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-indigo-500 h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setVolumes(volumes.filter((_, i) => i !== idx))}
                          className="h-7 w-7 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : transportType === "docker" ? (
            <div className="space-y-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
              {/* Quick Import */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Quick Import — Paste docker run command
                </label>
                <textarea
                  rows={3}
                  placeholder="docker run -i --rm -e KEY=VALUE ghcr.io/org/image:tag"
                  value={rawCommand}
                  onChange={(e) => handleRawCommandChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-cyan-500 resize-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Paste a full docker run command to auto-fill fields below
                </p>
              </div>

              {/* Docker Image */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Docker Image *</label>
                <Input
                  type="text"
                  required
                  placeholder="ghcr.io/org/mcp-server:latest"
                  value={dockerImage}
                  onChange={(e) => setDockerImage(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-cyan-500"
                />
              </div>

              {/* Environment Variables */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-300">Environment Variables</label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setEnvVars([...envVars, { key: "", value: "" }])}
                    className="h-auto p-0 text-[11px] text-cyan-400 hover:text-cyan-300 gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add</span>
                  </Button>
                </div>
                {envVars.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 font-mono">No environment variables set</p>
                ) : (
                  <div className="space-y-2">
                    {envVars.map((ev, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="KEY"
                          value={ev.key}
                          onChange={(e) => {
                            const updated = [...envVars];
                            updated[idx].key = e.target.value;
                            setEnvVars(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-cyan-500 h-8"
                        />
                        <span className="text-zinc-600 text-xs">=</span>
                        <Input
                          type="text"
                          placeholder="value"
                          value={ev.value}
                          onChange={(e) => {
                            const updated = [...envVars];
                            updated[idx].value = e.target.value;
                            setEnvVars(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-cyan-500 h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEnvVars(envVars.filter((_, i) => i !== idx))}
                          className="h-7 w-7 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Volume Mappings */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-300">Volume Mappings</label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setVolumes([...volumes, { hostPath: "", containerPath: "" }])}
                    className="h-auto p-0 text-[11px] text-cyan-400 hover:text-cyan-300 gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Volume</span>
                  </Button>
                </div>
                {volumes.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 font-mono">No volume mappings configured</p>
                ) : (
                  <div className="space-y-2">
                    {volumes.map((vol, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="/host/path"
                          value={vol.hostPath}
                          onChange={(e) => {
                            const updated = [...volumes];
                            updated[idx].hostPath = e.target.value;
                            setVolumes(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-cyan-500 h-8"
                        />
                        <span className="text-zinc-600 text-xs">:</span>
                        <Input
                          type="text"
                          placeholder="/container/path"
                          value={vol.containerPath}
                          onChange={(e) => {
                            const updated = [...volumes];
                            updated[idx].containerPath = e.target.value;
                            setVolumes(updated);
                          }}
                          className="flex-1 bg-zinc-900 border-zinc-800 text-xs font-mono text-zinc-100 focus:border-cyan-500 h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setVolumes(volumes.filter((_, i) => i !== idx))}
                          className="h-7 w-7 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Server Endpoint URL *</label>
                <Input
                  type="url"
                  required
                  placeholder={
                    transportType === "streamable-http"
                      ? "https://mcp.atlassian.com/v1/mcp/authv2"
                      : "https://api.example.com/mcp/sse"
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Authentication Options */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Upstream Server Authentication</label>
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="none">None / Public</option>
              <option value="oauth2">OAuth 2.1 (PKCE / Auto-Discovery)</option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key Header</option>
            </select>
          </div>

          {authType === "oauth2" && (
            <Alert className="bg-indigo-500/10 border-indigo-500/20 text-indigo-300 text-xs">
              <AlertDescription>
                <p className="font-semibold">OAuth 2.1 Auto-Discovery Enabled</p>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  Uses standard Metadata Discovery (RFC 8414/9728) and Dynamic Client Registration (RFC 7591). After adding or updating this server, click "Authenticate" on the server list card to authorize via browser.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {authType === "bearer" && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Bearer Token *</label>
              <Input
                type="password"
                required
                placeholder="eyJhbGciOi..."
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500"
              />
            </div>
          )}

          {authType === "api_key" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Header Name</label>
                <Input
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">API Key *</label>
                <Input
                  type="password"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
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
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Server"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
