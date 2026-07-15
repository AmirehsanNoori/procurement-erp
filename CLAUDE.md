# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Branch & deployment safety (read first)

- **All work happens on the `core-platform` branch. NEVER push to `main`.** The repo is wired to **two** Vercel projects that both auto-deploy on push to `main`: `procurement-erp` and `procurement-erp-client` (**lumentra.ir**, which holds real client data and must stay frozen). Pushing to `main` touches production and lumentra.
- Validate every change on the **Vercel preview** of `core-platform`, not production. Preview URL: `https://procurement-erp-git-core-platform-amirehsannoori1.vercel.app`. An URL containing `-client-` points at lumentra's DB — never use it for testing this branch.
- The project deploys to Vercel as **one serverless function** (`api/index.ts`) for all `/api/*` plus the static `web/dist` SPA (`vercel.json`).

## Repo shape

Monorepo with **four independent npm roots** (no workspace tool — plain `file:` deps):
- `server/` — Express + TypeScript + Prisma API. Entry `server/src/app.ts` exports `createApp()`, reused by the local listener (`server/src/index.ts`, port 4000) and the Vercel function (`api/index.ts`).
- `web/` — React 18 + Vite + Tailwind + TanStack Query + react-router SPA. Persian-first, **RTL**.
- `core/contracts` (`@lumentra/core-contracts`) — type-only platform interfaces (ApiModule, registries, event bus).
- `core/runtime` (`@lumentra/core-runtime`) — executable implementations of those contracts (module registry, in-process event bus). Consumed by `server` via `file:` dep.

## Common commands

Run inside the relevant root (`cd server` or `cd web`):

```bash
# Backend (server/)
npm run typecheck            # tsc --noEmit — run after every server change
npm run dev                  # tsx watch (local, needs DATABASE_URL)
npm test                     # vitest run
npx vitest run src/routes/index.test.ts   # a single test file
npx prisma generate          # after editing schema.prisma

# Frontend (web/)
npm run typecheck            # tsc --noEmit
npm run build                # vite build — the real production build gate
npm run dev                  # vite dev server, port 5173
```

There is no linter configured. The CI gate is: server `typecheck` + `test`, web `typecheck` + `build`.

## Architecture

### Platform: modular monolith (Lumentra One)
The app is being evolved from a single-domain Procurement ERP into a modular platform (see `docs/architecture/lumentra-one-architecture.md` and the `ADR-0001`…`ADR-0013` references in code comments). A shared **Core** hosts identity/tenancy/RBAC/platform services; business **modules** plug in via registries.

**Backend module registry** (`server/src/routes/index.ts`): each module is an `ApiModule` descriptor (`key`, `title`, `basePath`, `permissions`, `register()` → `{ router }`). The registry mounts every module's router under a single `/:tenantId` gate guarded once by `requireAuth` + `requireTenant`. Adding a module = create `modules/<name>/<name>.module.ts` + `.routes.ts` and `registry.register(...)` — no other central edits. Account-level routes (`/auth`, `/tenants`, `/users`) mount outside the tenant gate. `entitlementRequired: true` gates a module behind the tenant's `TenantModule` entitlement (default-allow).

`server/src/routes/index.test.ts` is a **mount-lock** test asserting the exact ordered list of tenant basePaths — update it when adding/removing a module.

### RBAC
`server/src/rbac/permissions.ts` is the single source of truth: `MODULES` × `MODULE_ACTIONS` generate `<module>.<action>` keys (`ALL_PERMISSION_KEYS`), plus `ROLE_DEFAULTS`. `resolveTenantAccess` (access.ts) = role defaults ± per-user overrides; **super-admins receive `ALL_PERMISSION_KEYS`** (the code catalog, not a DB table) so new modules work without re-seeding. On requests, `req.tenant.permissions` is a **`string[]`** — check with `.includes(...)`, not `.has(...)`. Routes self-declare `requirePermission('module.action')`.

