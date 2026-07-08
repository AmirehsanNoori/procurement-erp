/**
 * @lumentra/core-runtime — executable Core Platform building blocks that
 * implement @lumentra/core-contracts. Framework-agnostic, no business logic.
 * The API app and Web shell wire these into the running system.
 */
export { InProcessEventBus } from './event-bus';
export { DefaultApiModuleRegistry, DefaultWebModuleRegistry, DefaultReportRegistry, DefaultAIRegistry, } from './registries';
export { aggregateCatalog, expandModuleActions } from './permission-catalog';
export type { AggregatedCatalog } from './permission-catalog';
