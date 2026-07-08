import type { AICapability, AIRegistry, ApiModule, ApiModuleRegistry, ReportDescriptor, ReportRegistry, RequestContext, SearchProvider, WebModule, WebModuleRegistry } from '@lumentra/core-contracts';
/**
 * Backend module registry. The API app registers every ApiModule here, then
 * mounts them beneath the shared auth + tenant gate. Duplicate keys/basePaths
 * are rejected so two modules cannot silently collide (ADR-0002).
 */
export declare class DefaultApiModuleRegistry implements ApiModuleRegistry {
    private modules;
    private basePaths;
    register(module: ApiModule): void;
    all(): readonly ApiModule[];
}
/** Frontend module registry — the web shell composes routes/nav from these. */
export declare class DefaultWebModuleRegistry implements WebModuleRegistry {
    private modules;
    register(module: WebModule): void;
    all(): readonly WebModule[];
}
/**
 * Central report registry (ADR-0007). Reports are permission-filtered per request
 * so `list(ctx)` only returns what the caller may run.
 */
export declare class DefaultReportRegistry implements ReportRegistry {
    private reports;
    register(report: ReportDescriptor): void;
    list(ctx: RequestContext): ReportDescriptor[];
    get(key: string): ReportDescriptor | undefined;
}
/**
 * AI capability + search registry (ADR-0008). Everything is permission-filtered
 * for the requesting principal, so the AI layer can never surface a capability
 * or search provider the user isn't allowed to use.
 */
export declare class DefaultAIRegistry implements AIRegistry {
    private capabilities;
    private providers;
    registerCapability(cap: AICapability): void;
    registerSearchProvider(provider: SearchProvider): void;
    listCapabilities(ctx: RequestContext): AICapability[];
    listSearchProviders(ctx: RequestContext): SearchProvider[];
}
