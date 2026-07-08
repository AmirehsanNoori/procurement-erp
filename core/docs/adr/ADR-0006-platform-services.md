# ADR-0006 — Polymorphic platform services

**Status:** Accepted

## Context
Audit, notifications, documents and timeline already exist and are already
polymorphic (`entityType` + `entityId`). They are needed by every module.

## Decision
Keep them as **Core platform services** with a uniform **SoftRef** key
(`{module, type, id}`): `AuditService`, `NotificationService`, `DocumentService`
(on a swappable `StorageProvider`), `TimelineService`. Modules call these through
`CoreServices`; they never write these tables directly.

## Consequences
- Any new module gets audit/notify/attach/timeline for free.
- Documents move off the ephemeral serverless filesystem onto a real
  `StorageProvider` (ADR-0012), fixing lost uploads.
- Audit coverage becomes uniform (every module mutation can be recorded consistently).
