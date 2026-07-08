# ADR-0003 — Structural multi-tenant isolation

**Status:** Accepted

## Context
Isolation today relies on every query manually adding `where: { tenantId }` across
~24 files. One omission leaks cross-tenant data; there is no structural guard and
no test. With many more modules, discipline alone is unacceptable risk.

## Decision
Keep the shared-DB / `tenantId`-discriminator model, but make isolation
**structural**:
1. `requireAuth` + `requireTenant` resolve an immutable **`RequestContext`**
   (principal + tenant + permissions + enabled modules) once per request.
2. Core exposes the request-scoped tenant via **AsyncLocalStorage**, and a
   **Prisma client extension** injects/asserts `tenantId` on every module query —
   defense in depth over the manual `where`.
3. An automated **isolation test** fails if a model can be read without tenant scope.
4. Optional Postgres **RLS** as a further backstop.

## Consequences
- A dropped `where` no longer silently leaks data.
- Modules receive tenant context from Core; they never re-derive or trust client input.
- Super-admin's cross-tenant access is explicit and audited (narrow, logged path).
