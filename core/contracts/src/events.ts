/**
 * Cross-module event bus. Modules react to each other WITHOUT importing each
 * other's code (ADR-0009): e.g. Warehouse emits "inventory.goods_received" and
 * Procurement subscribes to advance a request's status. Core provides the bus;
 * starts in-process, can move to Redis/queue later without changing this API.
 */
import type { RequestContext } from './identity.ts';
import type { SoftRef, TenantId } from './primitives.ts';

/** A domain event published by a module. Name is "<module>.<event>". */
export interface DomainEvent<P = unknown> {
  name: string;
  tenantId: TenantId;
  /** The entity this event is about, as a soft reference. */
  subject?: SoftRef;
  payload: P;
  occurredAt: string;
  /** Who/what caused it (userId or "system"). */
  actor: string;
}

export type EventHandler<P = unknown> = (
  event: DomainEvent<P>,
  ctx: RequestContext | null
) => Promise<void> | void;

export interface EventBus {
  publish<P>(event: DomainEvent<P>): Promise<void>;
  /** Subscribe to an exact event name or a "<module>.*" wildcard. */
  subscribe<P>(pattern: string, handler: EventHandler<P>): void;
}
