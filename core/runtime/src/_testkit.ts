/** Minimal factories for building valid Core-contract objects in tests. */
import type { AICapability, ApiModule, ReportDescriptor, RequestContext, SearchProvider } from '@lumentra/core-contracts';

export function ctx(perms: string[] = [], modules: string[] = []): RequestContext {
  return {
    requestId: 'req-1',
    principal: { userId: 'u1', email: 'a@b.c', isSuperAdmin: false },
    tenant: {
      tenantId: 't1',
      tenantCode: 'T1',
      permissions: new Set(perms),
      enabledModules: new Set(modules),
    },
    locale: 'fa',
  };
}

export function apiModule(key: string, basePath: string, extra: Partial<ApiModule> = {}): ApiModule {
  return {
    key,
    title: key,
    basePath,
    register: async () => ({ router: {} }),
    ...extra,
  };
}

export function report(key: string, permission: string): ReportDescriptor {
  return {
    key,
    module: 'm',
    title: key,
    permission,
    filters: [],
    run: async () => ({ columns: [], data: { rows: [], total: 0, page: 1, totalPages: 1 } }),
  };
}

export function capability(key: string, permission?: string): AICapability {
  return { key, module: 'm', title: key, description: '', params: [], permission, handler: async () => ({}) };
}

export function searchProvider(module: string): SearchProvider {
  return { module, entityType: 'x', label: 'X', search: async () => [] };
}
