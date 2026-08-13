import React, { createContext, useContext, useEffect, useState } from "react";
import type { BackendAdapter, User, AuthStatus } from "../../../lib/api-client";
import { HttpAdapter } from "../../../lib/api-client/HttpAdapter";
import { DesktopAdapter } from "../../../lib/api-client/DesktopAdapter";

interface BackendContextType {
  adapter: BackendAdapter;
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      const status: AuthStatus = await adapter.checkAuth();
      setIsAuthenticated(status.isAuthenticated);
      setUser(status.user || null);
    } catch {
      setIsAuthenticated(false);
      setUser(null);
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

  return (
    <BackendContext.Provider value={{ adapter, isAuthenticated, user, isLoading, login, logout }}>
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
