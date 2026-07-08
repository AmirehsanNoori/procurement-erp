# ADR-0005 — One Core Workflow & Approval engine

**Status:** Accepted

## Context
Procurement has an approvals module; finance payments, contract sign-off, HR leave,
purchase committees, etc. all need multi-step approvals. Re-implementing approvals
per module would fragment logic and audit.

## Decision
Promote **Workflow + Approval** to a **Core engine** (`WorkflowEngine`,
`ApprovalEngine` in contracts). Any module attaches an approval to any entity by
**SoftRef**; workflow definitions are per-tenant, per-`appliesTo` entity type;
steps support `all` / `any` / `quorum` with approvers resolved from permissions
and roles. The engine records votes, advances/completes instances, writes audit,
and emits events (`approval.approved`, `approval.rejected`) other modules can react
to.

## Consequences
- Procurement "committee" = a quorum workflow, not bespoke code.
- Uniform approval UX, audit and reporting across all modules.
- Existing procurement approval behavior is preserved by mapping it onto the engine
  during migration (no rule change).
