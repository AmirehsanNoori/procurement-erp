# Procurement ERP — Production (Multi-Tenant)

Production rebuild of the Procurement ERP Dashboard prototype as a real multi-tenant
web application: PostgreSQL persistence, authentication, role-based access control,
and per-tenant data isolation.

- **Backend:** Node.js + Express + TypeScript + Prisma + PostgreSQL
- **Frontend:** React + TypeScript + Vite + Tailwind (RTL, Persian-first) + TanStack Query
- **Tenants:** `IOID-WPA`, `SOPID-CMK`
- **Roles:** Procurement Manager, Procurement Officer, Warehouse

> **Verification (Phase 1):** `tsc` typecheck + production build pass for **both**
> `server` and `web`, the Prisma client generates, and the seed script compiles.
> Verified with Node v24 LTS. Runtime against a live PostgreSQL is validated
> separately once a database is available (see _Database options_).

> **Build status — Phases 1–10 complete. All placeholder routes resolved.**
> - **Phase 1 (Foundation):** project structure, full DB schema for every table,
>   JWT auth (access + refresh), tenant isolation, RBAC (role defaults + per-user
>   overrides), User & Access Management, seed, and the Requests module.
> - **Phase 2 (Core modules):** Suppliers, unified monthly Budgets (with
>   allocations and live reserved/actual/remaining math), Quotations/Pre-Invoices
>   (advance payments + convert-to-invoice), Invoices (installments + auto status),
>   and Payments (advances + register + invoice/budget recalculation). The full
>   **Request → Quotation → Budget → Invoice → Payment** workflow is implemented and
>   verified end-to-end (budget reservation/burn numbers match the prototype rules).
> - **Phase 3 (Control Center — IOID):** `/control-center` page with the exact
>   12-column IOID table (ROW, QUOTE NO, ORDER NO, TITLE, CATEGORY, DOCUMENT DATE,
>   RECEIVED DATE, WEEKLY SEGMANTATION, RECEIVED PERCENTAGE, COST, REMARK,
>   PAYMENT STATUS). Import from Excel (upsert by QUOTE NO), export to Excel with
>   live PAYMENT STATUS derived from invoices. Warehouse users can edit RECEIVED
>   DATE / RECEIVED PERCENTAGE / REMARK; full editors can update all IOID fields.
>
> Remaining modules (Control Center/IOID Excel, Documents, dashboards, notifications,
> analytics, audit, prototype migration) are scaffolded as permission-gated routes
> and layer onto this same foundation (see _Roadmap_).

---

## Prerequisites

This machine currently has **none** of the required tooling installed. Install:

1. **Node.js 20 LTS or newer** — https://nodejs.org (includes `npm`).
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop/ (for PostgreSQL).
   - _Alternative:_ a local/hosted PostgreSQL — just point `DATABASE_URL` at it and skip the Docker step.

Verify after installing (restart the terminal first):

```powershell
node --version
npm --version
docker --version
```

---

## Quick start

From the project root (`AEN ERP Dash`):

### 1. Start PostgreSQL

```powershell
docker compose up -d
```

### 2. Backend

```powershell
cd server
copy .env.example .env        # then edit secrets/admin credentials
npm install
npm run prisma:generate
npm run prisma:migrate         # creates the schema (name it e.g. "init")
npm run db:seed                # tenants, roles, permissions, admin user
npm run dev                    # http://localhost:4000
```

### 3. Frontend (new terminal)

```powershell
cd web
copy .env.example .env
npm install
npm run dev                    # http://localhost:5173
```

### 4. Log in

Open http://localhost:5173 and sign in with the admin from `server/.env`
(defaults: `admin@procurement.local` / `Admin@12345`). Change these before any
real deployment.

---

## Running locally on this machine (already set up)

Because Node/Docker/Postgres weren't installed, this machine was bootstrapped with
**portable** builds (no admin, no system changes):

- **Node.js v24 LTS** → `C:\Users\aenouri\node-portable\node-v24.17.0-win-x64`
- **PostgreSQL 16.4** (portable) → binaries `C:\Users\aenouri\pg16`, data `C:\Users\aenouri\pgdata`, on `localhost:5432` (user `erp` / `erp_password`, db `procurement_erp`)

These are **not on the system PATH** and the DB does **not** auto-start on boot.
To bring everything back up after a reboot (PowerShell):

