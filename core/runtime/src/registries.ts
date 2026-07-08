import type {
  AICapability,
  AIRegistry,
  ApiModule,
  ApiModuleRegistry,
  ReportDescriptor,
  ReportRegistry,
  RequestContext,
  SearchProvider,
  WebModule,
  WebModuleRegistry,
} from '@lumentra/core-contracts';

/**
 * Backend module registry. The API app registers every ApiModule here, then
 * mounts them beneath the shared auth + tenant gate. Duplicate keys/basePaths
 * are rejected so two modules cannot silently collide (ADR-0002).
 */
export class DefaultApiModuleRegistry implements ApiModuleRegistry {
  private modules = new Map<string, ApiModule>();
  private basePaths = new Set<string>();

  register(module: ApiModule): void {
    if (this.modules.has(module.key)) {
      throw new Error(`Duplicate ApiModule key: ${module.key}`);
    }
    if (this.basePaths.has(module.basePath)) {
      throw new Error(`Duplicate ApiModule basePath: ${module.basePath}`);
    }
    this.modules.set(module.key, module);
    this.basePaths.add(module.basePath);
  }

  all(): readonly ApiModule[] {
    return [...this.modules.values()];
  }
}

/** Frontend module registry — the web shell composes routes/nav from these. */
export class DefaultWebModuleRegistry implements WebModuleRegistry {
  private modules = new Map<string, WebModule>();

  register(module: WebModule): void {
    if (this.modules.has(module.key)) {
      throw new Error(`Duplicate WebModule key: ${module.key}`);
    }
    this.modules.set(module.key, module);
  }

  all(): readonly WebModule[] {
    return [...this.modules.values()];
  }
}

/**
 * Central report registry (ADR-0007). Reports are permission-filtered per request
 * so `list(ctx)` only returns what the caller may run.
 */
export class DefaultReportRegistry implements ReportRegistry {
  private reports = new Map<string, ReportDescriptor>();

  register(report: ReportDescriptor): void {
    if (this.reports.has(report.key)) {
      throw new Error(`Duplicate report key: ${report.key}`);
    }
    this.reports.set(report.key, report);
  }

  list(ctx: RequestContext): ReportDescriptor[] {
    return [...this.reports.values()].filter((r) => ctx.tenant.permissions.has(r.permission));
  }

  get(key: string): ReportDescriptor | undefined {
    return this.reports.get(key);
  }
}

/**
 * AI capability + search registry (ADR-0008). Everything is permission-filtered
 * for the requesting principal, so the AI layer can never surface a capability
 * or search provider the user isn't allowed to use.
 */
export class DefaultAIRegistry implements AIRegistry {
  private capabilities = new Map<string, AICapability>();
  private providers: SearchProvider[] = [];

  registerCapability(cap: AICapability): void {
    if (this.capabilities.has(cap.key)) {
      throw new Error(`Duplicate AI capability key: ${cap.key}`);
    }
    this.capabilities.set(cap.key, cap);
  }

  registerSearchProvider(provider: SearchProvider): void {
    this.providers.push(provider);
  }

  listCapabilities(ctx: RequestContext): AICapability[] {
    return [...this.capabilities.values()].filter((c) => {
      const perm = c.permission;
      return perm ? ctx.tenant.permissions.has(perm) : true;
    });
  }

  listSearchProviders(ctx: RequestContext): SearchProvider[] {
    // Providers self-filter results by permission inside search(); expose those
    // whose module the tenant is entitled to.
    return this.providers.filter((p) => ctx.tenant.enabledModules.has(p.module));
  }
}
