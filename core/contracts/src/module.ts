/**
 * The Module Registry — the single contract by which a business module plugs
 * into the Core Platform, on both the API and the Web side. Adding a module
 * means implementing these interfaces and registering the module; NO central
 * file (route table, nav array, permission catalog) is edited by hand
 * (ADR-0002).
 */
import type { AuthorizationService, ModuleActions, RoleDefaults } from './rbac';
import type { RequestContext } from './identity';
import type { EventBus, EventHandler } from './events';
import type { ApprovalEngine, WorkflowEngine } from './workflow';
import type {
  AuditService,
  DocumentService,
  NotificationService,
  StorageProvider,
  TimelineService,
} from './platform-services';
import type { ReportDescriptor, ReportRegistry } from './reporting';
import type { AICapability, AIRegistry, SearchProvider } from './ai';
import type { Logger } from './primitives';

/**
 * The bag of Core singletons injected into a module at registration time.
 * Everything a module needs from the platform comes through here — modules
 * never import another module, and never re-implement a platform capability.
 */
export interface CoreServices {
  logger: Logger;
  events: EventBus;
  workflows: WorkflowEngine;
  approvals: ApprovalEngine;
  audit: AuditService;
  notifications: NotificationService;
  documents: DocumentService;
  timeline: TimelineService;
  storage: StorageProvider;
  reports: ReportRegistry;
  ai: AIRegistry;
  /** Request-scoped authorization for a given context. */
  authz(ctx: RequestContext): AuthorizationService;
}

// ── API side ─────────────────────────────────────────────────────────────────

/** What a module returns from register(): its router plus platform contributions. */
export interface ApiModuleRegistration {
  /**
   * The module's HTTP router. Typed as `unknown` so the contracts package stays
   * framework-agnostic (no Express dependency); the API app casts it to Router.
   * Mounted by Core beneath the shared auth + tenant gate at the module basePath.
   */
  router: unknown;
  reports?: readonly ReportDescriptor[];
  capabilities?: readonly AICapability[];
  searchProviders?: readonly SearchProvider[];
  eventHandlers?: readonly { pattern: string; handler: EventHandler }[];
  /** Idempotent per-tenant seed (reference data, default workflows). */
  seed?: (ctx: { tenantId: string }) => Promise<void>;
}

export interface ApiModule {
  key: string; // "procurement"
  title: string;
  /** Mounted under /:tenantId/<basePath>. */
  basePath: string;
  /** Permissions this module declares (Core expands to the catalog + seed). */
  permissions?: ModuleActions;
  /** Default role→permission grants this module contributes. */
  roleDefaults?: readonly RoleDefaults[];
  /** If true, Core hides the module unless the tenant is entitled (ADR-0004). */
  entitlementRequired?: boolean;
  register(core: CoreServices): ApiModuleRegistration | Promise<ApiModuleRegistration>;
}

// ── Web side ─────────────────────────────────────────────────────────────────

/** A lazily-loaded route contributed by a module (route-level code splitting). */
export interface WebRoute {
  path: string;
  permission?: string;
  /** Dynamic import of the page component; enables per-module chunks. */
  lazy: () => Promise<{ default: unknown }>;
}

export interface NavItemContribution {
  key: string;
  path: string;
  label: string;
  icon: string;
  permission: string;
}
export interface NavGroupContribution {
  key: string;
  label: string;
  order?: number;
  items: readonly NavItemContribution[];
}

export interface WebModule {
  key: string;
  /** Entitlement gate; nav/routes hidden if the tenant lacks the module. */
  entitlementKey?: string;
  routes: readonly WebRoute[];
  navGroups: readonly NavGroupContribution[];
  /** Optional quick links (command palette / bottom nav). */
  quickNav?: readonly NavItemContribution[];
  /** Per-language message bundles merged into i18next. */
  locales?: Record<string, Record<string, unknown>>;
}

/** The registries the API app and Web shell build by composing modules. */
export interface ApiModuleRegistry {
  register(module: ApiModule): void;
  all(): readonly ApiModule[];
}
export interface WebModuleRegistry {
  register(module: WebModule): void;
  all(): readonly WebModule[];
}
