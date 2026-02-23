import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from './anthropic';

describe('AnthropicProvider', () => {
  it('has correct id', () => {
    const provider = new AnthropicProvider();
    expect(provider.id).toBe('anthropic');
  });

  it('builds tool result messages in Anthropic format', () => {
    const provider = new AnthropicProvider();
    const rawAssistantMessage = [
      { type: 'text', text: 'Let me check that.' },
      { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'tasks.md' } },
    ];
    const results = [{ toolCallId: 'tool_1', content: '# Tasks\n- Buy milk' }];

    const messages = provider.buildToolResultMessages(rawAssistantMessage, results);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].content).toBe(rawAssistantMessage);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content[0].type).toBe('tool_result');
    expect(messages[1].content[0].tool_use_id).toBe('tool_1');
  });

  it('returns default models', () => {
    const provider = new AnthropicProvider();
    const models = provider.getDefaultModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].value).toBe('claude-sonnet-4-5');
    expect(models.every(m => m.value && m.label)).toBe(true);
  });

  it('throws when sendMessageStream called without configure', async () => {
    const provider = new AnthropicProvider();
    const { result } = provider.sendMessageStream({
      messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
      systemPrompt: 'test',
      model: 'claude-sonnet-4-5',
      tools: [],
      onText: () => {},
    });
    await expect(result).rejects.toThrow('not configured');
  });
});