```powershell
# 0) make portable Node + Postgres usable in this shell
$env:Path = "C:\Users\aenouri\node-portable\node-v24.17.0-win-x64;C:\Users\aenouri\pg16\bin;" + $env:Path

# 1) start PostgreSQL
pg_ctl -D "$env:USERPROFILE\pgdata" -o "-p 5432" -l "$env:USERPROFILE\pg.log" -w start

# 2) API  (from server/)
cd "C:\Users\aenouri\Desktop\AEN ERP Dash\server"; node dist/index.js      # or: npm run dev

# 3) Web  (from web/, new terminal with the same PATH line)
cd "C:\Users\aenouri\Desktop\AEN ERP Dash\web"; npm run dev
```

Then open **http://localhost:5173** and log in with `admin@procurement.local` / `Admin@12345`.

> The portable Postgres is a minimal server build (no `psql`/`createdb` client tools);
> Prisma creates and migrates the database directly, so they aren't needed. For a
> long-term setup, prefer Docker Compose or a proper Postgres install (below) — just
> point `DATABASE_URL` at it.

## Project structure

```
AEN ERP Dash/
├── docker-compose.yml          # PostgreSQL 16
├── server/                     # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma       # ALL tables (identity, RBAC, business)
│   │   └── seed.ts             # tenants, roles, permissions, admin
│   └── src/
│       ├── config/env.ts
│       ├── lib/                # prisma client, http helpers, audit
│       ├── auth/               # password (bcrypt) + JWT tokens
│       ├── rbac/               # permissions catalog + access resolution
│       ├── middleware/         # requireAuth, requireTenant, requirePermission, validate, error
│       ├── modules/            # auth, tenants, users, requests
│       └── routes/index.ts     # route mounting (tenant-scoped under /api/:tenantId)
└── web/                        # React + Vite frontend
    └── src/
        ├── auth/AuthContext.tsx   # session, tenant switch, permissions
        ├── lib/api.ts             # axios client with auto token refresh
        ├── config/nav.ts          # permission-gated sidebar
        ├── components/            # Layout (sidebar/topbar/tenant switcher), guards
        └── pages/                 # Login, Dashboard, Requests, Users, Placeholder
```

## Security & access model

- Passwords hashed with **bcrypt**; **JWT** access tokens (short-lived) + rotating
  **refresh tokens** stored hashed and delivered via an httpOnly cookie.
- **Every** tenant-scoped route runs behind `requireAuth → requireTenant → requirePermission`.
  Tenant isolation is enforced server-side: a user can never read/write another
  tenant's rows, and the API checks permissions on every protected route
  (UI hiding alone is not relied upon).
- Effective permissions = **role defaults ∪/∖ per-user overrides** (per tenant).
  Super admins implicitly receive all permissions.
- Sensitive actions (login, user create/update, permission changes, password
  resets) are written to an **audit log**.

## API surface (Phase 1)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | returns access token + tenants; sets refresh cookie |
| POST | `/api/auth/refresh` | rotates refresh token |
| POST | `/api/auth/logout` | revokes refresh token |
| GET | `/api/auth/me` | user + tenants + effective permissions (`?tenantId=`) |
| GET | `/api/tenants` | tenants visible to caller |
| POST/PATCH | `/api/tenants[/:id]` | super admin |
| GET/POST/PATCH | `/api/users …` | User & Access Management |
| PATCH | `/api/users/:id/permissions` | per-tenant overrides |
| GET/POST/PATCH/DELETE | `/api/:tenantId/requests …` | tenant-scoped, RBAC-gated |
| GET/POST/PATCH/DELETE | `/api/:tenantId/suppliers …` | suppliers |
| GET/POST/PATCH/DELETE | `/api/:tenantId/budgets …` | unified monthly budget + allocations + computed summary |
| GET/POST/PATCH/DELETE | `/api/:tenantId/quotations …` | pre-invoices; `+ /:id/archive`, `/:id/convert-to-invoice` |
| GET/POST/PATCH/DELETE | `/api/:tenantId/invoices …` | installments, auto status, `?category=unb\|wait\|paid` |
| GET/POST/DELETE | `/api/:tenantId/payments …` | actual payments + quotation advances; register/recalc |
| GET | `/api/:tenantId/control-center` | IOID table rows with live PAYMENT STATUS |
| POST | `/api/:tenantId/control-center/import` | Excel upload — upsert by QUOTE NO |
| GET | `/api/:tenantId/control-center/export` | Download Excel in exact IOID 12-col format |
| PATCH | `/api/:tenantId/control-center/:id` | Edit IOID row (warehouse: receipt fields only) |
| GET | `/api/:tenantId/documents` | List documents (filter: entityType, entityId, search) |
| POST | `/api/:tenantId/documents` | Upload file (multipart: file, entityType, entityId, category) |
| GET | `/api/:tenantId/documents/:id` | Document metadata |
| GET | `/api/:tenantId/documents/:id/file` | Download file (`?inline=true` for preview) |
| DELETE | `/api/:tenantId/documents/:id` | Delete document + file from disk |
| GET | `/api/:tenantId/dashboard` | KPI summary (counts, budget burn, overdue invoices, invoice breakdown, payment totals) |
| GET | `/api/:tenantId/dashboard/executive` | Portfolio overview, all budgets, top suppliers, overdue summary |
| GET | `/api/:tenantId/notifications` | List notifications (auto-generates new ones from live DB state) |
| GET | `/api/:tenantId/notifications/count` | Unread count only |
| PATCH | `/api/:tenantId/notifications/:id/read` | Mark single notification read |
| POST | `/api/:tenantId/notifications/read-all` | Mark all notifications read |
| DELETE | `/api/:tenantId/notifications/:id` | Delete notification |
| GET | `/api/:tenantId/audit` | Run 8 integrity checks; returns health score + per-check issues |
| GET | `/api/:tenantId/import-export/export` | Download full tenant JSON bundle |
| POST | `/api/:tenantId/import-export/import` | Import JSON bundle (natural-key upsert, deduplication) |
| GET | `/api/:tenantId/due-dates` | All upcoming & overdue dates across invoices, quotations, requests |
| GET | `/api/:tenantId/suppliers/statement` | Per-supplier invoice + payment totals and detail |
| GET/POST/PATCH/DELETE | `/api/:tenantId/tasks …` | Task management (priority, status, due date, linked request/invoice) |
| GET/POST | `/api/:tenantId/timeline …` | Activity timeline (list with filters, manual event creation) |
| GET | `/api/:tenantId/analytics` | Monthly payment trend, invoice aging, budget burn trajectory, category spend, conversion rate, forecast |

