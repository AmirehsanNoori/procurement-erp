# Lumentra One — Architectural Audit & Modular Platform Plan

> **Status:** Approved architectural audit + target architecture. Documentation only — no source code changed.
> **Scope:** the main project repo (NOT the live lumentra.ir deployment).
> **Date:** 2026-07 · **Author role:** Lead Software Architect review.

## Context

The project today is a **production-ready, single-domain Procurement ERP** (multi-tenant, Persian-first) on Vercel + Supabase. The goal is to evolve it into **"Lumentra One" — an enterprise modular platform**: a shared central core (identity, tenancy, RBAC, documents, audit, notifications, approvals) with independently-developed business modules (Procurement — done; Inventory/Warehouse and Finance — next) plugging into it.

**Locked decisions:**
1. **Architecture style → Modular Monolith** (one deployable; strong code + schema boundaries; shared core; single DB with schema namespaces).
2. **Next modules → Inventory + Finance, in parallel**, after the foundation.
3. **Hosting → advise** (see Hosting Recommendation).
4. **This phase → Foundation refactor first** (extract core, module registry; no new business features).

---

# PART A — ARCHITECTURE REPORT (current state)

### 1. Current project architecture
Multi-tenant modular-ish monolith, two deployables from one repo:
- **API**: Express 4 + TypeScript + Prisma/PostgreSQL. Single `createApp()` factory (`server/src/app.ts`) reused by a local server (`server/src/index.ts`, :4000) and a Vercel serverless function (`api/index.ts`). All `/api/*` funnels to one function (`vercel.json`).
- **Web**: React 18 + Vite 5 + Tailwind 3 + TanStack Query 5 + i18next SPA (`web/`).
- **Data**: Supabase PostgreSQL; Prisma single schema/single client.
- Auth: JWT (in-memory access token + rotating httpOnly refresh cookie). Per-tenant RBAC.

### 2. Folder structure
```
api/index.ts            # Vercel serverless entry
vercel.json             # /api -> function, /* -> SPA
server/
  prisma/schema.prisma  # 31 models + migrations/ (7)
  src/
    app.ts              # Express factory + middleware chain
    routes/index.ts     # CENTRAL router registry (24 routers, 2 tiers)
    modules/<25>/        # <name>.routes.ts (+ rare service.ts)
    middleware/ rbac/ auth/ lib/ config/
web/
  src/
    App.tsx             # ONE flat route table (~35 routes)
    pages/<29>           # flat, all domains together
    components/<11>      # Layout(shell), guards, pickers, RfqWorkflow...
    config/nav.ts        # ONE NavGroup[] array
    auth/AuthContext.tsx  lib/api.ts  i18n/
  public/sw.js          # service worker (cache erp-v3)
```
**Finding:** organized by technical type, not domain. No `modules/<domain>/` boundary on either tier.

### 3. Technology stack
Express 4.21, Prisma 5.22, PostgreSQL, zod, jsonwebtoken 9, bcryptjs, helmet, cors, express-rate-limit, multer 1.x, xlsx 0.18, morgan · React 18.3, Vite 5.4, Tailwind 3.4, TanStack Query 5, react-router 6, axios 1.7, i18next, jalaali-js · Vercel serverless + Supabase.

### 4. Major domains
Identity/Access · Tenancy/Billing · **Procurement** (requests → quotations/RFQ → budget → invoices → installments → payments; suppliers + CRM + blanket orders) · Documents · Collaboration (tasks, timeline, notifications, correspondence) · Approvals · Expenses · Reporting/Analytics/Audit/Control-Center/Import-Export (permission-only aggregate views).

### 5. Shared components
- **Backend**: `lib/*` (prisma, http `ApiError`/`asyncHandler`, audit, paginate, jalali, digit-tolerant search), `middleware/*`, `rbac/*`, `finance/calc.ts` (financial engine reused by budgets/invoices/dashboard).
- **Frontend**: `Layout` (shell), `guards`, `JDatePicker`, `SearchableSelect`, `RequestSearchSelect`, `Pagination`, `EntityAttachments`, `EntityTimeline` (polymorphic/reusable), `ExcelButton`. `RfqWorkflow` is labeled shared but is **procurement-specific**.

