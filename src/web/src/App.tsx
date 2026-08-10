import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";
import { PromptsPage } from "./pages/PromptsPage";
import { KeysPage } from "./pages/KeysPage";
import { AuditPage } from "./pages/AuditPage";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"overview" | "servers" | "prompts" | "keys" | "audit">("overview");
  const [serverCount, setServerCount] = useState(0);
  const [promptCount, setPromptCount] = useState(0);
  const [keyCount, setKeyCount] = useState(0);

  useEffect(() => {
    fetchCounts();
  }, [activeTab]);

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
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        serverCount={serverCount}
        promptCount={promptCount}
        keyCount={keyCount}
      />
      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === "overview" && <OverviewPage onNavigate={setActiveTab} />}
        {activeTab === "servers" && <ServersPage />}
        {activeTab === "prompts" && <PromptsPage />}
        {activeTab === "keys" && <KeysPage />}
        {activeTab === "audit" && <AuditPage />}
      </main>
    </div>
  );
};

export default App;
