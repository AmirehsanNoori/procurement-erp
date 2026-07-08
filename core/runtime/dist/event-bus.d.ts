import type { DomainEvent, EventBus, EventHandler } from '@lumentra/core-contracts';
/**
 * In-process event bus (ADR-0009). Supports exact names ("inventory.goods_received")
 * and "<module>.*" wildcards. Handlers run sequentially and their failures are
 * isolated so one bad subscriber cannot break the publisher or sibling handlers.
 *
 * This is the starting implementation; the same EventBus interface can be backed
 * by Redis/a queue later without touching module code.
 */
export declare class InProcessEventBus implements EventBus {
    private exact;
    private wildcard;
    private onError;
    constructor(opts?: {
        onError?: (err: unknown, event: DomainEvent) => void;
    });
    subscribe<P>(pattern: string, handler: EventHandler<P>): void;
    publish<P>(event: DomainEvent<P>): Promise<void>;
    private handlersFor;
}