### 6. Authentication flow
`POST /auth/login` → bcrypt verify → **access JWT (15m)** in body + **refresh JWT (7d)** as httpOnly cookie `erp_refresh` (`path=/api/auth`, `secure` in prod, `sameSite=lax`). Only the **SHA-256 hash** of refresh tokens is persisted (`RefreshToken`). `POST /auth/refresh` verifies → **rotates** (revoke old, issue new). `requireAuth` verifies the access JWT and **re-loads the user every request** (re-checks `isActive`). Web holds the access token in a **module variable** (not localStorage) and auto-refreshes once on 401 (coalesced).

### 7. Authorization flow
Per-tenant **RBAC**. `rbac/permissions.ts` = source of truth: **109 permission keys** (`module.action`) across **27 modules**, **3 seeded roles** (Manager=all, Officer=subset, Warehouse=minimal). `resolveTenantAccess(userId, tenantId)` = role defaults ⊕ DB `RolePermission` ⊕ per-user `UserPermissionOverride` (tenant allow/deny); super-admin → all permissions on any tenant. `requireTenant` populates `req.tenant.permissions`; `requirePermission('x.y')` guards routes. Web mirror: `can(perm)` = flat `Set.has`.

### 8. Database structure
Shared-DB / shared-schema, **`tenantId` discriminator** on 24 operational tables + `TenantUser` pivot. `User`/`Role`/`Permission` are **global**. Money = `Decimal(18,2)`; **statuses = free-text Persian strings** (no enums). Polymorphic cross-cutting tables (`Document`, `TimelineEvent`, `Notification`, `AuditLog`, `Approval*`) key off `entityType`+`entityId` — already module-agnostic. Per-tenant uniqueness (`@@unique([tenantId, requestNumber])`, invoiceNumber). Datasource uses **only `DATABASE_URL`** (no `directUrl`).

### 9. Business modules
25 backend module folders (24 routers + `finance/calc.ts`); 29 web pages. Central registry `server/src/routes/index.ts`: account-tier (`/auth`, `/tenants`, `/users`) vs **tenant-tier** (`/:tenantId/*`, gated once by `requireAuth`+`requireTenant`).

### 10. Coupling issues
- **Fat route files**: schema + logic + Prisma in one `*.routes.ts` (only invoices/notifications extract a service).
- **Frontend welded to procurement**: one `App.tsx` route table + one `nav.ts`; shell hardcodes procurement (`BottomNav`, `GlobalSearch` 4 entity types, notif endpoint).
- **Cross-domain data coupling**: `Invoice` has 4 parent FKs; `RfqWorkflow` invalidates `budgets` cache.
- **Schema cross-links** (`Correspondence.relatedRequestId→requests`, `Quotation.budgetId→budgets`) become cross-module FKs under modularization.
- **Duplicated status literals** across web files.

### 11. Scalability issues
- **No frontend code-splitting** — one JS bundle, all pages eager (only vendor chunks split).
- **No permission caching** — `resolveTenantAccess` runs every request (~4–6 DB round trips).
- **Prisma client not cached in prod**; **no `directUrl`** → connection-exhaustion risk on serverless.
- **In-memory rate limiter** ineffective across ephemeral instances.
- Large page files (Invoices 742, Requests 696 lines).

### 12. Technical debt
No tests / no CI / no ESLint/Prettier · no prod logging or request IDs · sparse audit coverage · inconsistent service layer · manual tenant scoping (no RLS) · no error boundary · partial i18n (data pages Persian-only) · dead `Placeholder.tsx` · branding drift ("Procurement ERP" vs "Lumentra").

