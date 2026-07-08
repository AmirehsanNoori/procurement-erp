/**
 * @lumentra/core-contracts — the public surface of the Core Platform boundary.
 *
 * Type-only. No runtime code, no business logic. Every business module (and the
 * API app + Web shell) depends on THIS package to plug into Core; Core depends
 * on nothing here that is module-specific. See core/docs/ARCHITECTURE.md.
 */
export type * from './primitives.ts';
export type * from './rbac.ts';
export type * from './identity.ts';
export type * from './events.ts';
export type * from './workflow.ts';
export type * from './platform-services.ts';
export type * from './reporting.ts';
export type * from './ai.ts';
export type * from './module.ts';
