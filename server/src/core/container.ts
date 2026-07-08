/**
 * Core service container for the API app (M3). Assembles the Core Platform
 * singletons (@lumentra/core-runtime) that modules receive via `register(core)`.
 *
 * Services already extracted into Core are real here (events, reports, ai,
 * logger). Platform services not yet migrated throw clearly if touched, so no
 * module can silently depend on an unimplemented capability — they are filled in
 * as the migration lands each one.
 */
import { InProcessEventBus, DefaultReportRegistry, DefaultAIRegistry } from '@lumentra/core-runtime';
import type { CoreServices, Logger } from '@lumentra/core-contracts';

function makeLogger(bindings: Record<string, unknown> = {}): Logger {
  const line = (level: string, msg: string, meta?: Record<string, unknown>) =>
    JSON.stringify({ level, ...bindings, msg, ...(meta ?? {}) });
  return {
    debug: (m, meta) => { if (process.env.NODE_ENV !== 'production') console.debug(line('debug', m, meta)); },
    info: (m, meta) => console.log(line('info', m, meta)),
    warn: (m, meta) => console.warn(line('warn', m, meta)),
    error: (m, meta) => console.error(line('error', m, meta)),
    child: (b) => makeLogger({ ...bindings, ...b }),
  };
}

export const logger = makeLogger({ app: 'lumentra-api' });

export const events = new InProcessEventBus({
  onError: (err, ev) => logger.error('event handler failed', { event: ev.name, err: String(err) }),
});
export const reports = new DefaultReportRegistry();
export const ai = new DefaultAIRegistry();

// Not-yet-migrated platform services: fail loudly rather than pretend to work.
function notReady<T>(name: string): T {
  return new Proxy({}, { get() { throw new Error(`Core service '${name}' is not implemented yet`); } }) as T;
}

export const coreServices: CoreServices = {
  logger,
  events,
  reports,
  ai,
  workflows: notReady('workflows'),
  approvals: notReady('approvals'),
  audit: notReady('audit'),
  notifications: notReady('notifications'),
  documents: notReady('documents'),
  timeline: notReady('timeline'),
  storage: notReady('storage'),
  authz: () => { throw new Error("Core service 'authz' is not implemented yet"); },
};
