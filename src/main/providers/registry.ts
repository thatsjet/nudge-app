import { LLMProvider, ProviderId } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';

const providers = new Map<ProviderId, LLMProvider>();

export function getProvider(id: ProviderId): LLMProvider {
  let provider = providers.get(id);
  if (!provider) {
    switch (id) {
      case 'anthropic':
        provider = new AnthropicProvider();
        break;
      case 'openai':
        provider = new OpenAIProvider('openai');
        break;
      case 'custom':
        provider = new OpenAIProvider('custom');
        break;
      default:
        throw new Error(`Unknown provider: ${id}`);
    }
    providers.set(id, provider);
  }
  return provider;
}

export function resetProvider(id: ProviderId): void {
  providers.delete(id);
}
