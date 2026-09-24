import { AnthropicProvider } from './anthropic.js';
import { ModelProvider } from './types.js';

export interface ProviderSelection {
  provider: ModelProvider | null;
  reason: string | null;
}

// Selects the model provider from server-side environment variables.
//   ANTHROPIC_API_KEY        required for Live AI
//   SECOND_LOOK_MODEL        optional, defaults to claude-opus-5
//   SECOND_LOOK_FALLBACKS    "off" disables server-side refusal fallbacks
//   SECOND_LOOK_TIMEOUT_MS   optional request timeout (default 600000)
//   ANTHROPIC_BASE_URL       optional API base URL (default https://api.anthropic.com)
export function selectProvider(env: NodeJS.ProcessEnv = process.env): ProviderSelection {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return { provider: null, reason: 'ANTHROPIC_API_KEY is not set on the server.' };
  }
  return {
    provider: new AnthropicProvider({
      apiKey: key,
      baseUrl: env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com',
      model: env.SECOND_LOOK_MODEL?.trim() || 'claude-opus-5',
      useFallbacks: (env.SECOND_LOOK_FALLBACKS ?? 'on').toLowerCase() !== 'off',
      timeoutMs: Number(env.SECOND_LOOK_TIMEOUT_MS) || 600_000,
    }),
    reason: null,
  };
}
