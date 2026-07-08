import type { ApiModule } from '@lumentra/core-contracts';
import supplierRoutes from './suppliers.routes';

/**
 * Suppliers — the first Procurement sub-module migrated to a real ApiModule (M4).
 *
 * It self-declares the permissions it needs and returns its router via
 * register(core); the API app mounts it through the Core registry instead of
 * hardcoding the path/permissions centrally. Routes, behavior and DB are
 * unchanged — only the wiring becomes Core-driven. This is the template every
 * other Procurement sub-module follows.
 */
export const suppliersModule: ApiModule = {
  key: 'suppliers',
  title: 'Suppliers',
  basePath: 'suppliers',
  // Mirrors MODULE_ACTIONS.suppliers in rbac/permissions.ts; a test asserts parity
  // so the declaration can never silently drift from the legacy catalog.
  permissions: {
    suppliers: ['view', 'create', 'edit', 'delete', 'export'],
  },
  register() {
    return { router: supplierRoutes };
  },
};
