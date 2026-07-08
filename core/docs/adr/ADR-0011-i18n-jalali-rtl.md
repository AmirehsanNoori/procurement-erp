# ADR-0011 — i18n, Jalali calendar and RTL as Core concerns

**Status:** Accepted

## Context
The product is Persian-first (RTL, Jalali dates, Persian terminology) but i18n is
partial: shell is translated while data-heavy pages hardcode Persian, and business
statuses are Persian string literals duplicated across files.

## Decision
Treat localization as a **Core concern**:
- Core provides the i18n runtime, RTL handling, and the Jalali⇄Gregorian utilities
  (dates stored Gregorian/UTC; presented Jalali).
- Each module ships its **own locale bundles** (merged by Core) and must not embed
  literal UI strings — enforced by a lint rule.
- Business **statuses become per-module enums/constants with i18n keys**, not raw
  Persian literals, so state is language-independent and analytics-safe.

## Consequences
- New modules are translatable by default; adding English (or another language) is
  a bundle, not a code change.
- Status logic decouples from display language.
- A one-time cleanup migrates existing literals to keys (behavior-preserving).
