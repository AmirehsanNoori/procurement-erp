# ADR-0004 — RBAC aggregation + per-tenant module entitlements

**Status:** Accepted

## Context
RBAC works (109 permissions, 3 roles, per-user overrides) but the catalog is a
single hardcoded file, roles are global (no per-tenant roles), and there is no
concept of which **modules** a tenant may use.

## Decision
1. **Permission catalog is aggregated** from each module's declared
   `ModuleActions` + `roleDefaults` (via the registry) instead of one central list.
2. Add **`TenantModule` entitlements**: Core gates a module's routes and nav on
   `tenant.enabledModules`. Modules with `entitlementRequired = true` are invisible
   to non-entitled tenants.
3. Keep `resolveTenantAccess` (role defaults ⊕ DB grants ⊕ per-user overrides) but
   **cache** the result per `userId:tenantId` per request to cut 4–6 DB round trips.
4. Introduce **per-tenant custom roles** (roles gain optional `tenantId`), so a
   tenant can define roles without affecting others. System roles remain global.

## Consequences
- Enabling a module for a tenant is a data change, not a deploy.
- Adding a module contributes its permissions automatically.
- Authorization stays centralized; the `users` module's ad-hoc guard is replaced by the shared resolver.
