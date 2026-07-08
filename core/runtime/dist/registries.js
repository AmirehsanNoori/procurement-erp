"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultAIRegistry = exports.DefaultReportRegistry = exports.DefaultWebModuleRegistry = exports.DefaultApiModuleRegistry = void 0;
/**
 * Backend module registry. The API app registers every ApiModule here, then
 * mounts them beneath the shared auth + tenant gate. Duplicate keys/basePaths
 * are rejected so two modules cannot silently collide (ADR-0002).
 */
class DefaultApiModuleRegistry {
    modules = new Map();
    basePaths = new Set();
    register(module) {
        if (this.modules.has(module.key)) {
            throw new Error(`Duplicate ApiModule key: ${module.key}`);
        }
        if (this.basePaths.has(module.basePath)) {
            throw new Error(`Duplicate ApiModule basePath: ${module.basePath}`);
        }
        this.modules.set(module.key, module);
        this.basePaths.add(module.basePath);
    }
    all() {
        return [...this.modules.values()];
    }
}
exports.DefaultApiModuleRegistry = DefaultApiModuleRegistry;
/** Frontend module registry — the web shell composes routes/nav from these. */
class DefaultWebModuleRegistry {
    modules = new Map();
    register(module) {
        if (this.modules.has(module.key)) {
            throw new Error(`Duplicate WebModule key: ${module.key}`);
        }
        this.modules.set(module.key, module);
    }
    all() {
        return [...this.modules.values()];
    }
}
exports.DefaultWebModuleRegistry = DefaultWebModuleRegistry;
/**
 * Central report registry (ADR-0007). Reports are permission-filtered per request
 * so `list(ctx)` only returns what the caller may run.
 */
class DefaultReportRegistry {
    reports = new Map();
    register(report) {
        if (this.reports.has(report.key)) {
            throw new Error(`Duplicate report key: ${report.key}`);
        }
        this.reports.set(report.key, report);
    }
    list(ctx) {
        return [...this.reports.values()].filter((r) => ctx.tenant.permissions.has(r.permission));
    }
    get(key) {
        return this.reports.get(key);
    }
}
exports.DefaultReportRegistry = DefaultReportRegistry;
/**
 * AI capability + search registry (ADR-0008). Everything is permission-filtered
 * for the requesting principal, so the AI layer can never surface a capability
 * or search provider the user isn't allowed to use.
 */
class DefaultAIRegistry {
    capabilities = new Map();
    providers = [];
    registerCapability(cap) {
        if (this.capabilities.has(cap.key)) {
            throw new Error(`Duplicate AI capability key: ${cap.key}`);
        }
        this.capabilities.set(cap.key, cap);
    }
    registerSearchProvider(provider) {
        this.providers.push(provider);
    }
    listCapabilities(ctx) {
        return [...this.capabilities.values()].filter((c) => {
            const perm = c.permission;
            return perm ? ctx.tenant.permissions.has(perm) : true;
        });
    }
    listSearchProviders(ctx) {
        // Providers self-filter results by permission inside search(); expose those
        // whose module the tenant is entitled to.
        return this.providers.filter((p) => ctx.tenant.enabledModules.has(p.module));
    }
}
exports.DefaultAIRegistry = DefaultAIRegistry;
