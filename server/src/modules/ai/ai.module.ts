import type { ApiModule } from '@lumentra/core-contracts';
import aiRoutes from './ai.routes';

/**
 * AI assistant (دستیار هوشمند) — cross-module enterprise search and proactive
 * rule-based insights. No external LLM required; designed to be extended with a
 * model-backed assistant later. Mounted at /:tenantId/ai.
 */
export const aiModule: ApiModule = {
  key: 'ai',
  title: 'AI Assistant',
  basePath: 'ai',
  entitlementRequired: true,
  permissions: {
    ai: ['view'],
  },
  register() {
    return { router: aiRoutes };
  },
};
