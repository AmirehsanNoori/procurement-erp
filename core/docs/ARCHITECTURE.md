# Core Platform Architecture

Lumentra One is a **modular monolith**: one deployable, with strong **code and
database boundaries** between a shared **Core** and independent **business
modules**. This document explains how Core works and how a module attaches. Every
decision here has a corresponding record in [`adr/`](adr/).

## 1. Layering

```
┌──────────────────────────────────────────────────────────────┐
│ Web shell (core-web)         │ API app (apps/api)             │
│  router assembly, Layout,    │  express bootstrap, auth+tenant│
│  nav/search/notif providers  │  gate, module mounting          │
├──────────────────────────────┴────────────────────────────────┤
│                @lumentra/core-contracts  (this package)         │
│   ApiModule · WebModule · CoreServices · Reporting · AI · …     │
├────────────────────────────────────────────────────────────────┤
│ CORE PLATFORM (module-agnostic)                                 │
│  Auth · RBAC · Tenants · Entitlements · Workflow · Approvals ·  │
│  Notifications · Audit · Documents · Timeline · Reporting ·     │
│  AI Registry · Event Bus · Search · Logger · i18n/Jalali        │
├────────────────────────────────────────────────────────────────┤
│ BUSINESS MODULES  (procurement, warehouse, finance, contract,   │
│  hr, ticketing, meeting, tasks, office-automation, management)  │
│  → depend ONLY on core-contracts; never on each other           │
└────────────────────────────────────────────────────────────────┘
```

The **dependency rule** is one-directional: modules → contracts → Core. Core
knows nothing about any module; modules know nothing about each other.

## 2. The Module contract

A backend module implements `ApiModule` (see
[`contracts/src/module.ts`](../contracts/src/module.ts)):

```ts
interface ApiModule {
  key: string;               // "procurement"
  basePath: string;          // mounted at /:tenantId/<basePath>
  permissions?: ModuleActions;   // declared, not hand-registered
  roleDefaults?: RoleDefaults[];
  entitlementRequired?: boolean; // gated by TenantModule
  register(core: CoreServices): ApiModuleRegistration;
}
```

`register(core)` receives the **CoreServices** bag (logger, events, workflows,
approvals, audit, notifications, documents, timeline, storage, reports, ai,
authz) and returns its `router` plus contributions: **reports**, **AI
capabilities**, **search providers**, **event handlers**, and a **seed**. The API
app composes all modules through an `ApiModuleRegistry` — adding a module touches
no central route table or permission catalog (ADR-0002).

A frontend module implements `WebModule`: lazily-loaded `routes`, `navGroups`,
optional `quickNav`, and per-language `locales`. The Web shell aggregates them and
renders nav/routes filtered by `can(permission)` **and** tenant entitlement.

## 3. Request lifecycle (unchanged isolation boundary)

```
HTTP → helmet/cors/json → requireAuth → /:tenantId → requireTenant
     → (RequestContext: principal + tenant + permissions + enabledModules)
     → module router (requirePermission per route)
     → module service → data (tenant-scoped) → response
```

`requireAuth` + `requireTenant` remain the **single** isolation gate; modules
mount beneath it and receive an immutable `RequestContext`. Tenant scoping is
enforced structurally (ADR-0003), not by per-query discipline alone.

## 4. Cross-module interaction (no coupling)

Modules **never** import each other. They interact three ways, all via Core:

- **Soft references** `{module, type, id}` instead of cross-module foreign keys (ADR-0009).
- **Event bus** — publish/subscribe domain events (e.g. `inventory.goods_received` → procurement advances a request) (ADR-0009).
- **Read queries** — through the owning module's registered **AI capabilities / search providers / reports**, never its internal tables.

## 5. Platform services (shared by all modules)

- **Workflow + Approval engine** (ADR-0005): any module attaches an approval flow to any entity by SoftRef — one engine, not N.
- **Audit / Notifications / Documents / Timeline** (ADR-0006): polymorphic, keyed by SoftRef; work for any module with no change.
- **Reporting Framework** (ADR-0007): modules register `ReportDescriptor`s; Core owns filters, export, scheduling, charts, KPIs, executive rollups, AI summaries. "Management Reporting" is this framework, not a module.
- **AI Layer** (ADR-0008): modules register read-only `AICapability`s and `SearchProvider`s; the AI layer (voice, NL query, smart reports, risk, approval assistant, agents) consumes the registry — never a module's internals. Read-only by default; writes are explicit + permission-gated + audited.

## 6. Data architecture

One database, **Postgres schema namespaces** via Prisma `multiSchema` (ADR-0010):
`core`, `platform`, then one per module (`procurement`, `inventory`, `finance`,
…). Hard FKs only **within** a schema; cross-module links are soft references.
Every module table carries `tenantId`; Core provides the isolation guard.

## 7. How the 14-module vision maps

The product wish list mixes **capabilities** and **modules**. Core absorbs the
capabilities so modules stay thin — full disposition in
[`CAPABILITY-MAP.md`](CAPABILITY-MAP.md). In short: Notification, AI, Reporting,
Workflow/Approval, Audit, Documents, Search → **Core**; Procurement, Warehouse,
Finance (incl. Budget Control), Contract, HR, Ticketing, Meeting/Education, Daily
Tasks, Office Automation, Management → **modules on Core**.

## 8. What "establishing Core" means right now

This step delivers the **boundary and the decisions**, additively:
- the typechecked `@lumentra/core-contracts` package (the seam), and
- the architecture + ADRs.

It intentionally does **not** move existing procurement code or change the DB
(ADR-0002, ADR-0013). The subsequent, separately-approved steps extract Core
implementations behind these contracts and then migrate Procurement — each
behavior-preserving and verified.
