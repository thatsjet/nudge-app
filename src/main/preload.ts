import { contextBridge, ipcRenderer } from 'electron';

const IS_DEV = process.argv.includes('--dev');
let invokeSeq = 0;

function truncate(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... [len=${value.length}]`;
}

function summarize(value: any, keyHint = '', depth = 0): any {
  if (depth > 3) return '[depth-limit]';

  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    if (/(^|[-_])(api[-_]?key|key|token|password|authorization)($|[-_])/i.test(keyHint)) {
      return `<redacted len=${value.length}>`;
    }
    if (keyHint === 'systemPrompt') {
      return `<systemPrompt len=${value.length}>`;
    }
    if (keyHint === 'content') {
      return `<content len=${value.length}>`;
    }
    return truncate(value);
  }

  if (Array.isArray(value)) {
    const maxItems = 10;
    const mapped = value.slice(0, maxItems).map((item) => summarize(item, '', depth + 1));
    if (value.length > maxItems) mapped.push(`[+${value.length - maxItems} more]`);
    return mapped;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if (keyHint === 'messages' && Array.isArray(value)) {
      return value.map((m: any) => ({
        role: m?.role,
        contentLength: typeof m?.content === 'string' ? m.content.length : undefined,
      }));
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = summarize(v, k, depth + 1);
    }
    return out;
  }

  return String(value);
}

function devLog(scope: string, message: string, payload?: any): void {
  if (!IS_DEV) return;
  const ts = new Date().toISOString();
  if (payload === undefined) {
    // eslint-disable-next-line no-console
    console.log(`[${ts}] [preload:${scope}] ${message}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [preload:${scope}] ${message}`, summarize(payload));
}

function sanitizeInvokeArgs(channel: string, args: any[]): any {
  if (channel === 'api:send-message') {
    return {
      provider: args[2],
      model: args[3],
      messageCount: Array.isArray(args[0]) ? args[0].length : 0,
      systemPromptLength: typeof args[1] === 'string' ? args[1].length : 0,
    };
  }
  if (channel === 'api:validate-key') {
    return {
      provider: args[0],
      keyLength: typeof args[1] === 'string' ? args[1].length : 0,
      baseUrl: args[2] || '(default)',
      model: args[3] || '(default)',
    };
  }
  if (channel === 'settings:set-api-key') {
    return {
      provider: args[0],
      keyLength: typeof args[1] === 'string' ? args[1].length : 0,
    };
  }
  if (channel === 'settings:get-api-key') {
    return { provider: args[0] };
  }
  return args;
}

function sanitizeInvokeResult(channel: string, result: any): any {
  if (channel === 'settings:get-api-key') {
    return result ? `<redacted len=${String(result).length}>` : null;
  }
  return result;
}

async function invoke<T>(channel: string, ...args: any[]): Promise<T> {
  const reqId = ++invokeSeq;
  devLog('ipc', `invoke -> ${channel} (#${reqId})`, sanitizeInvokeArgs(channel, args));
  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    devLog('ipc', `invoke <- ${channel} (#${reqId})`, sanitizeInvokeResult(channel, result));
    return result as T;
  } catch (error: any) {
    devLog('ipc', `invoke !! ${channel} (#${reqId})`, {
      message: error?.message || String(error),
      stack: error?.stack ? truncate(error.stack, 400) : undefined,
    });
    throw error;
  }
}

contextBridge.exposeInMainWorld('nudge', {
  vault: {
    readFile: (path: string) => invoke('vault:read-file', path),
    writeFile: (path: string, content: string) => invoke('vault:write-file', path, content),
    editFile: (path: string, oldText: string, newText: string) => invoke('vault:edit-file', path, oldText, newText),
    listFiles: (directory: string) => invoke('vault:list-files', directory),
    createFile: (path: string, content: string) => invoke('vault:create-file', path, content),
    getPath: () => invoke('vault:get-path'),
    initialize: (path: string) => invoke('vault:initialize', path),
    exists: (path: string) => invoke('vault:exists', path),
  },
  api: {
    sendMessage: (
      messages: any[],
      systemPrompt: string,
      provider: string,
      model: string,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (error: string) => void
    ) => {
      let chunkCount = 0;
      const chunkHandler = (_event: any, chunk: string) => onChunk(chunk);
      const doneHandler = () => {
        devLog('stream', 'done', { chunkCount });
        cleanup();
        onDone();
      };
      const errorHandler = (_event: any, error: string) => {
        devLog('stream', 'error', { error });
        cleanup();
        onError(error);
      };
      const toolHandler = (_event: any, tools: string[]) => {
        devLog('stream', 'tool-use', { tools });
      };

      function cleanup() {
        devLog('stream', 'cleanup listeners');
        ipcRenderer.removeListener('api:stream-chunk', chunkHandler);
        ipcRenderer.removeListener('api:stream-chunk', loggingChunkHandler);
        ipcRenderer.removeListener('api:stream-done', doneHandler);
        ipcRenderer.removeListener('api:stream-error', errorHandler);
        ipcRenderer.removeListener('api:tool-use', toolHandler);
      }

      const loggingChunkHandler = (_event: any, chunk: string) => {
        chunkCount += 1;
        if (chunkCount === 1 || chunkCount % 25 === 0) {
          devLog('stream', 'chunk', { chunkCount, chunkLength: chunk?.length || 0 });
        }
      };

      ipcRenderer.on('api:stream-chunk', chunkHandler);
      ipcRenderer.on('api:stream-chunk', loggingChunkHandler);
      ipcRenderer.on('api:stream-done', doneHandler);
      ipcRenderer.on('api:stream-error', errorHandler);
      ipcRenderer.on('api:tool-use', toolHandler);

      void invoke('api:send-message', messages, systemPrompt, provider, model).catch((error) => {
        devLog('stream', 'send-message invoke failed', { message: error?.message || String(error) });
      });

      return () => {
        cleanup();
        void invoke('api:cancel-stream').catch((error) => {
          devLog('stream', 'cancel-stream invoke failed', { message: error?.message || String(error) });
        });
      };
    },
    validateKey: (provider: string, key: string, baseUrl?: string, model?: string) =>
      invoke('api:validate-key', provider, key, baseUrl, model),
  },
  settings: {
    get: (key: string) => invoke('settings:get', key),
    set: (key: string, value: any) => invoke('settings:set', key, value),
    getApiKey: (provider: string) => invoke('settings:get-api-key', provider),
    setApiKey: (provider: string, key: string) => invoke('settings:set-api-key', provider, key),
    getProviderBaseUrl: (provider: string) => invoke('settings:get-provider-base-url', provider),
    setProviderBaseUrl: (provider: string, url: string) => invoke('settings:set-provider-base-url', provider, url),
  },
  sessions: {
    list: () => invoke('sessions:list'),
    get: (id: string) => invoke('sessions:get', id),
    create: () => invoke('sessions:create'),
    addMessage: (sessionId: string, message: any) => invoke('sessions:add-message', sessionId, message),
  },
});
