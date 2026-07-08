/**
 * Core primitive types shared by every module and Core service.
 * No business meaning lives here — only platform-level building blocks.
 */

export type TenantId = string;
export type UserId = string;
export type RoleId = string;

/** ISO-8601 timestamp, always stored/transported in UTC (Gregorian). */
export type ISODateString = string;

/** Monetary amount. Amounts are integer-or-decimal minor/major units per module;
 *  the platform does not assume a currency — modules that need money carry their
 *  own currency field. Kept as string to avoid float drift across the wire. */
export type MoneyString = string;

/**
 * A soft cross-module reference. Modules MUST NOT create foreign keys across
 * module boundaries — they reference each other by {module, type, id} and
 * resolve through the owning module's service. See ADR-0009.
 */
export interface SoftRef {
  /** Owning module key, e.g. "procurement". */
  module: string;
  /** Entity type within that module, e.g. "request" | "invoice". */
  type: string;
  /** The entity id. */
  id: string;
}

/** Standard paginated envelope used by list endpoints and report runs. */
export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  totalPages: number;
}

/** Result of an operation that can fail without throwing (used at service seams). */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** A minimal structured logger contract (implemented by Core, injected to modules). */
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  /** Returns a child logger with bound context (e.g. requestId, module). */
  child(bindings: Record<string, unknown>): Logger;
}
