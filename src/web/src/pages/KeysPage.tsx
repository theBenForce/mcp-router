import React, { useEffect, useState } from "react";
import { Plus, Key, ShieldCheck, Trash2, CheckCircle, Ban, Code, Settings2 } from "lucide-react";
import { CreateKeyModal } from "../components/CreateKeyModal";
import { PermissionMatrixModal } from "../components/PermissionMatrixModal";
import { KeyConfigModal } from "../components/KeyConfigModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const KeysPage: React.FC = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [matrixKey, setMatrixKey] = useState<{ id: string; name: string } | null>(null);
  const [configKey, setConfigKey] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keys");
      const data = await res.json();
      setKeys(data);
    } catch (e) {
      console.error("Failed to load API keys:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;
    try {
      await fetch(`/api/keys/${id}`, { method: "DELETE" });
      loadKeys();
    } catch (e) {
      console.error("Failed to revoke key:", e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">API Keys</h1>
          <p className="text-sm text-zinc-400">Generate downstream API keys and configure granular server & tool permissions</p>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-lg shadow-emerald-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Create New API Key</span>
        </Button>
      </div>

      {/* Keys Table */}
      <Card className="glass-panel border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">No API keys created yet.</div>
        ) : (
          <Table>
            <TableHeader className="bg-zinc-950/40 border-b border-zinc-800">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Key Name</TableHead>
                <TableHead className="text-zinc-400">Key Prefix</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Permissions</TableHead>
                <TableHead className="text-zinc-400">Created</TableHead>
                <TableHead className="text-right text-zinc-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id} className="border-zinc-800/60 hover:bg-zinc-900/40">
                  <TableCell className="font-semibold text-zinc-200">{key.name}</TableCell>
                  <TableCell className="font-mono text-emerald-400">{key.key_prefix}...</TableCell>
                  <TableCell>
                    {key.is_active ? (
                      <Badge variant="outline" className="gap-1 font-mono text-[11px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        <CheckCircle className="h-3 w-3" />
                        <span>Active</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 font-mono text-[11px] bg-rose-500/10 text-rose-400 border-rose-500/20">
                        <Ban className="h-3 w-3" />
                        <span>Revoked</span>
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMatrixKey({ id: key.id, name: key.name })}
                      className="gap-1.5 h-8 text-xs font-medium text-indigo-400 border-zinc-800 bg-zinc-900 hover:border-indigo-500/40 hover:bg-zinc-800"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{key.permission_count || 0} rule(s) configured</span>
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-zinc-400">
                    {new Date(key.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfigKey({ id: key.id, name: key.name })}
                        className="gap-1 h-8 text-xs font-medium text-emerald-400 border-zinc-800 bg-zinc-900 hover:border-emerald-500/40 hover:bg-zinc-800"
                        title="Export MCP Config JSON"
                      >
                        <Code className="h-3.5 w-3.5" />
                        <span>Export Config</span>
                      </Button>

                      {key.is_active ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevoke(key.id)}
                          className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          title="Revoke Key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-zinc-600 font-mono text-[11px]">Revoked</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CreateKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadKeys}
      />

      <PermissionMatrixModal
        isOpen={matrixKey !== null}
        keyId={matrixKey?.id || null}
        keyName={matrixKey?.name || ""}
        onClose={() => setMatrixKey(null)}
        onSuccess={loadKeys}
      />

      <KeyConfigModal
        isOpen={configKey !== null}
        keyId={configKey?.id || null}
        keyName={configKey?.name || ""}
        onClose={() => setConfigKey(null)}
      />
    </div>
  );
};
