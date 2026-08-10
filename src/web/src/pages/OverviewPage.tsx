import React, { useEffect, useState } from "react";
import { Server, Key, Wrench, Activity, CheckCircle, AlertTriangle, ArrowRight, Container } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OverviewPageProps {
  onNavigate: (tab: "servers" | "keys" | "audit") => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigate }) => {
  const [servers, setServers] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sRes, kRes, tRes, aRes] = await Promise.all([
        fetch("/api/servers"),
        fetch("/api/keys"),
        fetch("/api/tools"),
        fetch("/api/audit?limit=5"),
      ]);

      const [sData, kData, tData, aData] = await Promise.all([
        sRes.json(),
        kRes.json(),
        tRes.json(),
        aRes.json(),
      ]);

      setServers(sData);
      setKeys(kData);
      setTools(tData);
      setRecentLogs(aData);
    } catch (e) {
      console.error("Failed to load overview data:", e);
    } finally {
      setLoading(false);
    }
  };

  const connectedServersCount = servers.filter((s) => s.status === "connected").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">System Overview</h1>
        <p className="text-sm text-zinc-400">Local MCP Router status, key statistics, and activity</p>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="glass-panel border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              MCP Servers
            </CardTitle>
            <Server className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-zinc-100">{servers.length}</span>
              <span className="text-xs text-emerald-400 font-mono">({connectedServersCount} active)</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Discovered Tools
            </CardTitle>
            <Wrench className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-zinc-100">{tools.length}</div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              API Keys
            </CardTitle>
            <Key className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-zinc-100">{keys.length}</div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Recent Invocations
            </CardTitle>
            <Activity className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-zinc-100">{recentLogs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Section Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Connected Servers Preview */}
        <Card className="glass-panel border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="font-semibold text-sm text-zinc-200">Registered MCP Servers</CardTitle>
            <Button
              variant="link"
              size="sm"
              onClick={() => onNavigate("servers")}
              className="h-auto p-0 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
            >
              <span>Manage</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {servers.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500 font-mono">No servers registered.</div>
            ) : (
              <div className="space-y-2">
                {servers.slice(0, 4).map((server) => (
                  <div
                    key={server.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60"
                  >
                    <div className="flex items-center gap-3">
                      {server.status === "connected" ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      )}
                      <div>
                        <div className="font-medium text-xs text-zinc-200">{server.name}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          {server.transport_type === "docker" ? (
                            <span className="flex items-center gap-1">
                              <Container className="h-3 w-3 text-cyan-400" /> docker
                            </span>
                          ) : (
                            server.transport_type
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[11px] font-normal">
                      {server.tool_count || 0} tools
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Audit Logs */}
        <Card className="glass-panel border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="font-semibold text-sm text-zinc-200">Recent Audit Invocations</CardTitle>
            <Button
              variant="link"
              size="sm"
              onClick={() => onNavigate("audit")}
              className="h-auto p-0 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500 font-mono">No tool invocations recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60 text-xs"
                  >
                    <div>
                      <div className="font-mono text-zinc-200 font-medium">{log.tool_name}</div>
                      <div className="text-[11px] text-zinc-500">
                        Key: <span className="font-mono">{log.key_prefix || "none"}</span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`font-mono text-[11px] border-0 ${
                        log.status === "success"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {log.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
