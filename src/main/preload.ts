import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nudge', {
  vault: {
    readFile: (path: string) => ipcRenderer.invoke('vault:read-file', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('vault:write-file', path, content),
    editFile: (path: string, oldText: string, newText: string) => ipcRenderer.invoke('vault:edit-file', path, oldText, newText),
    listFiles: (directory: string) => ipcRenderer.invoke('vault:list-files', directory),
    createFile: (path: string, content: string) => ipcRenderer.invoke('vault:create-file', path, content),
    getPath: () => ipcRenderer.invoke('vault:get-path'),
    initialize: (path: string) => ipcRenderer.invoke('vault:initialize', path),
    exists: (path: string) => ipcRenderer.invoke('vault:exists', path),
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
      const chunkHandler = (_event: any, chunk: string) => onChunk(chunk);
      const doneHandler = () => {
        cleanup();
        onDone();
      };
      const errorHandler = (_event: any, error: string) => {
        cleanup();
        onError(error);
      };
      const toolHandler = (_event: any, tools: string[]) => {
        // Could emit a tool-use event in the future
      };

      function cleanup() {
        ipcRenderer.removeListener('api:stream-chunk', chunkHandler);
        ipcRenderer.removeListener('api:stream-done', doneHandler);
        ipcRenderer.removeListener('api:stream-error', errorHandler);
        ipcRenderer.removeListener('api:tool-use', toolHandler);
      }

      ipcRenderer.on('api:stream-chunk', chunkHandler);
      ipcRenderer.on('api:stream-done', doneHandler);
      ipcRenderer.on('api:stream-error', errorHandler);
      ipcRenderer.on('api:tool-use', toolHandler);

      ipcRenderer.invoke('api:send-message', messages, systemPrompt, provider, model);

      return () => {
        cleanup();
        ipcRenderer.invoke('api:cancel-stream');
      };
    },
    validateKey: (provider: string, key: string, baseUrl?: string) =>
      ipcRenderer.invoke('api:validate-key', provider, key, baseUrl),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getApiKey: (provider: string) => ipcRenderer.invoke('settings:get-api-key', provider),
    setApiKey: (provider: string, key: string) => ipcRenderer.invoke('settings:set-api-key', provider, key),
    getProviderBaseUrl: (provider: string) => ipcRenderer.invoke('settings:get-provider-base-url', provider),
    setProviderBaseUrl: (provider: string, url: string) => ipcRenderer.invoke('settings:set-provider-base-url', provider, url),
  },
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id: string) => ipcRenderer.invoke('sessions:get', id),
    create: () => ipcRenderer.invoke('sessions:create'),
    addMessage: (sessionId: string, message: any) => ipcRenderer.invoke('sessions:add-message', sessionId, message),
  },
});
