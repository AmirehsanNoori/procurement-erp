/**
 * Enterprise AI Layer contracts. This is NOT a chatbot — it is a platform layer
 * that lets every module EXPOSE structured, read-only capabilities to AI
 * features (voice assistant, enterprise search, NL query, smart reports, risk
 * detection, approval assistant, future agents). AI has read-only access by
 * default; any write capability must be explicitly flagged and permission-gated
 * and still flows through the module's normal authorization + audit (ADR-0008).
 */
import type { RequestContext } from './identity';
import type { SoftRef } from './primitives';

/** JSON-schema-ish description of a capability's input (kept structural/minimal). */
export interface CapabilityParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'ref';
  required?: boolean;
  description?: string;
}

/**
 * A single AI-callable capability a module registers. Read-only by default.
 * The handler MUST enforce the same authorization as a normal request via ctx.
 */
export interface AICapability<I = Record<string, unknown>, O = unknown> {
  key: string; // "<module>.<capability>"
  module: string;
  title: string;
  description: string;
  params: readonly CapabilityParam[];
  /** false (default) = read-only. true = mutates state (must be permission-gated). */
  mutates?: boolean;
  /** Permission required to invoke (defaults to the module's view permission). */
  permission?: string;
  handler(input: I, ctx: RequestContext): Promise<O>;
}

/** A searchable entity type a module exposes to Enterprise Search / NL query. */
export interface SearchProvider {
  module: string;
  entityType: string; // e.g. "request" | "contract"
  label: string;
  /** Returns lightweight hits for a free-text query, permission-filtered. */
  search(query: string, ctx: RequestContext): Promise<
    { ref: SoftRef; title: string; subtitle?: string; link?: string }[]
  >;
}

/** The registry Core exposes; the AI layer reads from it, never from modules directly. */
export interface AIRegistry {
  registerCapability(cap: AICapability): void;
  registerSearchProvider(provider: SearchProvider): void;
  /** Capabilities visible to the current principal (permission-filtered). */
  listCapabilities(ctx: RequestContext): AICapability[];
  listSearchProviders(ctx: RequestContext): SearchProvider[];
}
