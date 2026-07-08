/**
 * RBAC + module entitlement contracts. Core owns identity/roles/permissions;
 * modules only DECLARE the permissions they need (see ADR-0004).
 */
import type { TenantId } from './primitives';

/** Permission key in the canonical "<module>.<action>" form, e.g. "requests.create". */
export type PermissionKey = string;

/** The set of actions a module allows on each of its resources/sub-modules.
 *  Keys are sub-module names, values the allowed action verbs. Core expands
 *  this into concrete PermissionKeys ("<subModule>.<action>") for the catalog. */
export type ModuleActions = Record<string, readonly string[]>;

/** A role definition a module can contribute defaults for (Core merges them). */
export interface RoleDefaults {
  role: string;
  /** Permission keys granted to this role by default. */
  permissions: readonly PermissionKey[];
}

/**
 * Tenant module entitlement — which business modules a tenant may use.
 * Enforced by Core BEFORE a module's routes/nav are exposed (ADR-0004).
 */
export interface ModuleEntitlement {
  tenantId: TenantId;
  moduleKey: string;
  enabled: boolean;
  /** Optional plan/limit metadata (seats, quotas) owned by Core billing. */
  limits?: Record<string, number>;
}

/** Authorization service Core injects into every module. Never bypass it. */
export interface AuthorizationService {
  /** True if the current principal holds the permission in the active tenant. */
  can(permission: PermissionKey): boolean;
  /** Throws a 403-equivalent if any required permission is missing. */
  require(...permissions: PermissionKey[]): void;
  /** True if the active tenant is entitled to the given module. */
  isModuleEnabled(moduleKey: string): boolean;
}