### 13. Security concerns
1. **Secret fallbacks that don't fail in prod** (`config/env.ts` defaults for JWT secrets + admin password) → boots with public signing secrets. **Highest priority.**
2. **Manual tenant isolation** — one missing `where: { tenantId }` = cross-tenant leak; no structural guard/test.
3. **Public `register-tenant`** — unauthenticated tenant+admin creation, weak role resolution, no verify/CAPTCHA.
4. **Super-admin blast radius** — full access to every tenant.
5. **Serverless file storage** — docs to `./uploads`/`/tmp` don't persist → lost/404.
6. **Dependency advisories** — `xlsx@0.18.5`, `multer@1.x`.

### 14. Missing enterprise capabilities
Observability (logs/request IDs/error tracking/metrics) · tests + CI/CD · **tenant module entitlements** · **per-tenant custom roles** · object storage · background jobs/scheduler · event bus · greenfield masters (**Product/Warehouse/StockMovement**, **Account/GLEntry/Journal**) · multi-currency · API versioning · shared rate-limit store · SSO/2FA · frontend error boundary.

---

# PART B — DEPENDENCY REPORT

**Backend**: Express 4.21 · @prisma/client & prisma 5.22 · TS 5.6 · zod 3.23 · jsonwebtoken 9 · bcryptjs 2.4 · helmet 8 · cors 2.8 · express-rate-limit 7.4 · cookie-parser 1.4 · multer **1.4.5-lts** ⚠️ · xlsx **0.18.5** ⚠️ · morgan · dotenv · tsx. **No Node `engines` pin. No tests.**

**Frontend**: react 18.3 · react-router 6.27 · @tanstack/react-query 5.59 · axios 1.7 · i18next 26 · jalaali-js 2 · vite 5.4 · tailwind 3.4 · TS 5.6. **No UI/form/chart libs; all primitives hand-rolled. No test/lint/format tooling.**

**Notes:** `finance/calc.ts` shared by budgets/invoices/dashboard (keep in core-finance). Web query keys are duplicated string literals (no factory). Single Prisma client/schema blocks per-module isolation until `multiSchema`.

**Actions:** pin Node; replace/upgrade `xlsx` (→ exceljs) & watch `multer`; add ESLint/Prettier + Vitest + backend test runner; add a query-key factory.

---

# PART C — TECHNICAL DEBT REGISTER (prioritized)

| # | Debt | Severity | Effort | Fix |
|---|------|----------|--------|-----|
| 1 | Secret fallbacks don't fail in prod | **Critical** | S | Mandatory secrets when `NODE_ENV=production` |
| 2 | Manual tenant scoping, no guard | **High** | M | Prisma extension w/ AsyncLocalStorage tenant ctx + tests |
| 3 | Serverless file storage loses docs | **High** | M | Object-storage abstraction (Supabase Storage/S3/MinIO) |
| 4 | Prisma client not cached in prod; no `directUrl` | **High** | S | Cache client always; add `directUrl`; pooler |
| 5 | No tests / CI | **High** | M | Add smoke/integration tests first |
| 6 | No prod logging/observability | **High** | M | pino + request IDs + error tracking |
| 7 | Public register-tenant weak | **High** | S | Gate/disable, fix role resolution, verification |
| 8 | No frontend code-splitting | Med | M | `React.lazy` per route/module |
| 9 | No permission caching (4–6 DB hits/req) | Med | S | Per-request/LRU cache `userId:tenantId` |
| 10 | Fat route files, thin service layer | Med | L | Extract service/repo per module while modularizing |
| 11 | Free-text Persian statuses (no enums) | Med | M | Per-module status constants/enums + i18n |
| 12 | Partial i18n (data pages Persian-only) | Med | L | Enforce no-literal-strings; per-module locales |
| 13 | tenantId gaps: `BudgetAllocation` (no FK/index), `ExpenseItem` (no tenantId) | Med | S | Fix during schema-namespacing |
| 14 | In-memory rate limiter ineffective | Med | S | Redis store (or VPS single-instance) |
| 15 | No error boundary; dead `Placeholder.tsx`; branding drift | Low | S | Housekeeping |
| 16 | `xlsx`/`multer` advisories; no Node pin | Med | S | Upgrade/replace; add `engines` |

---

# PART D — PROPOSED MODULAR ARCHITECTURE (Lumentra One)

