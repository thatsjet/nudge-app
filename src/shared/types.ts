export type ProviderId = 'anthropic' | 'openai' | 'custom';

export interface IdeaFrontmatter {
  status: 'active' | 'someday' | 'paused' | 'done';
  priority: 'high' | 'medium' | 'low';
  type: 'work' | 'personal';
  energy: 'low' | 'medium' | 'high';
  size: 'small' | 'medium' | 'large';
  tags: string[];
  started: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface AppSettings {
  vaultPath: string;
  theme: 'light' | 'dark' | 'system';
  model: string;
  activeProvider: ProviderId;
  onboardingComplete: boolean;
  autoCheckUpdates: boolean;
}

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

export interface ToolUseRequest {
  name: 'read_file' | 'write_file' | 'edit_file' | 'list_files' | 'create_file' | 'move_file' | 'archive_tasks';
  input: Record<string, string>;
}

export interface NudgeAPI {
  app: {
    getSystemPrompt: () => Promise<string>;
    getVersion: () => Promise<string>;
    onMenuSave: (callback: () => void) => () => void;
    onCheckForUpdates: (callback: () => void) => () => void;
  };
  vault: {
    readFile: (path: string) => Promise<string>;
    readFrontmatter: (path: string) => Promise<Record<string, string> | null>;
    writeFile: (path: string, content: string) => Promise<void>;
    editFile: (path: string, oldText: string, newText: string) => Promise<void>;
    listFiles: (directory: string) => Promise<string[]>;
    createFile: (path: string, content: string) => Promise<void>;
    moveFile: (source: string, destination: string) => Promise<void>;
    getPath: () => Promise<string>;
    initialize: (path: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
  api: {
    sendMessage: (
      messages: ChatMessage[],
      systemPrompt: string,
      provider: ProviderId,
      model: string,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (error: string) => void
    ) => Promise<() => void>;
    validateKey: (provider: ProviderId, key: string, baseUrl?: string, model?: string) => Promise<boolean>;
  };
  settings: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    getApiKey: (provider: ProviderId) => Promise<string | null>;
    setApiKey: (provider: ProviderId, key: string) => Promise<void>;
    getProviderBaseUrl: (provider: ProviderId) => Promise<string | null>;
    setProviderBaseUrl: (provider: ProviderId, url: string) => Promise<void>;
  };
  updater: {
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
    getStatus: () => Promise<UpdateStatus>;
    onStatusChange: (callback: (status: UpdateStatus) => void) => () => void;
  };
  sessions: {
    list: () => Promise<Session[]>;
    get: (id: string) => Promise<Session | null>;
    create: () => Promise<Session>;
    addMessage: (sessionId: string, message: ChatMessage) => Promise<void>;
  };
}

declare global {
  interface Window {
    nudge: NudgeAPI;
  }
}
