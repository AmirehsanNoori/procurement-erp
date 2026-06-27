import { TenantAccess } from '../rbac/access';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user (set by requireAuth). */
      auth?: {
        userId: string;
        email: string;
        isSuperAdmin: boolean;
      };
      /** Resolved tenant context + effective permissions (set by requireTenant). */
      tenant?: TenantAccess;
    }
  }
}

export {};
