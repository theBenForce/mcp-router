import React from "react";
import { Server, Key, Activity, Cpu, ShieldCheck } from "lucide-react";

interface SidebarProps {
  activeTab: "overview" | "servers" | "keys" | "audit";
  setActiveTab: (tab: "overview" | "servers" | "keys" | "audit") => void;
  serverCount: number;
  keyCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  serverCount,
  keyCount,
}) => {
  const navItems = [
    { id: "overview", label: "Overview", icon: Cpu, badge: null },
    { id: "servers", label: "MCP Servers", icon: Server, badge: serverCount },
    { id: "keys", label: "API Keys", icon: Key, badge: keyCount },
    { id: "audit", label: "Audit Logs", icon: Activity, badge: null },
  ];

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-950/80 p-4 flex flex-col justify-between min-h-screen">
      <div>
        {/* App Logo */}
        <div className="flex items-center gap-3 px-3 py-4 mb-6 border-b border-zinc-800/80">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-zinc-100">MCP Router</h1>
            <p className="text-xs text-zinc-400 font-mono">Local Proxy Gateway</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-zinc-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && item.badge > 0 && (
                  <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-zinc-800 text-zinc-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* System Footer Info */}
      <div className="px-3 py-3 rounded-lg bg-zinc-900/40 border border-zinc-800/50 text-xs text-zinc-400 space-y-1">
        <div className="flex items-center justify-between">
          <span>Runtime</span>
          <span className="font-mono text-zinc-300">Bun 1.3</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Database</span>
          <span className="font-mono text-zinc-300">bun:sqlite</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Deployment</span>
          <span className="font-mono text-emerald-400">Docker Local</span>
        </div>
      </div>
    </aside>
  );
};
