"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandModuleActions = expandModuleActions;
exports.aggregateCatalog = aggregateCatalog;
/**
 * Aggregates the permission catalog and role defaults from all registered
 * modules (ADR-0004), replacing the single hardcoded permission file. Each
 * module declares `ModuleActions` ({ subModule: [actions] }); Core expands them
 * into canonical "<subModule>.<action>" keys and merges module role defaults.
 */
/** Expand one module's ModuleActions into canonical permission keys. */
function expandModuleActions(actions) {
    const keys = [];
    for (const [subModule, verbs] of Object.entries(actions)) {
        for (const verb of verbs)
            keys.push(`${subModule}.${verb}`);
    }
    return keys;
}
/** Build the full catalog + merged role defaults from registered modules. */
function aggregateCatalog(modules) {
    const permissions = new Set();
    const roleMap = new Map();
    for (const mod of modules) {
        if (mod.permissions) {
            for (const key of expandModuleActions(mod.permissions))
                permissions.add(key);
        }
        for (const rd of mod.roleDefaults ?? []) {
            const set = roleMap.get(rd.role) ?? new Set();
            for (const p of rd.permissions)
                set.add(p);
            roleMap.set(rd.role, set);
        }
    }
    const roleDefaults = {};
    for (const [role, set] of roleMap)
        roleDefaults[role] = [...set].sort();
    return { permissions: [...permissions].sort(), roleDefaults };
}
