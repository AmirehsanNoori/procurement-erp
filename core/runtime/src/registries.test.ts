import { describe, it, expect } from 'vitest';
import {
  DefaultAIRegistry,
  DefaultApiModuleRegistry,
  DefaultReportRegistry,
} from './registries';
import { apiModule, capability, ctx, report, searchProvider } from './_testkit';

describe('DefaultApiModuleRegistry', () => {
  it('registers and lists modules', () => {
    const reg = new DefaultApiModuleRegistry();
    reg.register(apiModule('procurement', 'procurement'));
    reg.register(apiModule('inventory', 'inventory'));
    expect(reg.all().map((m) => m.key)).toEqual(['procurement', 'inventory']);
  });

  it('rejects duplicate module keys', () => {
    const reg = new DefaultApiModuleRegistry();
    reg.register(apiModule('procurement', 'procurement'));
    expect(() => reg.register(apiModule('procurement', 'other'))).toThrow(/Duplicate ApiModule key/);
  });

  it('rejects duplicate basePaths', () => {
    const reg = new DefaultApiModuleRegistry();
    reg.register(apiModule('a', 'shared'));
    expect(() => reg.register(apiModule('b', 'shared'))).toThrow(/Duplicate ApiModule basePath/);
  });
});

describe('DefaultReportRegistry', () => {
  it('lists only reports the caller is permitted to run', () => {
    const reg = new DefaultReportRegistry();
    reg.register(report('procurement.open_invoices', 'reports.view'));
    reg.register(report('finance.gl', 'finance.reports.view'));
    const visible = reg.list(ctx(['reports.view'])).map((r) => r.key);
    expect(visible).toEqual(['procurement.open_invoices']);
  });

  it('rejects duplicate report keys', () => {
    const reg = new DefaultReportRegistry();
    reg.register(report('m.r', 'p'));
    expect(() => reg.register(report('m.r', 'p'))).toThrow(/Duplicate report key/);
  });
});

describe('DefaultAIRegistry', () => {
  it('permission-filters capabilities (no permission = always visible)', () => {
    const reg = new DefaultAIRegistry();
    reg.registerCapability(capability('m.open', undefined));
    reg.registerCapability(capability('m.secret', 'secret.view'));
    const keys = reg.listCapabilities(ctx([])).map((c) => c.key);
    expect(keys).toEqual(['m.open']);
    const withPerm = reg.listCapabilities(ctx(['secret.view'])).map((c) => c.key);
    expect(withPerm).toEqual(['m.open', 'm.secret']);
  });

  it('exposes search providers only for entitled modules', () => {
    const reg = new DefaultAIRegistry();
    reg.registerSearchProvider(searchProvider('procurement'));
    reg.registerSearchProvider(searchProvider('finance'));
    const mods = reg.listSearchProviders(ctx([], ['procurement'])).map((p) => p.module);
    expect(mods).toEqual(['procurement']);
  });
});
