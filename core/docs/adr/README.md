# Architecture Decision Records (ADRs)

Each record captures one decision: context, the decision, and its consequences.
Status: **Accepted** unless noted. Records are immutable once accepted; a change
is a new ADR that supersedes an old one.

| # | Decision |
|---|----------|
| [0001](ADR-0001-modular-monolith.md) | Modular Monolith + workspaces (not microservices) |
| [0002](ADR-0002-core-module-boundary.md) | Core↔Module boundary via a Module Registry; additive, behavior-preserving introduction |
| [0003](ADR-0003-tenant-isolation.md) | Structural multi-tenant isolation (context + guard) |
| [0004](ADR-0004-rbac-entitlements.md) | RBAC catalog aggregation + per-tenant module entitlements |
| [0005](ADR-0005-workflow-approval-engine.md) | One Core Workflow & Approval engine |
| [0006](ADR-0006-platform-services.md) | Polymorphic platform services (audit, notifications, documents, timeline) |
| [0007](ADR-0007-reporting-framework.md) | Centralized Reporting Framework (modules register reports) |
| [0008](ADR-0008-ai-layer.md) | Enterprise AI Layer as read-only capability registry |
| [0009](ADR-0009-no-cross-module-fk.md) | No cross-module foreign keys — soft references + event bus |
| [0010](ADR-0010-db-schema-namespacing.md) | Database schema namespacing (Prisma multiSchema) |
| [0011](ADR-0011-i18n-jalali-rtl.md) | i18n, Jalali calendar and RTL as Core concerns |
| [0012](ADR-0012-deployment-portability.md) | Deployment portability (storage/cache/db/logging behind interfaces) |
| [0013](ADR-0013-contracts-first.md) | Contracts-first: establish the boundary before extracting implementations |
