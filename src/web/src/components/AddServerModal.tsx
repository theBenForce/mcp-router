import React, { useState } from "react";
import { X, Server, Terminal, Globe, Key, Shield } from "lucide-react";

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddServerModal: React.FC<AddServerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transportType, setTransportType] = useState<"stdio" | "sse">("stdio");

  // Stdio fields
  const [command, setCommand] = useState("npx");
  const [argsStr, setArgsStr] = useState("-y @modelcontextprotocol/server-filesystem /data");
  const [image, setImage] = useState("");

  // SSE fields
  const [url, setUrl] = useState("");

  // Auth fields
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key">("none");
  const [bearerToken, setBearerToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [headerName, setHeaderName] = useState("X-API-Key");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let config: Record<string, unknown> = {};

      if (transportType === "stdio") {
        const args = argsStr
          .trim()
          .split(" ")
          .filter((a) => a.length > 0);

        config = {
          command: command.trim(),
          args,
          ...(image.trim() ? { image: image.trim() } : {}),
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

      const res = await fetch("/api/servers", {
        method: "POST",
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
        throw new Error(data.error || "Failed to create server");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Server className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg text-zinc-100">Add MCP Server</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Server Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. filesystem, github, slack"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-zinc-400 mt-1">Used as tool namespace prefix (e.g. filesystem__read_file)</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Description</label>
            <input
              type="text"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Transport Type Select */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Transport Type *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTransportType("stdio")}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                  transportType === "stdio"
                    ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Terminal className="h-4 w-4" />
                <span>Stdio (Docker Sidecar)</span>
              </button>
              <button
                type="button"
                onClick={() => setTransportType("sse")}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                  transportType === "sse"
                    ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Globe className="h-4 w-4" />
                <span>HTTP / SSE Endpoint</span>
              </button>
            </div>
          </div>

          {/* Stdio Specific Inputs */}
          {transportType === "stdio" ? (
            <div className="space-y-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Command *</label>
                <input
                  type="text"
                  required
                  placeholder="npx, python, uvx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Arguments</label>
                <input
                  type="text"
                  placeholder="-y @modelcontextprotocol/server-filesystem /data"
                  value={argsStr}
                  onChange={(e) => setArgsStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Custom Docker Image (Optional)</label>
                <input
                  type="text"
                  placeholder="Defaults to node:22-alpine or python:3.12-slim"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">SSE Endpoint URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.example.com/mcp/sse"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
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
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="none">None / Public</option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key Header</option>
            </select>
          </div>

          {authType === "bearer" && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Bearer Token *</label>
              <input
                type="password"
                required
                placeholder="eyJhbGciOi..."
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {authType === "api_key" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Header Name</label>
                <input
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">API Key *</label>
                <input
                  type="password"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {loading ? "Connecting..." : "Add Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