## Roadmap (next phases, onto this foundation)

- **Phase 2 — Core modules: ✅ done** — Suppliers, Budgets (unified monthly +
  allocations), Quotations/Pre-Invoices, Invoices, Installments, Payments, with the
  reservation/burn math and Request→…→Payment workflow.
- **Phase 3 — Control Center: ✅ done** — IOID Excel import/export (exact 12-col format), warehouse delivery fields, PAYMENT STATUS derived from live invoices.
- **Phase 4 — Documents: ✅ done** — upload/preview/download با per-tenant filesystem storage، permission-gated (view/upload/delete)، path-traversal guard، inline preview برای تصویر و PDF.
- **Phase 5 — Dashboards: ✅ done** — Main dashboard (KPI cards, budget burn bars, overdue invoices, invoice breakdown), Notification Center (auto-generated smart alerts: overdue invoices, budget overruns, quotation follow-ups; mark read / delete), Executive Dashboard (portfolio totals, per-budget table, top suppliers by payment, invoice status chart).
- **Phase 7 — Remaining modules: ✅ done** — Tasks (priority/status CRUD with quick-done toggle, overdue warning), Timeline (chronological activity feed, manual event entry, entity-type filter), Request Archive (reuses Requests with `archived` prop), Analytics & Forecast (monthly payment trend, monthly invoice creation, invoice aging buckets 0–30/31–60/61–90/90+ days, top spend categories, quotation→invoice conversion rate, budget burn trajectory, monthly spend average + months-to-exhaust forecast).
- **Phase 16 — Dashboard quick-pay + Payments batch grouping + CSV export: ✅ done** — Dashboard.tsx: overdue invoice cards now show a 💳 button (gated by `payments.register_payment`); clicking it opens a quick-pay modal pre-filled with the full remaining amount, with date and list-number fields, that posts directly to `POST /payments` and invalidates dashboard + invoices + payments queries. Payments.tsx: batch grouping via precomputed `batchTotals` + `batchStarts` — when consecutive rows share a `listNumber`, a blue header row is inserted above the first row of each batch showing the list number and total amount. "⬇ CSV" button added to the toolbar (visible when any payments are loaded) that exports the current filtered list as a BOM-prefixed UTF-8 CSV file.
- **Phase 15 — Installment management + Quotation comparison: ✅ done** — Invoices: detail modal installments section now has an "✏ ویرایش" button (gated by `invoices.edit`); click it to enter edit mode where each installment row has inline inputs (amount, month key, due date, status select 'در انتظار'/'پرداخت شده') plus delete (🗑) per row and "+ افزودن قسط" to add new rows; saving sends the full updated array via existing `PATCH /invoices/:id` (delete-all-then-recreate); when no installments exist, a prompt to click edit is shown. Requests: linked-entities modal now shows "⚖ مقایسه قیمت" button when a request has ≥2 quotations; opens a transposed side-by-side comparison table (attributes as rows, quotations as columns) with lowest-price column highlighted in green; powered by new `GET /:tenantId/requests/:id/quotations` endpoint returning full quotation fields (supplier, amount, advance, status, followUpDate, budget, batch, accounting reference, notes).
- **Phase 14 — Documents UX + Control Center inline editing: ✅ done** — Documents.tsx already had entity-type filter tabs (همه / درخواست / پیش‌فاکتور / فاکتور / بودجه / تأمین‌کننده / پرداخت). New in this phase: invoice detail modal now shows an "اسناد پیوست" section (count + list with file icon, name, category chip, download button) via `GET /documents?entityType=invoice&entityId=`. Request linked-entities modal similarly shows a docs section at the bottom via `GET /documents?entityType=request&entityId=`. Both sections are gated by `document_center.view_document`. ControlCenter.tsx: edit modal replaced with **true inline row editing** — clicking ✏️ turns that table row blue and replaces cells with inline inputs; warehouse users can edit RECEIVED DATE, RECEIVED %, REMARK; full editors additionally get ROW, ORDER NO, TITLE, CATEGORY, DOCUMENT DATE, WEEKLY SEGM-MONTH, COST; ✓ saves in-place, ✕ cancels with no modal overlay needed.
- **Phase 13 — Live notification badge, permission override editor & tenant management: ✅ done** — Layout.tsx: notification count polls `GET /notifications/count` every 60 s; red badge appears on the "🔔" sidebar nav item and a topbar bell button when unread count > 0. Users.tsx: "🔐 دسترسی" button opens a permission override editor modal — tenant selector, full permission catalog grouped by module, tri-state buttons (✓ grant / ✕ revoke / neither = role default), saves via `PATCH /users/:id/permissions`. New `Tenants.tsx` page (super admin only — redirects if not): list all tenants, create new tenant (name + code), edit name/code/isActive; accessible at `/tenants` with "🏢 مدیریت سازمان‌ها" nav entry in the مدیریت group.
- **Phase 12 — Invoice bulk actions, supplier statement modal & request linked-entity panel: ✅ done** — Invoices: checkbox column (select-all per page + individual) with a floating bulk action bar; "✅ ارسال به حسابداری" / "↩ لغو ارسال" buttons call new `POST /invoices/bulk-accounting` endpoint; selection resets on filter/page change. Suppliers: "📊" button per row opens a modal with contact info, 4 summary cards (count, invoiced, paid, balance), full invoice list with status badges, and running totals in footer — powered by new `GET /suppliers/:id/statement` endpoint. Requests: "🔗 پیوندها" button per row opens a modal showing linked quotations table + linked invoices table (pulled from existing `GET /requests/:id`) plus request meta (orderNo, category, supplier, deliveryDate, notes).
- **Phase 11 — Budget drill-down, user edit modal & payment date filter: ✅ done** — Budget cards now have a "📋 فاکتورها" toggle that expands an inline invoice table (`GET /budgets/:id/invoices`, computed status via FinanceContext). Users.tsx: edit user name/phone modal (`PATCH /users/:id`), admin reset-password modal with confirm field (`POST /users/:id/reset-password`), remove-tenant-membership button (`DELETE /users/:id/tenants/:tenantId`), phone displayed under user name. Payments.tsx: from/to date pickers in the filter bar passed as `?from=&to=` query params; backend filters the merged advances+actual rows by date range.
- **Phase 10 — Quotation edit/archive, payment edit/delete & invoice print: ✅ done** — Quotations: full edit modal (all fields: supplierId, amount, advancePaymentAmount, advancePaymentDate, status, followUpDate, notes, paymentBatchNumber, accountingReference) via `PATCH /quotations/:id`; archive button (🗄) per row; convert-to-invoice flow preserved. Payments: edit modal (date, listNumber, notes) via new `PATCH /payments/:id`; delete button (🗑) with invoice status auto-recalc; third total card (combined sum). Invoice print: 🖨 button in invoice detail modal opens a new tab with a clean RTL print-ready HTML page (meta fields, installments table, payment history, notes), `window.print()` triggered from the tab.
- **Phase 9 — Detail views, edit forms & global search: ✅ done** — Request edit modal (all fields: title, description, status, category, supplierId, followUpDate, deliveryDate, notes, orderNo) + archive/restore buttons; Invoice detail modal (shows installments table, payment history, all accounting fields) + accounting edit modal (batch, accountingReference, accountingNotes, sentToAccounting, accountingSubmissionDate, followUpDate, dueDate, notes) via `PATCH /invoices/:id`; GET `/invoices/:id` now includes full payment history; Global search modal (Ctrl+K) with 300ms debounce across suppliers/requests/invoices/quotations, categorized results with navigation, keyboard Esc to close; search button in every page's topbar.
- **Phase 8 — Production hardening: ✅ done** — Global API rate limiter (500 req/15min on all `/api` routes; 100 req/15min on `/api/auth`), pagination helper (`server/src/lib/paginate.ts`; 50/page default, 200 max) applied to requests and invoices endpoints with `{ total, page, totalPages }` metadata, reusable `<Pagination>` component in the frontend, invoice CSV export (`?format=csv` → BOM UTF-8, streams all matching rows), user profile management (`PATCH /api/auth/me` update name/phone, `PATCH /api/auth/me/password` verify-then-replace with audit log entry), global cross-entity search endpoint (`GET /api/:tenantId/search?q=` across suppliers/requests/invoices/quotations, top 5 each), `Profile` page (edit name/phone + change password + account info), profile link wired into topbar (user name → `/profile`) and sidebar nav.
- **Phase 6 — Audit & migration: ✅ done** — ERP audit engine (8 integrity checks: status drift, budget overruns, payment overrun, stale quotations, zero-amount invoices, etc.), JSON export/import (full tenant bundle with natural-key upsert), Due Dates monitor (all upcoming/overdue dates across invoices/quotations/requests, grouped by urgency), Supplier Statement (per-supplier invoice + payment history, totals), Reports/KPI page (budget efficiency, invoice breakdown, spend waterfall). VPS deploy scripts: `deploy/nginx.conf`, `deploy/pm2.config.js`, `deploy/setup.sh`, `deploy/backup.sh`.

