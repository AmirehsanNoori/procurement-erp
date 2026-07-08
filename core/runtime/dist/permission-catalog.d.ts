import type { ApiModule, ModuleActions, PermissionKey } from '@lumentra/core-contracts';
/**
 * Aggregates the permission catalog and role defaults from all registered
 * modules (ADR-0004), replacing the single hardcoded permission file. Each
 * module declares `ModuleActions` ({ subModule: [actions] }); Core expands them
 * into canonical "<subModule>.<action>" keys and merges module role defaults.
 */
/** Expand one module's ModuleActions into canonical permission keys. */
export declare function expandModuleActions(actions: ModuleActions): PermissionKey[];
export interface AggregatedCatalog {
    /** Every permission key across all modules (deduped, sorted). */
    permissions: PermissionKey[];
    /** role name -> granted permission keys (merged across modules). */
    roleDefaults: Record<string, PermissionKey[]>;
}
/** Build the full catalog + merged role defaults from registered modules. */
export declare function aggregateCatalog(modules: readonly ApiModule[]): AggregatedCatalog;