**Modular Monolith** — one deployable, hard module boundaries in code and DB schema, shared core, pluggable via registries.

### D.1 Repository (npm/pnpm workspaces)
```
packages/
  core-domain/        # Tenant, User, RBAC, entitlements (prisma models + services)
  core-web/           # shell: Layout, auth, router assembly, module registry, UI kit
  shared/             # http, errors, jalali, pagination, digit-search, query-key factory, types
  platform-services/  # documents(object-storage), timeline, notifications, audit, approvals
modules/
  procurement/  inventory(NEW)  finance(NEW)   # each: api + web
apps/
  api/   # assembles module routers via backend Module Registry
  web/   # mounts module UIs via frontend Module Registry (lazy)
```

### D.2 Backend Module Registry
```ts
interface ApiModule {
  key: string;                    // 'inventory'
  basePath: string;               // /:tenantId/inventory
  router: Router;                 // self-declares requirePermission
  permissions: ModuleActions;     // contributes to RBAC catalog + seed
  seed?: (tx) => Promise<void>;
  requiresEntitlement?: boolean;  // gated by TenantModule
}
```
Two-tier gate (`requireAuth`+`requireTenant`) stays the single isolation boundary; modules mount beneath it. `permissions.ts` becomes an aggregation of per-module contributions.

### D.3 Database (Prisma `multiSchema`)
One Supabase DB, Postgres schema namespaces `core` / `platform` / `procurement` / `inventory` / `finance`:
- **core**: Tenant, User, Role, Permission, RolePermission, TenantUser, UserPermissionOverride, RefreshToken, **+ `TenantModule`** (entitlements) **+ optional per-tenant custom roles**.
- **platform**: Document, TimelineEvent, Notification, AuditLog, Approval*, Task (polymorphic).
- **procurement**: Supplier(+CRM+Blanket), Request, Quotation, Budget(+Allocation), Invoice(+Installment), Payment, Correspondence, Expenses (or → finance).
- **inventory** (greenfield): Product, Warehouse, StockLevel, StockMovement — soft-referenced to procurement receipts.
- **finance** (greenfield): Account, Journal, GLEntry; AP/AR over procurement invoices/payments via soft refs.
- **Seam rule**: hard FKs only within a module; cross-module links become **soft references** (`{refType, refId}`). Fix `BudgetAllocation`/`ExpenseItem` tenantId gaps; add `directUrl`.

### D.4 Tenant isolation hardening
Prisma **client extension** injecting `tenantId` from **AsyncLocalStorage** on every module query (over the manual `where`), plus a test that fails if a query omits tenant scope. Optional Postgres RLS.

### D.5 Frontend Module Registry
Each module exports `{ routes, navGroups, searchProviders, quickNavItems, locales }`; `core-web` aggregates → `App.tsx` routes assembled + **`React.lazy` per module**; `nav.ts` aggregated (gated by `can()` + entitlement); `GlobalSearch`/`BottomNav`/notifications **provider-driven**; per-module locales; shared **query-key factory**.

### D.6 Cross-cutting platform services
Storage abstraction (`StorageProvider`) · structured logging (pino + request IDs) · in-process event bus (→ Redis/queue later) for cross-module reactions · background scheduler · shared rate-limit store.

---

# PART E — MIGRATION STRATEGY (foundation-first; then Inventory + Finance in parallel)

Every step behavior-preserving and independently shippable.

