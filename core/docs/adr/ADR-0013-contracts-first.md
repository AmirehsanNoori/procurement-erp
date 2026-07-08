# ADR-0013 — Contracts-first: boundary before implementation

**Status:** Accepted

## Context
The instruction for this phase is explicit: *establish the Core architecture only;
do NOT migrate Procurement; do NOT change existing business logic.* We need a way
to "create the Core" that is real and useful yet cannot break the live app.

## Decision
Establish Core **contracts-first**. Deliver, additively and on an isolated branch:
1. `@lumentra/core-contracts` — the typechecked Core↔Module boundary (module
   registry, core services, workflow/approval, platform services, reporting, AI).
2. The architecture and **every decision** as ADRs + capability map.

We do **not** move any existing implementation or touch the database in this step.
Core implementations are extracted behind these contracts, and Procurement is
migrated, only in **subsequent, separately-approved, verified** steps.

## Consequences
- The Core architecture exists and is enforceable (the contract compiles) without
  any risk to the running procurement app or lumentra.ir.
- Every later extraction/migration has a fixed target to implement against.
- Reviewers approve the boundary and decisions before any code is moved.
