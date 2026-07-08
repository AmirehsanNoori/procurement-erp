import type { DomainEvent, EventBus, EventHandler } from '@lumentra/core-contracts';
import type { RequestContext } from '@lumentra/core-contracts';

/**
 * In-process event bus (ADR-0009). Supports exact names ("inventory.goods_received")
 * and "<module>.*" wildcards. Handlers run sequentially and their failures are
 * isolated so one bad subscriber cannot break the publisher or sibling handlers.
 *
 * This is the starting implementation; the same EventBus interface can be backed
 * by Redis/a queue later without touching module code.
 */
export class InProcessEventBus implements EventBus {
  private exact = new Map<string, EventHandler[]>();
  private wildcard = new Map<string, EventHandler[]>(); // module prefix -> handlers
  private onError: (err: unknown, event: DomainEvent) => void;

  constructor(opts?: { onError?: (err: unknown, event: DomainEvent) => void }) {
    this.onError = opts?.onError ?? (() => {});
  }

  subscribe<P>(pattern: string, handler: EventHandler<P>): void {
    const h = handler as EventHandler;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      const arr = this.wildcard.get(prefix) ?? [];
      arr.push(h);
      this.wildcard.set(prefix, arr);
    } else {
      const arr = this.exact.get(pattern) ?? [];
      arr.push(h);
      this.exact.set(pattern, arr);
    }
  }

  async publish<P>(event: DomainEvent<P>): Promise<void> {
    const ctx: RequestContext | null = null;
    const handlers = this.handlersFor(event.name);
    for (const handler of handlers) {
      try {
        await handler(event as DomainEvent, ctx);
      } catch (err) {
        this.onError(err, event as DomainEvent);
      }
    }
  }

  private handlersFor(name: string): EventHandler[] {
    const out: EventHandler[] = [...(this.exact.get(name) ?? [])];
    const modulePrefix = name.includes('.') ? name.slice(0, name.indexOf('.')) : name;
    const wild = this.wildcard.get(modulePrefix);
    if (wild) out.push(...wild);
    return out;
  }
}
