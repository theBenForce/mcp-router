import React, { createContext, useContext, useEffect, useState } from "react";
import type { BackendAdapter, User, AuthStatus } from "../../../lib/api-client";
import { HttpAdapter } from "../../../lib/api-client/HttpAdapter";
import { DesktopAdapter } from "../../../lib/api-client/DesktopAdapter";

interface BackendContextType {
  adapter: BackendAdapter;
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  connectionError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryConnection: () => Promise<void>;
}

const BackendContext = createContext<BackendContextType | null>(null);

export function getInitialAdapter(): BackendAdapter {
  if (typeof window !== "undefined") {
    const isTauri =
      Boolean((window as any).__TAURI__) ||
      Boolean((window as any).__TAURI_INTERNALS__) ||
      window.location.protocol === "tauri:" ||
      window.location.hostname === "tauri.localhost" ||
      window.location.origin.includes("tauri");

    if (isTauri) {
      return new DesktopAdapter();
    }
  }
  return new HttpAdapter({ baseUrl: "/api" });
}

export function BackendProvider({
  children,
  adapter: customAdapter,
}: {
  children: React.ReactNode;
  adapter?: BackendAdapter;
}) {
  const [adapter] = useState<BackendAdapter>(() => customAdapter || getInitialAdapter());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const checkAuth = async () => {
    setIsLoading(true);
    setConnectionError(null);
    try {
      const status: AuthStatus = await adapter.checkAuth();
      setIsAuthenticated(status.isAuthenticated);
      setUser(status.user || null);
    } catch (err: any) {
      setIsAuthenticated(false);
      setUser(null);

      // Check if Tauri captured a specific startup error from the backend sidecar
      let errorMsg = err.message || "Failed to connect to MCP Router backend.";
      if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__?.invoke) {
        try {
          const tauriErr = await (window as any).__TAURI_INTERNALS__.invoke("get_backend_error");
          if (tauriErr && typeof tauriErr === "string") {
            errorMsg = tauriErr;
          }
        } catch {}
      }
      setConnectionError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, [adapter]);

  const login = async (username: string, password: string) => {
    const res = await adapter.login(username, password);
    setIsAuthenticated(true);
    setUser(res.user);
  };

  const logout = async () => {
    await adapter.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  const retryConnection = async () => {
    await checkAuth();
  };

  return (
    <BackendContext.Provider
      value={{
        adapter,
        isAuthenticated,
        user,
        isLoading,
        connectionError,
        login,
        logout,
        retryConnection,
      }}
    >
      {children}
    </BackendContext.Provider>
  );
}

export function useBackend(): BackendContextType {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error("useBackend must be used within a BackendProvider");
  }
  return context;
}
