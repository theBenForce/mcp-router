import React, { useState } from "react";
import { useBackend } from "../lib/BackendContext";
import { Lock, LogIn, Server, ShieldCheck } from "lucide-react";

export function LoginPage() {
  const { login } = useBackend();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Invalid username or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Server className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MCP Router Gateway</h1>
          <p className="text-sm text-slate-400">Sign in to access your server control panel</p>
        </div>

        {error && (
          <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                placeholder="••••••••••••"
              />
              <Lock className="absolute right-3 top-3 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-2 flex items-center justify-center space-x-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Secured with JWT Session Auth</span>
        </div>
      </div>
    </div>
  );
}
