"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandModuleActions = exports.aggregateCatalog = exports.DefaultAIRegistry = exports.DefaultReportRegistry = exports.DefaultWebModuleRegistry = exports.DefaultApiModuleRegistry = exports.InProcessEventBus = void 0;
/**
 * @lumentra/core-runtime — executable Core Platform building blocks that
 * implement @lumentra/core-contracts. Framework-agnostic, no business logic.
 * The API app and Web shell wire these into the running system.
 */
var event_bus_1 = require("./event-bus");
Object.defineProperty(exports, "InProcessEventBus", { enumerable: true, get: function () { return event_bus_1.InProcessEventBus; } });
var registries_1 = require("./registries");
Object.defineProperty(exports, "DefaultApiModuleRegistry", { enumerable: true, get: function () { return registries_1.DefaultApiModuleRegistry; } });
Object.defineProperty(exports, "DefaultWebModuleRegistry", { enumerable: true, get: function () { return registries_1.DefaultWebModuleRegistry; } });
Object.defineProperty(exports, "DefaultReportRegistry", { enumerable: true, get: function () { return registries_1.DefaultReportRegistry; } });
Object.defineProperty(exports, "DefaultAIRegistry", { enumerable: true, get: function () { return registries_1.DefaultAIRegistry; } });
var permission_catalog_1 = require("./permission-catalog");
Object.defineProperty(exports, "aggregateCatalog", { enumerable: true, get: function () { return permission_catalog_1.aggregateCatalog; } });
Object.defineProperty(exports, "expandModuleActions", { enumerable: true, get: function () { return permission_catalog_1.expandModuleActions; } });
