import { describe, it, expect } from 'vitest';
import { expandModuleActions } from '@lumentra/core-runtime';
import { suppliersModule } from './suppliers.module';
import { ALL_PERMISSION_KEYS } from '../../rbac/permissions';

describe('suppliers ApiModule', () => {
  it('has the expected identity/mount metadata', () => {
    expect(suppliersModule.key).toBe('suppliers');
    expect(suppliersModule.basePath).toBe('suppliers');
  });

  it('declares exactly the legacy suppliers.* permission keys (no drift)', () => {
    const fromModule = expandModuleActions(suppliersModule.permissions!).sort();
    const legacy = ALL_PERMISSION_KEYS.filter((k) => k.startsWith('suppliers.')).sort();
    expect(fromModule).toEqual(legacy);
  });

  it('register() returns the module router', () => {
    const reg = suppliersModule.register({} as never);
    expect((reg as { router: unknown }).router).toBeTruthy();
  });
});
