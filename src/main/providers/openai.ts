import OpenAI from 'openai';
import {
  LLMProvider,
  NeutralToolDef,
  NeutralToolCall,
  StreamRoundResult,
  ChatMessageShape,
  ModelOption,
} from './types';

export class OpenAIProvider implements LLMProvider {
  id: string;
  private client: OpenAI | null = null;

  constructor(id: string = 'openai') {
    this.id = id;
  }

  configure(apiKey: string, baseUrl?: string): void {
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }

  async validateKey(apiKey: string, baseUrl?: string): Promise<boolean> {
    try {
      const testClient = new OpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      await testClient.chat.completions.create({
        model: this.id === 'custom' ? 'gpt-4o' : 'gpt-4o-mini',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  private toOpenAITools(tools: NeutralToolDef[]): OpenAI.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private toOpenAIMessages(
    messages: ChatMessageShape[],
    systemPrompt: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];
    for (const m of messages) {
      result.push({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      });
    }
    return result;
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
          if (!this.client) throw new Error('OpenAI client not configured');

          const stream = await this.client.chat.completions.create({
            model: params.model || 'gpt-4o',
            max_tokens: 4096,
            messages: this.toOpenAIMessages(params.messages, params.systemPrompt),
            tools: this.toOpenAITools(params.tools),
            stream: true,
          });

          let textContent = '';
          const toolCallsInProgress = new Map<
            number,
            { id: string; name: string; arguments: string }
          >();

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              textContent += delta.content;
              params.onText(delta.content);
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallsInProgress.get(tc.index);
                if (!existing) {
                  toolCallsInProgress.set(tc.index, {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  });
                } else {
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name += tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
              }
            }
          }

          const toolCalls: NeutralToolCall[] = [];
          for (const [, tc] of toolCallsInProgress) {
            let parsedArgs: Record<string, string>;
            try {
              parsedArgs = JSON.parse(tc.arguments);
            } catch {
              parsedArgs = {};
            }
            toolCalls.push({
              id: tc.id,
              name: tc.name,
              arguments: parsedArgs,
            });
          }

          // Build the raw assistant message for the tool-result follow-up
          const rawAssistantMessage: any = {
            role: 'assistant',
            content: textContent || null,
          };
          if (toolCalls.length > 0) {
            rawAssistantMessage.tool_calls = Array.from(toolCallsInProgress.values()).map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            }));
          }

          resolve({
            textContent,
            toolCalls,
            rawAssistantMessage,
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
    const toolMessages = results.map((r) => ({
      role: 'tool' as const,
      tool_call_id: r.toolCallId,
      content: r.content,
    }));
    return [rawAssistantMessage, ...toolMessages];
  }

  getDefaultModels(): ModelOption[] {
    if (this.id === 'custom') {
      return [{ value: 'gpt-4o', label: 'GPT-4o (default)' }];
    }
    return [
      { value: 'gpt-5.2', label: 'gpt-5.2' },
      { value: 'gpt-5-mini', label: 'gpt-5-mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4.1', label: 'gpt-4.1' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { value: 'o3-mini', label: 'o3-mini' },
    ];
  }
}
