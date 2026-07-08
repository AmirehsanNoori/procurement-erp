import { describe, it, expect } from 'vitest';
import { aggregateCatalog, expandModuleActions } from './permission-catalog.ts';
import { apiModule } from './_testkit.ts';

describe('expandModuleActions', () => {
  it('expands sub-module action verbs into "<sub>.<action>" keys', () => {
    const keys = expandModuleActions({ requests: ['view', 'create'], quotations: ['view'] });
    expect(keys.sort()).toEqual(['quotations.view', 'requests.create', 'requests.view']);
  });
});

describe('aggregateCatalog', () => {
  it('dedupes permissions and merges role defaults across modules', () => {
    const procurement = apiModule('procurement', 'procurement', {
      permissions: { requests: ['view', 'create'] },
      roleDefaults: [{ role: 'Manager', permissions: ['requests.view', 'requests.create'] }],
    });
    const inventory = apiModule('inventory', 'inventory', {
      permissions: { products: ['view'], requests: ['view'] }, // "requests.view" duplicates procurement
      roleDefaults: [
        { role: 'Manager', permissions: ['products.view'] },
        { role: 'Warehouse', permissions: ['products.view'] },
      ],
    });

    const cat = aggregateCatalog([procurement, inventory]);

    expect(cat.permissions).toEqual(['products.view', 'requests.create', 'requests.view']);
    expect(cat.roleDefaults.Manager).toEqual(['products.view', 'requests.create', 'requests.view']);
    expect(cat.roleDefaults.Warehouse).toEqual(['products.view']);
  });

  it('handles modules that declare no permissions', () => {
    const cat = aggregateCatalog([apiModule('bare', 'bare')]);
    expect(cat.permissions).toEqual([]);
    expect(cat.roleDefaults).toEqual({});
  });
});
