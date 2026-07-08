# ADR-0012 — Deployment portability

**Status:** Accepted

## Context
Runs on Vercel serverless + Supabase (reachable in Iran via a ParsPack CDN). That
target has real constraints: ephemeral/read-only filesystem (lost document
uploads), Prisma client not pooled across cold starts, and ineffective in-memory
rate limiting. A future move to a VPS/Docker (for persistence and sanctions
resilience) must not require a rewrite.

## Decision
Make infrastructure a **swappable detail** behind Core interfaces:
- Files → `StorageProvider` (local / Supabase Storage / S3 / MinIO).
- Cache / rate-limit store → a `KeyValue` interface (in-memory now, Redis later).
- DB access → a single cached Prisma client (cached on `globalThis` in all envs) +
  `directUrl`.
- Logging → a `Logger` interface (pino + request IDs).

Recommended path: **stay on Vercel + Supabase short term** (with a real
`StorageProvider` and pooled Prisma), **design for a containerized VPS** as the
medium-term target; move when persistent uploads become required or Vercel
availability/sanctions risk materializes.

## Consequences
- Hosting choice does not leak into module code.
- The serverless correctness bugs are fixed via the same abstractions.
- A modular monolith deploys to a single container trivially when the time comes.