- **Phase 17 — Live testing + Persian audit + Bilingual i18n + Supabase/Vercel deploy: ✅ done**
  - **Live testing**: All API endpoints verified (200 OK): dashboard, requests, invoices, payments, quotations, suppliers, budgets, analytics, notifications, audit, tasks, timeline, control-center, documents, users.
  - **Persian text audit**: Fixed Control Center table headers (English → Persian), Analytics label, ImportExport grammar. Standardized terminology across all 24 pages.
  - **Bilingual system (react-i18next)**: Installed `i18next`, `react-i18next`, `i18next-browser-languagedetector`. Created `web/src/i18n/index.ts` (init + `setLang()`/`currentLang()` helpers). Wrote `web/src/locales/fa.json` and `web/src/locales/en.json` — comprehensive translation files covering all 24 pages (~400 keys each). Updated all 24 pages to use `useTranslation()` + `t()` calls. Layout.tsx: `LanguageSwitcher` component (EN/FA toggle button in topbar), sidebar direction adapts (RTL ↔ LTR — `right-0`/`left-0`, `lg:mr-64`/`lg:ml-64`), `html.lang` + `html.dir` updated on language change. `nav.ts`: added `key` field to `NavGroup` for i18n lookup.
  - **Supabase**: `schema.prisma` updated with `directUrl = env("DIRECT_URL")` for pgBouncer-safe migrations. Created `server/.env.supabase.example` with `DATABASE_URL` (port 6543, `?pgbouncer=true&connection_limit=1`) and `DIRECT_URL` (port 5432).
  - **Vercel**: Created `server/api.ts` (serverless entry — exports Express app). Created `vercel.json` at repo root (routes `/api/*` → `server/api.ts`, builds web from `web/dist`). Created `web/.env.production.example` (`VITE_API_URL=/api` for same-origin deployment). Detailed step-by-step guide in `DEPLOY.md`. Noted: document uploads need Supabase Storage for persistence on serverless.

## Production deployment

### Supabase + Vercel (recommended)
See **[DEPLOY.md](./DEPLOY.md)** for the complete step-by-step guide.

Quick summary:
1. Create Supabase project → copy `DATABASE_URL` (pooled) and `DIRECT_URL` (direct)
2. Run `cd server && npm run prisma:deploy && npm run db:seed`
3. Import repo to Vercel → set environment variables → deploy
4. Set `VITE_API_URL=/api` in Vercel frontend env

### VPS (alternative)
Ubuntu VPS, Nginx reverse proxy, PM2 or Docker Compose, PostgreSQL, SSL via Certbot,
daily backups. `server` builds with `npm run build` → `npm start`; `web` builds with
`npm run build` (static assets served by Nginx). Deploy scripts in `deploy/`.
