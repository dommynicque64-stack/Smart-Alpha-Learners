import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, setTokens, clearTokens, getToken } from '../lib/api';

export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions: string[];
}

export interface AppUser {
  id: number;
  auth_user_id: string;
  email: string;
  full_name: string;
  phone?: string;
  role_id: number;
  roles?: Role;
  status: string;
  school_id?: number;
  last_login?: string;
}

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: (email: string, password: string, full_name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (...perms: string[]) => boolean;
  roleName: string;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: async () => {}, logout: async () => {}, bootstrap: async () => {}, refreshUser: async () => {},
  can: () => false, roleName: '',
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try {
      const data = await api<{ user: AppUser }>('/api/auth');
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
    const onExpired = () => setUser(null);
    window.addEventListener('elimu:session-expired', onExpired);
    return () => window.removeEventListener('elimu:session-expired', onExpired);
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await api<{ access_token: string; refresh_token: string; user: AppUser }>('/api/auth', {
      method: 'POST', body: { action: 'login', email, password },
    });
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
  };

  const bootstrap = async (email: string, password: string, full_name: string) => {
    const data = await api<{ access_token: string; refresh_token: string; user: AppUser }>('/api/auth', {
      method: 'POST', body: { action: 'bootstrap', email, password, full_name },
    });
    if (data.access_token) setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
  };

  const logout = async () => {
    try { await api('/api/auth', { method: 'POST', body: { action: 'logout' } }); } catch { /* noop */ }
    clearTokens();
    setUser(null);
  };

  const can = (...perms: string[]) => {
    const granted = user?.roles?.permissions || [];
    if (granted.includes('*')) return true;
    return perms.some((p) => granted.includes(p));
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, bootstrap, refreshUser, can, roleName: user?.roles?.name || '' }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
