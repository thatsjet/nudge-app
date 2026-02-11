import OpenAI from 'openai';
import * as https from 'https';
import * as tls from 'tls';
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
  private readonly isDev = process.argv.includes('--dev');

  private fullDump(error: any): Record<string, any> {
    const dump: Record<string, any> = {};
    for (const key of Object.getOwnPropertyNames(error || {})) {
      try {
        dump[key] = (error as any)[key];
      } catch (readError: any) {
        dump[key] = `<unreadable: ${readError?.message || String(readError)}>`;
      }
    }
    return dump;
  }

  private createHttpAgent(baseUrl?: string): https.Agent | undefined {
    // Custom OpenAI-compatible providers often use internal/self-signed certs.
    // For that provider only, allow TLS with untrusted chains.
    if (this.id === 'custom' && baseUrl?.startsWith('https://')) {
      return new https.Agent({ rejectUnauthorized: false });
    }
    return undefined;
  }

  private certificateChain(cert: tls.DetailedPeerCertificate): Array<Record<string, any>> {
    const chain: Array<Record<string, any>> = [];
    const seen = new Set<string>();
    let current: tls.DetailedPeerCertificate | null = cert;

    for (let depth = 0; depth < 12 && current; depth += 1) {
      if (!current.subject || Object.keys(current.subject).length === 0) break;
      const fingerprint = current.fingerprint256 || current.fingerprint || `depth-${depth}`;
      if (seen.has(fingerprint)) break;
      seen.add(fingerprint);

      chain.push({
        depth,
        subject: current.subject,
        issuer: current.issuer,
        subjectaltname: current.subjectaltname,
        valid_from: current.valid_from,
        valid_to: current.valid_to,
        serialNumber: current.serialNumber,
        fingerprint: current.fingerprint,
        fingerprint256: current.fingerprint256,
        ca: current.ca,
      });

      const issuerCert = current.issuerCertificate as tls.DetailedPeerCertificate | undefined;
      if (!issuerCert || issuerCert === current) break;
      current = issuerCert;
    }

    return chain;
  }

  private async logCertChain(baseUrl: string): Promise<void> {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== 'https:') {
        console.log('[provider:openai] cert-chain skip (non-https)', { baseUrl });
        return;
      }

      const host = url.hostname;
      const port = Number(url.port || 443);

      await new Promise<void>((resolve) => {
        const socket = tls.connect(
          {
            host,
            port,
            servername: host,
            rejectUnauthorized: false,
          },
          () => {
            try {
              const cert = socket.getPeerCertificate(true) as tls.DetailedPeerCertificate;
              console.log('[provider:openai] cert-chain details', {
                providerId: this.id,
                baseUrl,
                host,
                port,
              });
              console.dir(this.certificateChain(cert), { depth: null });
            } catch (error: any) {
              console.error('[provider:openai] cert-chain read failed', {
                message: error?.message || String(error),
              });
            } finally {
              socket.end();
              resolve();
            }
          }
        );

        socket.setTimeout(5000, () => {
          console.error('[provider:openai] cert-chain probe timeout', { host, port });
          socket.destroy();
          resolve();
        });

        socket.on('error', (error) => {
          console.error('[provider:openai] cert-chain probe error', {
            host,
            port,
            message: error?.message || String(error),
          });
          resolve();
        });
      });
    } catch (error: any) {
      console.error('[provider:openai] cert-chain setup error', {
        baseUrl,
        message: error?.message || String(error),
      });
    }
  }

  constructor(id: string = 'openai') {
    this.id = id;
  }

  configure(apiKey: string, baseUrl?: string): void {
    const httpAgent = this.createHttpAgent(baseUrl);
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      ...(httpAgent ? { httpAgent } : {}),
    });
  }

  async validateKey(apiKey: string, baseUrl?: string, model?: string): Promise<boolean> {
    const testModel = model || (this.id === 'custom' ? 'gpt-4o' : 'gpt-4o-mini');
    try {
      if (this.isDev && this.id === 'custom' && baseUrl) {
        await this.logCertChain(baseUrl);
      }
      const httpAgent = this.createHttpAgent(baseUrl);
      const testClient = new OpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(httpAgent ? { httpAgent } : {}),
      });
      const response = await testClient.chat.completions.create({
        model: testModel,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      if (this.isDev) {
        console.log('[provider:openai] validateKey success (full response)', {
          providerId: this.id,
          baseUrl: baseUrl || '(default)',
          model: testModel,
          apiKeyLength: apiKey.length,
        });
        console.dir(response, { depth: null });
      }
      return true;
    } catch (error: any) {
      if (this.isDev) {
        console.error('[provider:openai] validateKey failed (summary)', {
          providerId: this.id,
          baseUrl: baseUrl || '(default)',
          model: testModel,
          apiKeyLength: apiKey.length,
          message: error?.message || String(error),
          status: error?.status,
          code: error?.code,
          type: error?.type,
        });
        console.error('[provider:openai] validateKey failed (full error object)');
        console.dir(this.fullDump(error), { depth: null });
        if (error?.cause) {
          console.error('[provider:openai] validateKey failed (cause)');
          console.dir(error.cause, { depth: null });
        }
      }
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
    messages: any[],
    systemPrompt: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];
    for (const m of messages) {
      if (!m || typeof m !== 'object' || !m.role) continue;

      // Preserve assistant tool calls for follow-up rounds.
      if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
        result.push({
          role: 'assistant',
          content: m.content ?? null,
          tool_calls: m.tool_calls,
        });
        continue;
      }

      // Preserve tool_call_id on tool results, required by OpenAI-compatible APIs.
      if (m.role === 'tool') {
        const toolCallId = m.tool_call_id || m.toolCallId;
        if (!toolCallId && this.isDev) {
          console.error('[provider:openai] missing tool_call_id on tool message', m);
        }
        result.push({
          role: 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
          tool_call_id: toolCallId,
        });
        continue;
      }

      if (m.role === 'user' || m.role === 'assistant') {
        result.push({
          role: m.role,
          content: m.content,
        });
      }
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
          const completedToolCalls = Array.from(toolCallsInProgress.entries()).map(([index, tc]) => ({
            id: tc.id || `tool_call_${index}`,
            name: tc.name,
            arguments: tc.arguments,
          }));

          for (const tc of completedToolCalls) {
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
            rawAssistantMessage.tool_calls = completedToolCalls.map((tc) => ({
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
    const toolMessages = results.map((r, index) => ({
      role: 'tool' as const,
      tool_call_id: r.toolCallId || `tool_call_${index}`,
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
