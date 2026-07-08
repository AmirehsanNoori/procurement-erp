# Capability & Ownership Map

Defines what belongs to **Core** vs a **business module**, maps the product's
14-item module wish list onto that split, and records the disposition of every
**current** backend module (nothing is moved yet — this is the target).

## 1. Core vs Module — the rule

A capability is **Core** if more than one module needs it and it carries no
business meaning of its own (auth, files, notifications, workflow, reporting,
AI). It is a **module** if it owns a business domain with its own entities and
rules (procurement, warehouse, finance, contract, HR…).

## 2. The 14-item wish list, classified

| Wish-list item | Classification | Home |
|---|---|---|
| Procurement (committee) | Business module | `modules/procurement` (committee = an approval workflow via Core) |
| Warehouse / Inventory | Business module | `modules/inventory` |
| Finance | Business module | `modules/finance` |
| Budget Control | Capability of Finance | `modules/finance` (Core reporting surfaces it cross-module) |
| Contract | Business module (CLM) | `modules/contract` |
| HR | Business module | `modules/hr` |
| Ticketing | Business module | `modules/ticketing` |
| Meeting / Education | Business module | `modules/meeting` |
| Daily Task (to-do) | Light module + Core productivity service | `modules/tasks` (Tasks service is shared) |
| Office automation (attendance, نامه‌نگاری/correspondence) | Business module | `modules/office-automation` |
| Management | Business module (exec dashboards) | `modules/management` (built on Core Reporting) |
| **Management Reporting** | **Core capability** | Core Reporting Framework |
| **Notification** | **Core capability** | Core Notifications service |
| **AI** | **Core capability** | Core AI Layer |

## 3. Disposition of the CURRENT backend modules (target, not yet moved)

Current: 25 module folders under `server/src/modules/`. Target home once
migration happens (behavior identical, ADR-0002):

**→ Core / platform**
- `auth`, `users`, `tenants` → Core identity/RBAC/organizations
- `notifications` → Core Notifications
- `audit` → Core Audit
- `approvals` → Core Workflow/Approval engine
- `documents` → Core Documents (+ StorageProvider)
- `timeline` → Core Timeline
- `search` → Core Enterprise Search (provider-driven)
- `reports`, `analytics`, `dashboard`, `executive` (web) → Core Reporting Framework
- `import-export` → Core data tooling (per-module descriptors)
- `finance/calc.ts` (shared engine) → stays a shared service, consumed by Finance/Budget

**→ Procurement module** (`modules/procurement`)
- `requests`, `quotations`, `budgets`, `invoices`, `payments`, `suppliers`,
  `control-center`, `due-dates`, `correspondence`* , `expenses`*

\* `correspondence` and `expenses` are candidates to move to **Office Automation**
and **Finance** respectively later; they stay in Procurement at migration time to
avoid behavior change, then relocate as those modules are built (tracked as a
follow-up, ADR-0009 soft-ref rules make this cheap).

**→ Platform/SaaS**
- `billing` (+ Tenant plan fields) → Core billing/entitlements

## 4. Frontend disposition (target)

The flat `web/src/pages/*` and single `nav.ts`/`App.tsx` become per-module
contributions (`WebModule`). Shared shell pieces (`Layout`, `guards`, pickers,
`Pagination`, `EntityAttachments`, `EntityTimeline`, `GlobalSearch`,
`JDatePicker`) move to `core-web`; `RfqWorkflow` and procurement pages move to the
Procurement module.

## 5. Non-negotiables during any move

- No behavior change, no DB shape change at move time (ADR-0002).
- No cross-module foreign keys introduced; use soft refs + events (ADR-0009).
- Every moved capability keeps flowing through Core auth + audit.
