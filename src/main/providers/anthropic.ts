import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  NeutralToolDef,
  NeutralToolCall,
  StreamRoundResult,
  ChatMessageShape,
  ModelOption,
} from './types';

export class AnthropicProvider implements LLMProvider {
  id = 'anthropic';
  private client: Anthropic | null = null;
  private readonly isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  configure(apiKey: string): void {
    this.client = new Anthropic({ apiKey });
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const testClient = new Anthropic({ apiKey });
      await testClient.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch (error: any) {
      if (this.isDev) {
        console.error('[provider:anthropic] validateKey failed', {
          apiKeyLength: apiKey.length,
          message: error?.message || String(error),
          status: error?.status,
          code: error?.code,
          type: error?.type,
        });
      }
      return false;
    }
  }

  private toAnthropicTools(tools: NeutralToolDef[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: t.parameters.properties,
        required: t.parameters.required,
      },
    }));
  }

  private toAnthropicMessages(messages: ChatMessageShape[]): Anthropic.MessageParam[] {
    return messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  sendMessageStream(params: {
    messages: ChatMessageShape[];
    systemPrompt: string;
    model: string;
    tools: NeutralToolDef[];
    onText: (chunk: string) => void;
  }): { result: Promise<StreamRoundResult>; abort: () => void } {
    const abortController = new AbortController();

    const result = new Promise<StreamRoundResult>((resolve, reject) => {
      (async () => {
        try {
          if (!this.client) throw new Error('Anthropic client not configured');

          const stream = this.client.messages.stream({
            model: params.model || 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: params.systemPrompt,
            messages: this.toAnthropicMessages(params.messages),
            tools: this.toAnthropicTools(params.tools),
          });

          let textContent = '';

          stream.on('text', (text: string) => {
            textContent += text;
            params.onText(text);
          });

          const finalMessage = await stream.finalMessage();

          const toolUseBlocks = finalMessage.content.filter(
            (block: any) => block.type === 'tool_use'
          );

          const toolCalls: NeutralToolCall[] = toolUseBlocks.map((b: any) => ({
            id: b.id,
            name: b.name,
            arguments: b.input as Record<string, string>,
          }));

          resolve({
            textContent,
            toolCalls,
            rawAssistantMessage: finalMessage.content,
          });
        } catch (error: any) {
          reject(error);
        }
      })();
    });

    return {
      result,
      abort: () => abortController.abort(),
    };
  }

  buildToolResultMessages(
    rawAssistantMessage: any,
    results: Array<{ toolCallId: string; content: string }>
  ): any[] {
    return [
      { role: 'assistant', content: rawAssistantMessage },
      {
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.toolCallId,
          content: r.content,
        })),
      },
    ];
  }

  getDefaultModels(): ModelOption[] {
    return [
      { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { value: 'claude-haiku-4-6', label: 'Claude Haiku 4.6' },
    ];
  }
}
