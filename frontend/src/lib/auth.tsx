"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearTokens, setTokens } from "./api";
import type { Role, User } from "./types";

type AuthState = {
  user: User | null;
  loading: boolean;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  demoLogin: (role: Role) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<User>("/api/auth/me/");
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("pipelinehq_access");
    if (!token) {
      setLoading(false);
      return;
    }
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  const loginWithPassword = useCallback(async (username: string, password: string) => {
    const tokens = await api<{ access: string; refresh: string }>("/api/auth/token/", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ username, password }),
    });
    setTokens(tokens.access, tokens.refresh);
    await refreshMe();
  }, [refreshMe]);

  const demoLogin = useCallback(async (role: Role) => {
    const data = await api<{ access: string; refresh: string; user: User }>("/api/auth/demo-login/", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ role }),
    });
    setTokens(data.access, data.refresh);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, loginWithPassword, demoLogin, logout, refreshMe }),
    [user, loading, loginWithPassword, demoLogin, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
