# ADR-0007 — Centralized Reporting Framework

**Status:** Accepted

## Context
Reporting/analytics/executive/dashboard logic is scattered and procurement-shaped.
"Management Reporting" in the wish list is a capability, not a module. Every module
will need filters, export, scheduling, dashboards, charts, KPIs and AI summaries.

## Decision
Provide a **Core Reporting Framework**. Modules register **`ReportDescriptor`s**
whose only module-specific part is `run(input, ctx)`. The framework owns: filter
UI/validation, pagination, export (`xlsx/csv/pdf/json`), scheduling, chart specs,
KPI/executive rollups, and optional **AI natural-language summaries**. Reports are
permission-gated and tenant-scoped by construction.

## Consequences
- One reporting engine; no per-module report plumbing.
- Executive dashboards aggregate `executive: true` reports across modules.
- The AI layer (ADR-0008) can summarize/query any registered report uniformly.
