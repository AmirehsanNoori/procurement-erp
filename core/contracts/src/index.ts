/**
 * @lumentra/core-contracts — the public surface of the Core Platform boundary.
 *
 * Type-only. No runtime code, no business logic. Every business module (and the
 * API app + Web shell) depends on THIS package to plug into Core; Core depends
 * on nothing here that is module-specific. See core/docs/ARCHITECTURE.md.
 */
export type * from './primitives';
export type * from './rbac';
export type * from './identity';
export type * from './events';
export type * from './workflow';
export type * from './platform-services';
export type * from './reporting';
export type * from './ai';
export type * from './module';
