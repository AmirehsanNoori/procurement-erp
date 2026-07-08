# Lumentra One — Core Platform

This directory is the **home of the Core Platform**: the shared, module-agnostic
foundation that every business module plugs into. It contains **only shared
platform capabilities** — no Procurement (or any other business) logic lives
here.

> **Status:** Foundation established (contracts + architecture + decisions).
> Procurement has **not** been migrated yet; existing business code is unchanged.
> Work is on the `core-platform` branch only (main / lumentra.ir untouched).

## What Core provides

Authentication · Authorization / RBAC · Organizations (Tenants) · Users · Roles ·
Permissions · **Module entitlements** · **Workflow Engine** · **Approval Engine** ·
**Notifications** · **Audit** · **Documents / Files** · **Timeline** ·
**Reporting Framework** · **AI Layer** · **Enterprise Search** · **Event Bus** ·
i18n / Jalali / RTL · the shared **API layer** and **Web shell**.

## Business modules (built ON Core, not IN it)

Procurement (incl. committee) · Warehouse / Inventory · Finance (incl. budget
control) · Contract Lifecycle · HR · Ticketing · Meeting / Education · Daily Tasks
(to-do) · Office Automation (attendance, correspondence) · Management (executive
dashboards). "Notification", "Management Reporting" and "AI" from the product wish
list are **Core capabilities**, not separate modules — see
[`docs/CAPABILITY-MAP.md`](docs/CAPABILITY-MAP.md).

## Layout

```
core/
  contracts/            # @lumentra/core-contracts — the Core<->Module boundary (type-only, typechecked)
    src/                #   primitives, rbac, identity, events, workflow,
                        #   platform-services, reporting, ai, module
  docs/
    ARCHITECTURE.md     # how Core works and how modules attach
    CAPABILITY-MAP.md   # Core vs module ownership; current-code disposition; 14-module vision
    adr/                # Architecture Decision Records (every decision)
```

## Principles

1. **Every shared capability lives in Core; no business logic leaks into Core.**
2. **Modules never import each other** — they interact via Core (events, soft refs, services).
3. **Adding a module edits no central file** — modules self-register (routes, nav, permissions, reports, AI capabilities).
4. **Nothing bypasses Core** for auth, tenancy, audit, files, notifications, workflow, reporting or AI.
5. **Behavior-preserving migration** — Core is introduced additively; existing procurement behavior and DB stay identical until an explicit, verified migration step.

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