### Cross-module boundaries (ADR-0009)
No cross-module foreign keys. Modules reference each other by **soft references**: `refModule` / `refType` / `refId` columns, resolved by the owning module (e.g. a finance journal links to a procurement invoice by `refType:'invoice', refId`). When reading across modules, query the other module's Prisma model directly (single DB) but never add a hard FK across the seam.

### Frontend module shell
- `web/src/pages/Hub.tsx` is the App Launcher: pick tenant (`switchTenant`), then enter a module. Multi-tenant users choose the company on entry.
- `web/src/config/nav.ts` — each `NavGroup` has a `module` field; `moduleForPath(pathname)` (longest-match) resolves the active module, and `Layout.tsx` shows only that module's nav groups.
- `web/src/App.tsx` — one flat route table; routes wrapped in `<Guarded permission="...">`.
- `web/src/lib/api.ts` — axios with in-memory access token + refresh-on-401. Query keys are string-literal arrays like `['fin-journals', tid]`.

### Data & money conventions
- Multi-tenant single-DB: every operational table carries `tenantId`; scoping is **manual** (`where: { tenantId }`) in every query — there is no RLS or automatic guard.
- Money is `Decimal(18,2)`; statuses are **free-text Persian strings** (no enums).
- Backend request shape: `zod` schema + `validate()` middleware, handlers wrapped in `asyncHandler`, errors thrown as `ApiError.badRequest/notFound/conflict(...)`.

### Finance module (General Ledger) specifics
`server/src/modules/finance/` is a double-entry GL. Note `modules/finance/calc.ts` is the **old** procurement finance engine (budgets/invoices/dashboard) — unrelated to the new GL routes in the same folder. GL rules enforced server-side: journals must balance (Σdebit = Σcredit), each line is debit **xor** credit, only `isPostable` accounts accept lines, `posted` journals are immutable (correct via **void** or a **reversing** entry), journal numbers are sequential per tenant. Purchase invoices and payments auto-generate **draft** vouchers via `invoice-posting.ts` / `payment-posting.ts` (idempotent, fail-open, account codes overridable) when handed to finance.

## Database migrations (important gotcha)

Prisma **cannot** apply migrations from the Vercel build or from a local machine — the direct Supabase host is unreachable here (the build only runs `prisma generate`, never `migrate deploy`; the schema has no `directUrl`). To apply DDL to the live DB:

1. Edit `schema.prisma`, run `npx prisma generate`.
2. Temporarily add a super-admin-guarded `POST /api/admin/db-init` route in `server/src/routes/index.ts` that runs idempotent `IF NOT EXISTS` DDL via `prisma.$executeRawUnsafe`.
3. Commit + push, wait for the preview build, call it with the admin token, then **remove the endpoint** and push again.

Verifying removal: with a valid admin token the removed endpoint returns a **403 tenant error** (`به این مستأجر دسترسی ندارید`, it fell through to `/:tenantId`), not `{ok:true}`. Without a token it may still 401 from a stale build — always verify with the token.

Occasionally a push does not trigger a Vercel build; push an empty commit (`git commit --allow-empty`) to nudge it, and confirm with `vercel ls procurement-erp`.

## Committed build artifacts (do not "clean" these)

`.gitignore` intentionally **un-ignores** two normally-ignored things — they must stay committed or the deploy breaks:
- `core/runtime/dist/**` — the CommonJS build of core-runtime (Vercel's Node runtime can't load the ESM `src`). Rebuild with `npm run build` in `core/runtime` after changing it.
- `web/.env.production` — pins `VITE_API_URL=/api` so the SPA calls same-origin in every deploy.

## Preview validation workflow

After pushing to `core-platform`: wait for the preview build, then exercise the change against the preview API with the admin credentials (`admin@procurement.local` / `Admin@12345`). Prefer driving real endpoints end-to-end (create → read → mutate → verify) over trusting typecheck alone, then clean up test data — the preview shares the `procurement-erp` demo DB (not lumentra).
