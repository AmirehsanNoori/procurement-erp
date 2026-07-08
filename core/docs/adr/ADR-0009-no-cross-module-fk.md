# ADR-0009 — No cross-module foreign keys; soft references + events

**Status:** Accepted

## Context
Today `Invoice` hard-FKs request/quotation/supplier/budget, and
`Correspondence`/`Quotation` cross-link other domains. Under modularization these
become cross-module FKs that weld modules together and block independent evolution.

## Decision
- **Within a module**, hard foreign keys are fine.
- **Across modules**, references are **soft** — `SoftRef {module, type, id}` —
  resolved through the owning module's service/registry, never by a DB join.
- Cross-module reactions use the **event bus** (e.g. `inventory.goods_received`
  → procurement advances a request), not direct calls or shared tables.

## Consequences
- Modules evolve and (if ever needed) split out without FK entanglement.
- Referential integrity across seams is enforced in application logic + events,
  not the database — a deliberate, documented trade-off for modularity.
- Procurement's current internal FKs stay; only true cross-module links convert to
  soft refs, and only as the counterpart module is built.
