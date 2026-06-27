import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { api, setAccessToken } from '../lib/api';

export interface TenantSummary {
  tenantId: string;
  name: string;
  code: string;
  roleName: string;
}

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
}

interface TenantAccess {
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  roleName: string;
  permissions: string[];
}

interface AuthState {
  user: CurrentUser | null;
  tenants: TenantSummary[];
  currentTenantId: string | null;
  permissions: Set<string>;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  can: (permission: string) => boolean;
}

const TENANT_KEY = 'erp.currentTenant';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenants: [],
    currentTenantId: localStorage.getItem(TENANT_KEY),
    permissions: new Set(),
    loading: true,
  });

  const loadAccess = useCallback(async (tenantId: string | null) => {
    const { data } = await api.get('/auth/me', { params: tenantId ? { tenantId } : {} });
    const access: TenantAccess | null = data.access;
    const tenants: TenantSummary[] = data.tenants;
    const chosen = access?.tenantId ?? tenantId ?? tenants[0]?.tenantId ?? null;
    if (chosen) localStorage.setItem(TENANT_KEY, chosen);
    setState((s) => ({
      ...s,
      user: data.user,
      tenants,
      currentTenantId: chosen,
      permissions: new Set(access?.permissions ?? []),
      loading: false,
    }));
  }, []);

  // On mount, try to restore the session via the refresh cookie.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.post('/auth/refresh');
        setAccessToken(res.data.accessToken);
        await loadAccess(localStorage.getItem(TENANT_KEY));
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }
    })();
  }, [loadAccess]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post('/auth/login', { email, password });
      setAccessToken(data.accessToken);
      const tenantId = data.tenants[0]?.tenantId ?? null;
      await loadAccess(tenantId);
    },
    [loadAccess]
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    localStorage.removeItem(TENANT_KEY);
    setState({ user: null, tenants: [], currentTenantId: null, permissions: new Set(), loading: false });
  }, []);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      await loadAccess(tenantId);
    },
    [loadAccess]
  );

  const can = useCallback((permission: string) => state.permissions.has(permission), [state.permissions]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, switchTenant, can }),
    [state, login, logout, switchTenant, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
