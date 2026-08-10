import React, { useEffect, useState } from "react";
import { Plus, Key, ShieldCheck, Trash2, CheckCircle, Ban } from "lucide-react";
import { CreateKeyModal } from "../components/CreateKeyModal";
import { PermissionMatrixModal } from "../components/PermissionMatrixModal";

export const KeysPage: React.FC = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [matrixKey, setMatrixKey] = useState<{ id: string; name: string } | null>(null);
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
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
        >
          <Plus className="h-4 w-4" />
          <span>Create New API Key</span>
        </button>
      </div>

      {/* Keys Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">No API keys created yet.</div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 font-medium">
                <th className="p-4">Key Name</th>
                <th className="p-4">Key Prefix</th>
                <th className="p-4">Status</th>
                <th className="p-4">Permissions</th>
                <th className="p-4">Created</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="p-4 font-semibold text-zinc-200">{key.name}</td>
                  <td className="p-4 font-mono text-emerald-400">{key.key_prefix}...</td>
                  <td className="p-4">
                    {key.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle className="h-3 w-3" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <Ban className="h-3 w-3" />
                        <span>Revoked</span>
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setMatrixKey({ id: key.id, name: key.name })}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium text-indigo-400 hover:border-indigo-500/40 transition-all"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{key.permission_count || 0} rule(s) configured</span>
                    </button>
                  </td>
                  <td className="p-4 font-mono text-zinc-400">
                    {new Date(key.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    {key.is_active ? (
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                        title="Revoke Key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-zinc-600 font-mono text-[11px]">Revoked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
    </div>
  );
};
