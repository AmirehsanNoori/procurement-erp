# ADR-0001 — Modular Monolith with workspaces (not microservices)

**Status:** Accepted

## Context
Lumentra One must host many modules (procurement, warehouse, finance, contract,
HR, ticketing, …) developed largely independently, operated by a small team, and
deployable in Iran (Vercel today, possibly a VPS later). Microservices would give
independent deploy/scale but impose distributed transactions, inter-service auth,
orchestration and cost that a small team cannot sustain.

## Decision
Adopt a **modular monolith**: one deployable process, with **hard module
boundaries in code (workspaces) and in the database (schema namespaces)**. Modules
are isolated by contract and convention, not by network.

## Consequences
- Single build/deploy; simple local dev; transactional integrity within a DB.
- Boundaries enforced by the Module Registry + lint/dependency rules, not by process isolation.
- If a module ever needs independent scaling, its clean boundary + soft refs
  (ADR-0009) make later extraction to a service feasible without a rewrite.
- Repo becomes an npm/pnpm **workspaces** monorepo: `packages/*` (core, shared,
  platform-services, core-web), `modules/*`, `apps/{api,web}`.
