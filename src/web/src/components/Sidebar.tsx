import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Server, Key, Activity, Cpu, ShieldCheck, MessageSquare, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsModal } from "./SettingsModal";

interface SidebarProps {
  serverCount: number;
  promptCount: number;
  keyCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  serverCount,
  promptCount,
  keyCount,
}) => {
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const navItems = [
    { path: "/", label: "Overview", icon: Cpu, badge: null },
    { path: "/servers", label: "MCP Servers", icon: Server, badge: serverCount },
    { path: "/prompts", label: "Prompts", icon: MessageSquare, badge: promptCount },
    { path: "/keys", label: "API Keys", icon: Key, badge: keyCount },
    { path: "/audit", label: "Audit Logs", icon: Activity, badge: null },
  ];

  return (
    <>
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
              const isActive =
                item.path === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm hover:bg-indigo-600/20 hover:text-indigo-300"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-zinc-400"}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== null && item.badge > 0 && (
                    <Badge variant="secondary" className="font-mono text-xs font-normal">
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* System Footer & Settings */}
        <div className="space-y-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60 border border-zinc-800/60 transition-all duration-150"
          >
            <Settings className="h-4 w-4 text-zinc-400" />
            <span>App Settings</span>
          </button>

          <div className="px-3 py-3 rounded-lg bg-zinc-900/40 border border-zinc-800/50 text-xs text-zinc-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>Runtime</span>
              <span className="font-mono text-zinc-300">Tauri + Bun</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Database</span>
              <span className="font-mono text-zinc-300">bun:sqlite</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Execution</span>
              <span className="font-mono text-emerald-400">Host stdio</span>
            </div>
          </div>
        </div>
      </aside>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};

;
