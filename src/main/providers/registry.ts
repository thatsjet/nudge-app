import { LLMProvider, ProviderId } from './types';

const providers = new Map<ProviderId, LLMProvider>();

export async function getProvider(id: ProviderId): Promise<LLMProvider> {
  let provider = providers.get(id);
  if (!provider) {
    switch (id) {
      case 'anthropic': {
        const { AnthropicProvider } = await import('./anthropic');
        provider = new AnthropicProvider();
        break;
      }
      case 'openai': {
        const { OpenAIProvider } = await import('./openai');
        provider = new OpenAIProvider('openai');
        break;
      }
      case 'custom': {
        const { OpenAIProvider } = await import('./openai');
        provider = new OpenAIProvider('custom');
        break;
      }
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
