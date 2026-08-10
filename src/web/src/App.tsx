import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";
import { KeysPage } from "./pages/KeysPage";
import { AuditPage } from "./pages/AuditPage";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"overview" | "servers" | "keys" | "audit">("overview");
  const [serverCount, setServerCount] = useState(0);
  const [keyCount, setKeyCount] = useState(0);

  useEffect(() => {
    fetchCounts();
  }, [activeTab]);

  const fetchCounts = async () => {
    try {
      const [sRes, kRes] = await Promise.all([fetch("/api/servers"), fetch("/api/keys")]);
      const [sData, kData] = await Promise.all([sRes.json(), kRes.json()]);
      setServerCount(sData.length);
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
        keyCount={keyCount}
      />
      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === "overview" && <OverviewPage onNavigate={setActiveTab} />}
        {activeTab === "servers" && <ServersPage />}
        {activeTab === "keys" && <KeysPage />}
        {activeTab === "audit" && <AuditPage />}
      </main>
    </div>
  );
};

export default App;
