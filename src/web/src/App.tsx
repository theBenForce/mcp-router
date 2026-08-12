import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";
import { PromptsPage } from "./pages/PromptsPage";
import { KeysPage } from "./pages/KeysPage";
import { AuditPage } from "./pages/AuditPage";
import { TooltipProvider } from "@/components/ui/tooltip";

export const App: React.FC = () => {
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
    initPort().then(() => fetchCounts());
  }, [location.pathname]);

  const fetchCounts = async () => {
    try {
      const [sRes, pRes, kRes] = await Promise.all([
        fetch("/api/servers"),
        fetch("/api/prompts"),
        fetch("/api/keys"),
      ]);
      const [sData, pData, kData] = await Promise.all([sRes.json(), pRes.json(), kRes.json()]);
      setServerCount(sData.length);
      setPromptCount(pData.length);
      setKeyCount(kData.length);
    } catch (e) {
      console.error("Failed to fetch sidebar counts:", e);
    }
  };

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

