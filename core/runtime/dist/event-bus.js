"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InProcessEventBus = void 0;
/**
 * In-process event bus (ADR-0009). Supports exact names ("inventory.goods_received")
 * and "<module>.*" wildcards. Handlers run sequentially and their failures are
 * isolated so one bad subscriber cannot break the publisher or sibling handlers.
 *
 * This is the starting implementation; the same EventBus interface can be backed
 * by Redis/a queue later without touching module code.
 */
class InProcessEventBus {
    exact = new Map();
    wildcard = new Map(); // module prefix -> handlers
    onError;
    constructor(opts) {
        this.onError = opts?.onError ?? (() => { });
    }
    subscribe(pattern, handler) {
        const h = handler;
        if (pattern.endsWith('.*')) {
            const prefix = pattern.slice(0, -2);
            const arr = this.wildcard.get(prefix) ?? [];
            arr.push(h);
            this.wildcard.set(prefix, arr);
        }
        else {
            const arr = this.exact.get(pattern) ?? [];
            arr.push(h);
            this.exact.set(pattern, arr);
        }
    }
    async publish(event) {
        const ctx = null;
        const handlers = this.handlersFor(event.name);
        for (const handler of handlers) {
            try {
                await handler(event, ctx);
            }
            catch (err) {
                this.onError(err, event);
            }
        }
    }
    handlersFor(name) {
        const out = [...(this.exact.get(name) ?? [])];
        const modulePrefix = name.includes('.') ? name.slice(0, name.indexOf('.')) : name;
        const wild = this.wildcard.get(modulePrefix);
        if (wild)
            out.push(...wild);
        return out;
    }
}
exports.InProcessEventBus = InProcessEventBus;
