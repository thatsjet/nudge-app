// Duplicated from shared/types.ts to avoid cross-rootDir imports
// (tsconfig.electron.json has rootDir: src/main)
export type ProviderId = 'anthropic' | 'openai' | 'custom';

export interface ChatMessageShape {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Provider-neutral tool definition (JSON Schema based)
export interface NeutralToolDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

// Provider-neutral tool call result from model
export interface NeutralToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

// Result of a single streaming round
export interface StreamRoundResult {
  textContent: string;
  toolCalls: NeutralToolCall[];
  rawAssistantMessage: any;
}

export interface ModelOption {
  value: string;
  label: string;
}

export interface LLMProvider {
  id: string;

  // Initialize the SDK client with credentials
  configure(apiKey: string, baseUrl?: string): void;

  // Validate that the API key (and optional baseUrl) works
  validateKey(apiKey: string, baseUrl?: string, model?: string): Promise<boolean>;

  // Send a streaming message, returns a promise that resolves when the round is done
  sendMessageStream(params: {
    messages: ChatMessageShape[];
    systemPrompt: string;
    model: string;
    tools: NeutralToolDef[];
    onText: (chunk: string) => void;
  }): {
    result: Promise<StreamRoundResult>;
    abort: () => void;
  };

  // Build follow-up messages for tool results in the provider's native format.
  // Returns messages to append to the conversation for the next API call.
  buildToolResultMessages(
    rawAssistantMessage: any,
    results: Array<{ toolCallId: string; content: string }>
  ): any[];

  // Return default models for this provider
  getDefaultModels(): ModelOption[];
}

// Auto-updater types (duplicated from shared/types.ts)
export interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'not-available' }
  | { state: 'downloading'; progress: UpdateProgress }
  | { state: 'downloaded'; info: UpdateInfo }
  | { state: 'error'; message: string };
