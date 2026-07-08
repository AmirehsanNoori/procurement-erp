# ADR-0008 — Enterprise AI Layer as a read-only capability registry

**Status:** Accepted

## Context
The AI requirement is an **enterprise AI platform** (voice assistant, enterprise
search, natural-language query, smart reports, workflow suggestions, risk
detection, approval assistant, future agents) — not a chatbot bolted onto one
screen. It must see across modules without becoming coupled to their internals or
becoming a security hole.

## Decision
Add a Core **AI Layer** built on a **capability registry**. Modules register
**`AICapability`s** and **`SearchProvider`s** (contracts `ai.ts`). Rules:
- **Read-only by default.** Any capability that mutates state must set `mutates`,
  declare a `permission`, and still pass the module's normal authorization + audit.
- AI reads **only** through registered capabilities/providers/reports — never a
  module's raw tables.
- Every capability runs inside a `RequestContext`, so tenant isolation and
  permissions apply to AI exactly as to a user.

The AI layer (LLM/voice/agent orchestration) is a **consumer** of this registry;
provider choice (and model) is an implementation detail behind the layer.

## Consequences
- New modules become AI-capable by registering capabilities — no AI code change.
- Security and tenancy are preserved for AI by construction.
- Future autonomous agents operate within the same permissioned, audited surface.
