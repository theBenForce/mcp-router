import React, { useEffect, useState } from "react";
import { X, Copy, Check, Terminal, Globe, Layers, Settings2 } from "lucide-react";

interface KeyConfigModalProps {
  isOpen: boolean;
  keyId: string | null;
  keyName: string;
  onClose: () => void;
}

export const KeyConfigModal: React.FC<KeyConfigModalProps> = ({
  isOpen,
  keyId,
  keyName,
  onClose,
}) => {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [includePrompts, setIncludePrompts] = useState(true);
  const [configStyle, setConfigStyle] = useState<"url" | "serverUrl" | "stdio">("url");
  const [routingMode, setRoutingMode] = useState<"per-server" | "aggregated">("per-server");
  const [userKeyToken, setUserKeyToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && keyId) {
      loadData();
    }
  }, [isOpen, keyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/servers");
      const data = await res.json();
      const connected = data.filter((s: any) => s.status === "connected");
      setServers(connected);
      setSelectedServers(connected.map((s: any) => s.id));
    } catch (err) {
      console.error("Failed to load servers for config modal:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !keyId) return null;

  const origin = window.location.origin;
  const tokenPlaceholder = userKeyToken.trim() || "<YOUR_API_KEY>";

  const toggleServer = (id: string) => {
    setSelectedServers((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const generateConfigJson = (): string => {
    const mcpServersConfig: Record<string, any> = {};

    if (routingMode === "per-server") {
      if (includePrompts) {
        const sseUrl = `${origin}/mcp/servers/prompts/sse?key=${tokenPlaceholder}`;
        if (configStyle === "url") {
          mcpServersConfig["prompts"] = { url: sseUrl };
        } else if (configStyle === "serverUrl") {
          mcpServersConfig["prompts"] = { serverUrl: sseUrl };
        } else {
          mcpServersConfig["prompts"] = {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-sse", sseUrl],
          };
        }
      }

      const activeList = servers.filter((s) => selectedServers.includes(s.id));
      for (const s of activeList) {
        const keyNameSlug = s.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
        const sseUrl = `${origin}/mcp/servers/${s.id}/sse?key=${tokenPlaceholder}`;

        if (configStyle === "url") {
          mcpServersConfig[keyNameSlug] = { url: sseUrl };
        } else if (configStyle === "serverUrl") {
          mcpServersConfig[keyNameSlug] = { serverUrl: sseUrl };
        } else {
          mcpServersConfig[keyNameSlug] = {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-sse", sseUrl],
          };
        }
      }
    } else {
      const sseUrl = `${origin}/mcp/sse?key=${tokenPlaceholder}`;
      if (configStyle === "url") {
        mcpServersConfig["mcp-router"] = { url: sseUrl };
      } else if (configStyle === "serverUrl") {
        mcpServersConfig["mcp-router"] = { serverUrl: sseUrl };
      } else {
        mcpServersConfig["mcp-router"] = {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-sse", sseUrl],
        };
      }
    }

    return JSON.stringify({ mcpServers: mcpServersConfig }, null, 2);
  };

  const jsonContent = generateConfigJson();

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-2xl rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-indigo-400" />
              <span>Export Client MCP Config</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Configuring MCP snippet for API Key: <span className="font-semibold text-zinc-200">{keyName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Optional secret key input */}
          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium block">API Key Secret (Optional)</label>
            <input
              type="text"
              placeholder="Paste secret token (e.g. mcpr_...) to populate URLs"
              value={userKeyToken}
              onChange={(e) => setUserKeyToken(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Config Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Format Style */}
            <div className="space-y-2">
              <label className="text-zinc-300 font-medium block">Config Format</label>
              <div className="grid grid-cols-3 gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setConfigStyle("url")}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-all ${
                    configStyle === "url"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  url
                </button>
                <button
                  type="button"
                  onClick={() => setConfigStyle("serverUrl")}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-all ${
                    configStyle === "serverUrl"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  serverUrl
                </button>
                <button
                  type="button"
                  onClick={() => setConfigStyle("stdio")}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-all ${
                    configStyle === "stdio"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  npx stdio
                </button>
              </div>
            </div>

            {/* Routing Mode */}
            <div className="space-y-2">
              <label className="text-zinc-300 font-medium block">Proxy Endpoint Mode</label>
              <div className="grid grid-cols-2 gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setRoutingMode("per-server")}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    routingMode === "per-server"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Per-Server URLs</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRoutingMode("aggregated")}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    routingMode === "aggregated"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Single Aggregated</span>
                </button>
              </div>
            </div>
          </div>

          {/* Server Selections (only if per-server) */}
          {routingMode === "per-server" && (
            <div className="space-y-2 border-t border-zinc-800/60 pt-4">
              <label className="text-zinc-300 font-medium block">Included Servers & Resources</label>
              <div className="flex flex-wrap gap-2 pt-1">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 cursor-pointer hover:border-zinc-700">
                  <input
                    type="checkbox"
                    checked={includePrompts}
                    onChange={(e) => setIncludePrompts(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-0"
                  />
                  <span className="font-semibold text-indigo-300">Prompt Library</span>
                </label>
                {servers.map((s) => (
                  <label
                    key={s.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 cursor-pointer hover:border-zinc-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServers.includes(s.id)}
                      onChange={() => toggleServer(s.id)}
                      className="rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-0"
                    />
                    <span>{s.server_title || s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Code Output Block */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span>Generated Config JSON</span>
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-all font-mono text-[11px]"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Config JSON</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-64 scrollbar-thin">
              {jsonContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
