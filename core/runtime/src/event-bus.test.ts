import { describe, it, expect, vi } from 'vitest';
import type { DomainEvent } from '@lumentra/core-contracts';
import { InProcessEventBus } from './event-bus';

function evt(name: string): DomainEvent {
  return { name, tenantId: 't1', payload: {}, occurredAt: new Date().toISOString(), actor: 'system' };
}

describe('InProcessEventBus', () => {
  it('delivers to an exact-name subscriber', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.subscribe('inventory.goods_received', handler);
    const e = evt('inventory.goods_received');
    await bus.publish(e);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(e);
  });

  it('delivers to a "<module>.*" wildcard subscriber', async () => {
    const bus = new InProcessEventBus();
    const wild = vi.fn();
    bus.subscribe('inventory.*', wild);
    await bus.publish(evt('inventory.goods_received'));
    await bus.publish(evt('inventory.stock_adjusted'));
    await bus.publish(evt('finance.invoice_paid')); // different module → not delivered
    expect(wild).toHaveBeenCalledTimes(2);
  });

  it('does not cross module boundaries on wildcards', async () => {
    const bus = new InProcessEventBus();
    const wild = vi.fn();
    bus.subscribe('finance.*', wild);
    await bus.publish(evt('inventory.goods_received'));
    expect(wild).not.toHaveBeenCalled();
  });

  it('isolates a failing handler and still runs the others', async () => {
    const onError = vi.fn();
    const bus = new InProcessEventBus({ onError });
    const good = vi.fn();
    bus.subscribe('x.y', () => { throw new Error('boom'); });
    bus.subscribe('x.y', good);
    await expect(bus.publish(evt('x.y'))).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
