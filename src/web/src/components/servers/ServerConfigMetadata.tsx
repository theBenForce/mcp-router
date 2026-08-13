import React from "react";
import { Cpu, Container, Globe, Folder } from "lucide-react";
import type { ServerItem } from "./ServerCard";

interface ServerConfigMetadataProps {
  server: ServerItem;
}

export const ServerConfigMetadata: React.FC<ServerConfigMetadataProps> = ({ server }) => {
  return (
    <div className="space-y-6">
      {/* Config & Metadata Details */}
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-zinc-500 block mb-1">Transport</span>
          <span className="font-mono text-zinc-200">{server.transport_type}</span>
        </div>
        <div>
          <span className="text-zinc-500 block mb-1">Execution Mode</span>
          <span className="font-mono text-zinc-200">
            {server.executor_type === "host" ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Cpu className="h-3 w-3 inline" /> Host OS Direct
              </span>
            ) : (
              <span className="text-cyan-400 font-semibold flex items-center gap-1">
                <Container className="h-3 w-3 inline" /> Docker Sidecar
              </span>
            )}
          </span>
        </div>
        <div>
          <span className="text-zinc-500 block mb-1">Auth Type</span>
          <span className="font-mono text-zinc-200">{server.auth_type}</span>
        </div>
        {server.server_version && (
          <div>
            <span className="text-zinc-500 block mb-1">Server Version</span>
            <span className="font-mono text-zinc-200">{server.server_version}</span>
          </div>
        )}
        {server.website_url && (
          <div>
            <span className="text-zinc-500 block mb-1">Website</span>
            <a
              href={server.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-indigo-400 hover:underline flex items-center gap-1"
            >
              <Globe className="h-3 w-3 inline" />
              <span>{server.website_url}</span>
            </a>
          </div>
        )}
      </div>

      {/* System Instructions if provided by MCP server */}
      {server.instructions && (
        <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10 space-y-1">
          <span className="text-[11px] font-semibold tracking-wider text-indigo-400 uppercase block">
            System Instructions
          </span>
          <p className="text-xs text-zinc-300 whitespace-pre-wrap">{server.instructions}</p>
        </div>
      )}

      {/* Sidecar / Docker container details */}
      {(server.transport_type === "docker" || server.transport_type === "stdio") && server.config && (
        <div className="space-y-2 p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60">
          {server.config.cwd && (
            <div>
              <span className="text-zinc-500 block mb-1 text-xs">Working Directory (cwd)</span>
              <span className="font-mono text-indigo-300 text-xs flex items-center gap-1">
                <Folder className="h-3 w-3 inline text-indigo-400" />
                {server.config.cwd}
              </span>
            </div>
          )}
          {server.config.image && (
            <div>
              <span className="text-zinc-500 block mb-1 text-xs">Docker Image</span>
              <span className="font-mono text-zinc-200 text-xs">{server.config.image}</span>
            </div>
          )}
          {server.config.env && Object.keys(server.config.env).length > 0 && (
            <div>
              <span className="text-zinc-500 block mb-1 text-xs">Environment Variables</span>
              <div className="space-y-1">
                {Object.entries(server.config.env).map(([k, v]) => (
                  <div key={k} className="font-mono text-xs text-zinc-300">
                    <span className="text-indigo-400">{k}</span>=<span className="text-zinc-400">{v as string}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {server.config.volumes && Array.isArray(server.config.volumes) && server.config.volumes.length > 0 && (
            <div>
              <span className="text-zinc-500 block mb-1 text-xs">Volume Mappings</span>
              <div className="space-y-1">
                {server.config.volumes.map((vStr: string, idx: number) => {
                  const [h, ...cParts] = vStr.split(":");
                  const c = cParts.join(":");
                  return (
                    <div key={idx} className="font-mono text-xs text-zinc-300">
                      <span className="text-cyan-400">{h}</span>
                      <span className="text-zinc-500"> ➔ </span>
                      <span className="text-zinc-400">{c || h}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
