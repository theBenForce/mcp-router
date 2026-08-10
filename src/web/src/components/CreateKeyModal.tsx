import React, { useState } from "react";
import { Key, Copy, Check, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";

interface CreateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateKeyModal: React.FC<CreateKeyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create API key");
      }

      const data = await res.json();
      setCreatedSecret(data.secretKey);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (createdSecret) {
      navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = () => {
    setCreatedSecret(null);
    setName("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDone()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md shadow-2xl p-0 overflow-hidden flex flex-col gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-zinc-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Key className="h-5 w-5" />
            </div>
            <DialogTitle className="font-semibold text-lg text-zinc-100">
              {createdSecret ? "API Key Generated" : "Create New API Key"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Content */}
        {createdSecret ? (
          <div className="p-6 space-y-4">
            <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-400 text-xs">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Please copy your API key now. <strong>It will never be shown again!</strong>
              </AlertDescription>
            </Alert>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Secret Key Token</label>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400 break-all">
                <span className="flex-1">{createdSecret}</span>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={copyToClipboard}
                  className="h-7 w-7 shrink-0"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <Button
                onClick={handleDone}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/20"
              >
                I Have Saved My Key
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-400 font-mono text-xs p-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Key Name / Label *</label>
              <Input
                type="text"
                required
                placeholder="e.g. Cursor IDE, Claude Desktop, Production Agent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-sm text-zinc-100 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Key"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
