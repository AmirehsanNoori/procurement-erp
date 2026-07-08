/**
 * Identity & request context contracts. Core resolves these once per request
 * (auth + tenant gate) and hands an immutable context to the module handler.
 */
import type { PermissionKey } from './rbac.ts';
import type { TenantId, UserId } from './primitives.ts';

/** The authenticated actor (never trust client-supplied identity). */
export interface Principal {
  userId: UserId;
  email: string;
  isSuperAdmin: boolean;
}

/** The active tenant context for the current request. */
export interface TenantContext {
  tenantId: TenantId;
  tenantCode: string;
  /** Effective permission keys for this principal in this tenant. */
  permissions: ReadonlySet<PermissionKey>;
  /** Module keys the tenant is entitled to. */
  enabledModules: ReadonlySet<string>;
}

/**
 * Per-request context passed to module handlers. Carries the request-scoped
 * tenant so Core's data layer can enforce isolation (ADR-0003) without each
 * module re-deriving it. Immutable.
 */
export interface RequestContext {
  requestId: string;
  principal: Principal;
  tenant: TenantContext;
  /** Preferred locale for i18n-aware responses ("fa" | "en" | ...). */
  locale: string;
}
