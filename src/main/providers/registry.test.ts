import { describe, it, expect } from 'vitest';
import { getProvider, resetProvider } from './registry';

describe('provider registry', () => {
  it('returns AnthropicProvider for "anthropic"', async () => {
    const provider = await getProvider('anthropic');
    expect(provider.id).toBe('anthropic');
  });

  it('returns OpenAIProvider for "openai"', async () => {
    const provider = await getProvider('openai');
    expect(provider.id).toBe('openai');
  });

  it('returns OpenAIProvider with custom id for "custom"', async () => {
    const provider = await getProvider('custom');
    expect(provider.id).toBe('custom');
  });

  it('caches provider instances', async () => {
    const p1 = await getProvider('anthropic');
    const p2 = await getProvider('anthropic');
    expect(p1).toBe(p2);
  });

  it('returns new instance after reset', async () => {
    const p1 = await getProvider('anthropic');
    resetProvider('anthropic');
    const p2 = await getProvider('anthropic');
    expect(p1).not.toBe(p2);
  });

  it('throws for unknown provider', async () => {
    await expect(getProvider('unknown' as any)).rejects.toThrow('Unknown provider');
  });
});
