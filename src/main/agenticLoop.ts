import { LLMProvider, NeutralToolDef, ChatMessageShape } from './providers/types';

interface AgenticLoopParams {
  provider: LLMProvider;
  messages: ChatMessageShape[];
  systemPrompt: string;
  model: string;
  tools: NeutralToolDef[];
  processToolCall: (name: string, args: Record<string, string>) => Promise<string>;
  onText?: (chunk: string) => void;
  onToolUse?: (toolNames: string[]) => void;
  setAbort?: (abort: (() => void) | null) => void;
}

interface AgenticLoopResult {
  fullText: string;
}

export async function runAgenticLoop(params: AgenticLoopParams): Promise<AgenticLoopResult> {
  const {
    provider,
    messages,
    systemPrompt,
    model,
    tools,
    processToolCall,
    onText,
    onToolUse,
    setAbort,
  } = params;

  let currentMessages = [...messages];
  let continueLoop = true;
  let fullText = '';

  while (continueLoop) {
    const { result, abort } = provider.sendMessageStream({
      messages: currentMessages,
      systemPrompt,
      model,
      tools,
      onText: (chunk) => {
        fullText += chunk;
        onText?.(chunk);
      },
    });

    setAbort?.(abort);

    const roundResult = await result;

    if (roundResult.toolCalls.length > 0) {
      const toolResults = [];
      for (const call of roundResult.toolCalls) {
        const toolResult = await processToolCall(call.name, call.arguments);
        toolResults.push({ toolCallId: call.id, content: toolResult });
      }

      const followUp = provider.buildToolResultMessages(
        roundResult.rawAssistantMessage,
        toolResults
      );
      currentMessages = [...currentMessages, ...followUp];

      onToolUse?.(roundResult.toolCalls.map((c) => c.name));
    } else {
      continueLoop = false;
    }
  }

  setAbort?.(null);

  return { fullText };
}
