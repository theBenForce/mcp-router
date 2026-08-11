import React, { useState, useEffect } from "react";
import { Terminal, Play, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";

export interface AuthModalProps {
  isOpen: boolean;
  server: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  server,
  onClose,
  onSuccess,
}) => {
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [output, setOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (server) {
      const authData = server.auth_data || {};
      const config = server.config || {};
      const defaultCmd = authData.command || authData.cliCommand || config.authCommand || "";
      setCommand(defaultCmd);
      setOutput("");
      setStatus("idle");
      setErrorMessage(null);
    }
  }, [server, isOpen]);

  if (!isOpen || !server) return null;

  const handleRunAuth = async () => {
    if (!command.trim()) return;

    setRunning(true);
    setStatus("running");
    setOutput(`$ ${command.trim()}\nRunning authentication command...\n`);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/servers/${server.id}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setOutput(`$ ${command.trim()}\n\n${data.output || "Command executed successfully."}\n\n[System]: Server reconnected successfully.`);
        onSuccess();
      } else {
        setStatus("error");
        setErrorMessage(data.error || "Command returned non-zero exit code.");
        setOutput(`$ ${command.trim()}\n\n${data.output || ""}\n\n[Error]: ${data.error || `Exit code ${data.exitCode}`}`);
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Failed to execute authentication command.");
      setOutput((prev) => `${prev}\n\n[Error]: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !running && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <Terminal className="h-5 w-5 text-indigo-400" />
            CLI Auth - {server.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              CLI Authentication Command
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. uvx garmin-mcp login"
                disabled={running}
                className="bg-zinc-900 border-zinc-800 text-sm font-mono text-zinc-100 focus:border-indigo-500 flex-1"
              />
              <Button
                onClick={handleRunAuth}
                disabled={running || !command.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Execute Auth</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Status Alert */}
          {status === "success" && (
            <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-xs">
              <AlertDescription className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                <span>Authentication successful! Upstream server reconnected.</span>
              </AlertDescription>
            </Alert>
          )}

          {status === "error" && (
            <Alert className="bg-rose-500/10 border-rose-500/20 text-rose-400 text-xs">
              <AlertDescription className="flex items-center gap-2 font-medium">
                <XCircle className="h-4 w-4" />
                <span>{errorMessage || "Authentication command failed."}</span>
              </AlertDescription>
            </Alert>
          )}

          {/* Terminal Output Console */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-400">Terminal Output</label>
              {status !== "idle" && (
                <span className="text-[11px] font-mono text-zinc-500">
                  Status: {status.toUpperCase()}
                </span>
              )}
            </div>
            <pre className="w-full h-64 p-3 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-300 overflow-auto whitespace-pre-wrap">
              {output || "# Output will appear here after execution..."}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={onClose}
            className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
