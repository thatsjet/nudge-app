import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from './openai';

describe('OpenAIProvider', () => {
  it('defaults to openai id', () => {
    const provider = new OpenAIProvider();
    expect(provider.id).toBe('openai');
  });

  it('accepts custom id', () => {
    const provider = new OpenAIProvider('custom');
    expect(provider.id).toBe('custom');
  });

  it('builds tool result messages in OpenAI format', () => {
    const provider = new OpenAIProvider();
    const rawAssistantMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"tasks.md"}' } }],
    };
    const results = [{ toolCallId: 'call_1', content: '# Tasks' }];

    const messages = provider.buildToolResultMessages(rawAssistantMessage, results);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(rawAssistantMessage);
    expect(messages[1].role).toBe('tool');
    expect(messages[1].tool_call_id).toBe('call_1');
    expect(messages[1].content).toBe('# Tasks');
  });

  it('returns correct default models for openai', () => {
    const provider = new OpenAIProvider('openai');
    const models = provider.getDefaultModels();
    expect(models.some(m => m.value === 'gpt-4o')).toBe(true);
    expect(models.some(m => m.value === 'gpt-4o-mini')).toBe(true);
  });

  it('returns correct default models for custom', () => {
    const provider = new OpenAIProvider('custom');
    const models = provider.getDefaultModels();
    expect(models).toHaveLength(1);
    expect(models[0].value).toBe('gpt-4o');
  });

  it('throws when sendMessageStream called without configure', async () => {
    const provider = new OpenAIProvider();
    const { result } = provider.sendMessageStream({
      messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
      systemPrompt: 'test',
      model: 'gpt-4o',
      tools: [],
      onText: () => {},
    });
    await expect(result).rejects.toThrow('not configured');
  });
});
