# ADR-0010 — Database schema namespacing (Prisma multiSchema)

**Status:** Accepted

## Context
All 31 models live in one Prisma schema / one Postgres `public` schema. Module
boundaries need to reach the data layer, but splitting into separate databases
would lose transactions and add ops burden (contradicts ADR-0001).

## Decision
One database, **multiple Postgres schema namespaces** via Prisma `multiSchema`:
`core`, `platform`, and one per module (`procurement`, `inventory`, `finance`, …).
Tables move to their owning schema; hard FKs only within a schema (ADR-0009). Add
`directUrl` to the datasource so migrations work behind a pooler.

## Consequences
- Clear data ownership; a module's tables are namespaced and self-contained.
- Cross-module reads go through services, not cross-schema joins.
- The physical move is the **highest-risk migration** (ADR-0002 keeps it late and
  behavior-preserving); it must be applied to **both** databases, and the
  lumentra.ir DB migration runs via the **Supabase SQL editor** (build-time
  `migrate deploy` cannot reach it — a known constraint).
- Fix the current tenantId gaps (`BudgetAllocation`, `ExpenseItem`) during this move.
