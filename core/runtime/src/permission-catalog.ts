import type { ApiModule, ModuleActions, PermissionKey, RoleDefaults } from '@lumentra/core-contracts';

/**
 * Aggregates the permission catalog and role defaults from all registered
 * modules (ADR-0004), replacing the single hardcoded permission file. Each
 * module declares `ModuleActions` ({ subModule: [actions] }); Core expands them
 * into canonical "<subModule>.<action>" keys and merges module role defaults.
 */

/** Expand one module's ModuleActions into canonical permission keys. */
export function expandModuleActions(actions: ModuleActions): PermissionKey[] {
  const keys: PermissionKey[] = [];
  for (const [subModule, verbs] of Object.entries(actions)) {
    for (const verb of verbs) keys.push(`${subModule}.${verb}`);
  }
  return keys;
}

export interface AggregatedCatalog {
  /** Every permission key across all modules (deduped, sorted). */
  permissions: PermissionKey[];
  /** role name -> granted permission keys (merged across modules). */
  roleDefaults: Record<string, PermissionKey[]>;
}

/** Build the full catalog + merged role defaults from registered modules. */
export function aggregateCatalog(modules: readonly ApiModule[]): AggregatedCatalog {
  const permissions = new Set<PermissionKey>();
  const roleMap = new Map<string, Set<PermissionKey>>();

  for (const mod of modules) {
    if (mod.permissions) {
      for (const key of expandModuleActions(mod.permissions)) permissions.add(key);
    }
    for (const rd of mod.roleDefaults ?? ([] as readonly RoleDefaults[])) {
      const set = roleMap.get(rd.role) ?? new Set<PermissionKey>();
      for (const p of rd.permissions) set.add(p);
      roleMap.set(rd.role, set);
    }
  }

  const roleDefaults: Record<string, PermissionKey[]> = {};
  for (const [role, set] of roleMap) roleDefaults[role] = [...set].sort();

  return { permissions: [...permissions].sort(), roleDefaults };
}
