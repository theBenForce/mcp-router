import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";
import { PromptsPage } from "./pages/PromptsPage";
import { KeysPage } from "./pages/KeysPage";
import { AuditPage } from "./pages/AuditPage";
import { LoginPage } from "./components/LoginPage";
import { useBackend } from "./lib/BackendContext";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AlertCircle, RefreshCw, ServerOff, Terminal } from "lucide-react";

export const App: React.FC = () => {
  const { isAuthenticated, isLoading, connectionError, retryConnection } = useBackend();
  const [serverCount, setServerCount] = useState(0);
  const [promptCount, setPromptCount] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const initPort = async () => {
      if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__?.invoke) {
        try {
          const port = await (window as any).__TAURI_INTERNALS__.invoke("get_backend_port");
          if (port && typeof port === "number") {
            (window as any).__ACTIVE_BACKEND_PORT__ = port;
          }
        } catch {}
      }
    };
    if (isAuthenticated) {
      initPort().then(() => fetchCounts());
    }
  }, [location.pathname, isAuthenticated]);

  const fetchCounts = async () => {
    try {
      const [sRes, pRes, kRes] = await Promise.all([
        fetch("/api/servers"),
        fetch("/api/prompts"),
        fetch("/api/keys"),
      ]);
      const [sData, pData, kData] = await Promise.all([sRes.json(), pRes.json(), kRes.json()]);
      if (Array.isArray(sData)) setServerCount(sData.length);
      if (Array.isArray(pData)) setPromptCount(pData.length);
      if (Array.isArray(kData)) setKeyCount(kData.length);
    } catch (e) {
      console.error("Failed to fetch sidebar counts:", e);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading MCP Router...
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans select-none">
        <div className="max-w-md w-full bg-zinc-900/90 border border-red-500/30 rounded-xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <div className="p-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
              <ServerOff className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Backend Server Offline</h2>
              <p className="text-xs text-red-400 font-medium">Configured Port (5170) is in use or unreachable</p>
            </div>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            MCP Router could not connect to the local server on <code className="text-indigo-300 font-mono">http://localhost:5170</code>.
            Another process on your computer is likely using port <strong>5170</strong>, or the backend failed to start.
          </p>

          {connectionError && (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-red-300 whitespace-pre-wrap leading-relaxed">
              {connectionError}
            </div>
          )}

          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800 text-xs text-zinc-400 space-y-1.5">
            <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>How to fix:</span>
            </div>
            <p>1. In your terminal, run <code className="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded font-mono">lsof -i :5170</code> to see which process is using the port.</p>
            <p>2. Stop the conflicting process with <code className="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded font-mono">kill -9 &lt;PID&gt;</code> and click Retry below.</p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => retryConnection()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
        <Sidebar
          serverCount={serverCount}
          promptCount={promptCount}
          keyCount={keyCount}
        />
        <main className="flex-1 p-8 h-full flex flex-col min-h-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/servers" element={<ServersPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/keys" element={<KeysPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </TooltipProvider>
  );
};

export default App;

