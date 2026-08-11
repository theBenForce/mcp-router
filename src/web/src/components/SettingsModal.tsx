import React, { useState, useEffect } from "react";
import { Settings, Save, AlertTriangle, Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [port, setPort] = useState<number>(5170);
  const [host, setHost] = useState<string>("0.0.0.0");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setPort(data.port || 5170);
        setHost(data.host || "0.0.0.0");
      }
    } catch {
      // Ignore if offline
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: Number(port), host }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save configuration");
      }

      setSuccessMsg(data.message || "Settings saved.");
    } catch (err: any) {
      setErrorMsg(err.message || "Error saving configuration");
    } finally {
      setLoading(false);
    }
  };

  const configSnippet = `{
  "mcpServers": {
    "mcp-router": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sse",
        "http://localhost:${port}/sse?apiKey=mcpr_YOUR_KEY"
      ]
    }
  }
}`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(configSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px] bg-zinc-950 border-zinc-800 text-zinc-100 p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-100">App Settings</DialogTitle>
              <p className="text-xs text-zinc-400">Configure local router gateway network & port settings</p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-5 mt-4">
          {errorMsg && (
            <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-400 py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
            </Alert>
          )}

          {successMsg && (
            <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 py-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <AlertDescription className="text-xs">{successMsg}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Gateway Port</label>
              <Input
                type="number"
                min={1024}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
              <p className="text-[11px] text-zinc-500">Default: 5170</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Host Binding</label>
              <Input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="bg-zinc-900 border-zinc-800 font-mono text-sm"
              />
              <p className="text-[11px] text-zinc-500">Default: 0.0.0.0</p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-900">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Claude Desktop Config Snippet</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopySnippet}
                className="h-7 text-xs gap-1.5 text-zinc-400 hover:text-zinc-200"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-md text-xs font-mono text-zinc-300 overflow-x-auto">
              {configSnippet}
            </pre>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900">
            <Button type="button" variant="outline" onClick={onClose} className="border-zinc-800 text-zinc-300 hover:bg-zinc-900">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2">
              <Save className="h-4 w-4" />
              {loading ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
