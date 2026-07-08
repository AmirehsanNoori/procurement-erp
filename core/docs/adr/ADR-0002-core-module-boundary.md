# ADR-0002 — Core↔Module boundary via a Module Registry

**Status:** Accepted

## Context
Today adding capability means editing central files: `server/src/routes/index.ts`,
`web/src/App.tsx`, `web/src/config/nav.ts`, `rbac/permissions.ts`. That does not
scale to many independently-built modules and couples the shell to procurement.

## Decision
Define a **Module Registry** contract (`ApiModule` / `WebModule` in
`@lumentra/core-contracts`). A module **self-declares** its routes, permissions,
role defaults, nav, reports, AI capabilities, search providers, event handlers and
seed. The API app and Web shell **compose** modules through registries; **no
central file is hand-edited** to add a module.

The introduction is **additive and behavior-preserving**: the contracts and Core
are added first; existing code keeps working unchanged; implementations are moved
behind the contracts later in separately-approved, verified steps.

## Consequences
- Uniform extension point for all future modules and for AI/reporting.
- The existing two-tier auth+tenant gate is preserved as the single isolation boundary.
- A short-term duplication (old central wiring + new registry) exists during
  migration and is removed when a capability is fully moved.