- **Phase 0 — Guardrails & de-risking.** Tests (auth, tenant isolation, procurement happy-paths) + CI + ESLint/Prettier + error boundary. Fix modularization-independent debt: mandatory prod secrets (#1), Prisma caching + `directUrl` (#4), object storage (#3), permission caching (#9), harden register-tenant (#7).
- **Phase 1 — Extract shared core.** Workspaces; move identity/RBAC/tenant + polymorphic platform services into `packages/core-*` + `platform-services`. No behavior change.
- **Phase 2 — Backend module registry + Procurement as a module.** Add `ApiModule` registry; move procurement routers into `modules/procurement`; compose via registry. Same URLs/behavior. Extract thin service layer opportunistically.
- **Phase 3 — DB schema namespacing (highest risk).** Move tables into `core`/`platform`/`procurement` via `multiSchema`; add `TenantModule`; fix tenantId gaps. **Apply to BOTH DBs**; lumentra's migration runs via **Supabase SQL editor** (build-time `migrate deploy` can't reach it). Maintenance window against a tested copy.
- **Phase 4 — Frontend modularization.** Per-module folders + registry; `React.lazy`; provider-driven shell; per-module locales; query-key factory. No behavior change.
- **Phase 5 — Inventory + Finance (parallel).** Greenfield masters wired via registries + entitlements, cross-referencing procurement by soft links. Enable per tenant.

**Two-deployments caveat:** the repo deploys to **both** `procurement-erp` and `procurement-erp-client` (lumentra.ir, real data). Use a **staging branch/preview**; treat lumentra DB migrations as manual (Supabase SQL editor) release steps.

---

# PART F — RISKS

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DB schema-namespace migration on live data (Phase 3) | Med | **High** | Test on a copy; scripted SQL; maintenance window; Supabase SQL editor for lumentra |
| Dropping a `tenantId` filter while moving code | Med | **High** | Tenant-guard extension + isolation tests in Phase 0, before moving code |
| No tests today → blind refactor | High | High | Phase 0 adds tests first |
| One repo → changes hit lumentra (real data) | Med | High | Staging branch/preview; manual DB release gate |
| "Both modules in parallel" overextends small team | Med | Med | Foundation first; parallelize only greenfield work |
| Vercel availability/sanctions in Iran | Med | Med–High | Abstract infra now; VPS/Docker fallback |
| Cross-module soft-ref complexity | Med | Med | Clear seam rules; owning-module resolvers; contract tests |
| Scope creep (audit → rewrite) | Med | Med | Behavior-preserving phases; ship each independently |

---

# PART G — ESTIMATED EFFORT (solo dev + AI assistance)

| Phase | Scope | Estimate |
|-------|-------|----------|
| 0 | Guardrails + security/serverless hardening + tests/CI | 1–2 weeks |
| 1 | Extract shared core + platform services | ~1 week |
| 2 | Backend module registry + procurement module | 1–2 weeks |
| 3 | DB schema namespacing + entitlements + tenantId fixes | 1–2 weeks (higher risk) |
| 4 | Frontend modularization + lazy loading + provider shell | ~2 weeks |
| **Foundation (0–4)** | **Platform ready for modules** | **~6–9 weeks** |
| 5 | Inventory + Finance scaffolds (masters + core flows, parallel) | ~4–8 weeks combined |

---

# Hosting Recommendation

- **Short term — stay on Vercel + Supabase** (modular monolith runs fine serverless; ParsPack CDN path works). Must still fix serverless debt: object storage (#3), cached/pooled Prisma (#4); accept weak in-memory rate limiting (#14).
- **Design for portability now** — storage, cache, DB, logging behind interfaces so the target is swappable.
- **Medium term — containerized (Docker) on a VPS / Iranian cloud** is the likely target (single Node process + Postgres + MinIO + Redis + Nginx/TLS): persistent files, real rate limiting, less sanctions risk — at the cost of owning uptime.
- **Trigger to move**: persistent document uploads become required, or Vercel access/sanctions risk materializes.

---

# Verification (per phase)

- **Behavior-preserving (1,2,4):** same smoke/integration tests + manual procurement E2E (login → request → RFQ invite/compare/winner → invoice edit+budget → payment); identical API responses; both Vercel projects deploy green.
- **Phase 0:** secrets fail-fast; tenant-isolation test (A can't read B); document upload persists across invocations.
- **Phase 3:** row counts + referential integrity match pre/post on a copy; lumentra migration rehearsed before SQL-editor release.
- **Phase 5:** entitlement toggles show/hide module nav+routes; inventory receipt updates linked request via soft ref; finance GL entry reflects an invoice/payment.
