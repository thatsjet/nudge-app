import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getProvider, resetProvider } from './providers/registry';
import { VAULT_TOOLS } from './providers/tools';
import { ProviderId } from './providers/types';

let mainWindow: BrowserWindow | null = null;
const IS_DEV = process.argv.includes('--dev');
const DEV_LOG_DIR = 'logs';
const DEV_LOG_FILE = 'dev.log';

function truncate(value: string, max = 220): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... [len=${value.length}]`;
}

function summarizeForLog(value: any, keyHint = '', depth = 0): any {
  if (depth > 3) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    if (/(^|[-_])(api[-_]?key|key|token|password|authorization)($|[-_])/i.test(keyHint)) {
      return `<redacted len=${value.length}>`;
    }
    if (keyHint === 'systemPrompt') return `<systemPrompt len=${value.length}>`;
    if (keyHint === 'content') return `<content len=${value.length}>`;
    return truncate(value);
  }

  if (Array.isArray(value)) {
    const maxItems = 10;
    const mapped = value.slice(0, maxItems).map((item) => summarizeForLog(item, '', depth + 1));
    if (value.length > maxItems) mapped.push(`[+${value.length - maxItems} more]`);
    return mapped;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = summarizeForLog(v, k, depth + 1);
    }
    return out;
  }

  return String(value);
}

function appendDevLog(line: string): void {
  if (!IS_DEV || !app.isReady()) return;
  try {
    const logDir = path.join(app.getPath('userData'), DEV_LOG_DIR);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(path.join(logDir, DEV_LOG_FILE), `${line}\n`, 'utf-8');
  } catch {
    // best effort only
  }
}

function devLog(scope: string, message: string, payload?: any): void {
  if (!IS_DEV) return;
  const ts = new Date().toISOString();
  const base = `[${ts}] [main:${scope}] ${message}`;
  if (payload === undefined) {
    console.log(base);
    appendDevLog(base);
    return;
  }
  const summarized = summarizeForLog(payload);
  console.log(base, summarized);
  appendDevLog(`${base} ${JSON.stringify(summarized)}`);
}

function formatError(error: any): Record<string, any> {
  return {
    name: error?.name,
    message: error?.message || String(error),
    code: error?.code,
    status: error?.status,
    type: error?.type,
    stack: error?.stack ? truncate(error.stack, 500) : undefined,
  };
}

process.on('uncaughtException', (error) => {
  devLog('process', 'uncaught exception', formatError(error));
});

process.on('unhandledRejection', (reason) => {
  devLog('process', 'unhandled rejection', formatError(reason));
});

// Settings store (simple JSON file in app data)
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const sessionsDir = path.join(app.getPath('userData'), 'sessions');

function loadSettings(): Record<string, any> {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch {}
  return {
    vaultPath: path.join(app.getPath('home'), 'Nudge'),
    theme: 'system',
    model: 'claude-sonnet-4-5',
    activeProvider: 'anthropic',
    onboardingComplete: false,
  };
}

function saveSettings(settings: Record<string, any>) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getVaultPath(): string {
  const settings = loadSettings();
  return settings.vaultPath || path.join(app.getPath('home'), 'Nudge');
}

function resolveVaultPath(relativePath: string): string {
  const vaultPath = getVaultPath();
  const resolved = path.resolve(vaultPath, relativePath);
  // Security: ensure the resolved path is within the vault
  if (!resolved.startsWith(vaultPath)) {
    throw new Error('Path is outside the vault directory');
  }
  return resolved;
}

function createWindow() {
  devLog('lifecycle', 'creating browser window', { isDev: IS_DEV });
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (IS_DEV) {
    devLog('lifecycle', 'loading renderer from dev server', { url: 'http://localhost:5173' });
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    devLog('lifecycle', 'loading renderer from built index', { mode: 'packaged' });
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  if (IS_DEV) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      devLog('renderer-console', 'console message', { level, message, line, sourceId });
    });
    mainWindow.webContents.on('did-finish-load', () => {
      devLog('lifecycle', 'renderer finished load');
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      devLog('lifecycle', 'renderer failed load', { errorCode, errorDescription, validatedURL });
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      devLog('lifecycle', 'renderer process gone', details);
    });
  }

  mainWindow.on('closed', () => {
    devLog('lifecycle', 'window closed');
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    devLog('window', 'opening external link', { url });
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// --- Vault IPC Handlers ---

ipcMain.handle('vault:read-file', async (_event, relativePath: string) => {
  const fullPath = resolveVaultPath(relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
});

ipcMain.handle('vault:write-file', async (_event, relativePath: string, content: string) => {
  const fullPath = resolveVaultPath(relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, 'utf-8');
});

ipcMain.handle('vault:edit-file', async (_event, relativePath: string, oldText: string, newText: string) => {
  const fullPath = resolveVaultPath(relativePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  if (!content.includes(oldText)) {
    throw new Error(`Text not found in file: ${relativePath}`);
  }
  const updated = content.replace(oldText, newText);
  fs.writeFileSync(fullPath, updated, 'utf-8');
});

ipcMain.handle('vault:list-files', async (_event, directory: string) => {
  const fullPath = resolveVaultPath(directory);
  if (!fs.existsSync(fullPath)) {
    return [];
  }
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  return entries
    .filter(e => !e.name.startsWith('.'))
    .map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: path.join(directory, e.name),
    }));
});

ipcMain.handle('vault:create-file', async (_event, relativePath: string, content: string) => {
  const fullPath = resolveVaultPath(relativePath);
  ensureDir(path.dirname(fullPath));
  if (fs.existsSync(fullPath)) {
    throw new Error(`File already exists: ${relativePath}`);
  }
  fs.writeFileSync(fullPath, content, 'utf-8');
});

ipcMain.handle('vault:get-path', async () => {
  return getVaultPath();
});

ipcMain.handle('app:get-system-prompt', async () => {
  const bundledPath = path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, 'app-bundle')
      : path.join(__dirname, '../app-bundle'),
    'system-prompt.md'
  );
  return fs.readFileSync(bundledPath, 'utf-8');
});

ipcMain.handle('vault:initialize', async (_event, vaultPath: string) => {
  ensureDir(vaultPath);
  // Copy default vault template
  const defaultVaultPath = path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, 'default-vault')
      : path.join(__dirname, '../default-vault')
  );

  function copyDir(src: string, dest: string) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  if (fs.existsSync(defaultVaultPath)) {
    copyDir(defaultVaultPath, vaultPath);
  } else {
    // Create minimal structure if default-vault not found
    ensureDir(path.join(vaultPath, 'ideas'));
    ensureDir(path.join(vaultPath, 'daily'));
    if (!fs.existsSync(path.join(vaultPath, 'tasks.md'))) {
      fs.writeFileSync(path.join(vaultPath, 'tasks.md'), '# Tasks\n\nQuick things to do.\n\n## Today\n\n## Recurring Daily\n\n## Recurring Weekly\n\n## Later\n');
    }
    if (!fs.existsSync(path.join(vaultPath, 'config.md'))) {
      fs.writeFileSync(path.join(vaultPath, 'config.md'), '# Config\n\n## About Me\n\n## Mantra\n\n**"Starting is success, completion is optional."**\n\n## Energy Patterns\n\n- Morning: \n- Afternoon: \n- Evening: \n\n## Preferences\n\n## Current Focus Areas\n');
    }
  }

  const settings = loadSettings();
  settings.vaultPath = vaultPath;
  saveSettings(settings);
});

ipcMain.handle('vault:exists', async (_event, relativePath: string) => {
  try {
    const fullPath = resolveVaultPath(relativePath);
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
});

// --- Settings IPC Handlers ---

ipcMain.handle('settings:get', async (_event, key: string) => {
  const settings = loadSettings();
  return settings[key];
});

ipcMain.handle('settings:set', async (_event, key: string, value: any) => {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
});

ipcMain.handle('settings:get-api-key', async (_event, providerId: string) => {
  try {
    const keytar = require('keytar');
    return await keytar.getPassword('nudge-app', `api-key-${providerId}`);
  } catch {
    const settings = loadSettings();
    return settings[`apiKey-${providerId}`] || null;
  }
});

ipcMain.handle('settings:set-api-key', async (_event, providerId: string, key: string) => {
  try {
    const keytar = require('keytar');
    await keytar.setPassword('nudge-app', `api-key-${providerId}`, key);
  } catch {
    const settings = loadSettings();
    settings[`apiKey-${providerId}`] = key;
    saveSettings(settings);
  }
  resetProvider(providerId as ProviderId);
});

ipcMain.handle('settings:get-provider-base-url', async (_event, providerId: string) => {
  const settings = loadSettings();
  return settings[`baseUrl-${providerId}`] || null;
});

ipcMain.handle('settings:set-provider-base-url', async (_event, providerId: string, url: string) => {
  devLog('settings', 'set provider base URL', { providerId, url });
  const settings = loadSettings();
  settings[`baseUrl-${providerId}`] = url;
  saveSettings(settings);
  resetProvider(providerId as ProviderId);
});

// --- Session IPC Handlers ---

ipcMain.handle('sessions:list', async () => {
  ensureDir(sessionsDir);
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  const sessions = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf-8'));
    return { ...data, messages: undefined }; // Don't send full messages in list
  });
  sessions.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  return sessions;
});

ipcMain.handle('sessions:get', async (_event, id: string) => {
  const filePath = path.join(sessionsDir, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
});

ipcMain.handle('sessions:create', async () => {
  ensureDir(sessionsDir);
  const { v4: uuidv4 } = require('uuid');
  const session = {
    id: uuidv4(),
    title: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  fs.writeFileSync(path.join(sessionsDir, `${session.id}.json`), JSON.stringify(session, null, 2));
  return session;
});

ipcMain.handle('sessions:add-message', async (_event, sessionId: string, message: any) => {
  const filePath = path.join(sessionsDir, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) throw new Error('Session not found');
  const session = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  session.messages.push(message);
  session.updatedAt = Date.now();
  // Update title from first user message if it's still the default
  if (session.messages.filter((m: any) => m.role === 'user').length === 1 && message.role === 'user') {
    session.title = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
  }
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
});

// --- API IPC Handlers ---

// Process tool calls (provider-agnostic — works with any LLM)
async function processToolCall(toolName: string, toolInput: Record<string, string>): Promise<string> {
  const vaultPath = getVaultPath();

  switch (toolName) {
    case 'read_file': {
      const fullPath = path.resolve(vaultPath, toolInput.path);
      if (!fullPath.startsWith(vaultPath)) throw new Error('Path outside vault');
      if (!fs.existsSync(fullPath)) return `Error: File not found: ${toolInput.path}`;
      return fs.readFileSync(fullPath, 'utf-8');
    }
    case 'write_file': {
      const fullPath = path.resolve(vaultPath, toolInput.path);
      if (!fullPath.startsWith(vaultPath)) throw new Error('Path outside vault');
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, toolInput.content, 'utf-8');
      return `File written: ${toolInput.path}`;
    }
    case 'edit_file': {
      const fullPath = path.resolve(vaultPath, toolInput.path);
      if (!fullPath.startsWith(vaultPath)) throw new Error('Path outside vault');
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(toolInput.old_text)) return `Error: Text not found in ${toolInput.path}`;
      fs.writeFileSync(fullPath, content.replace(toolInput.old_text, toolInput.new_text), 'utf-8');
      return `File edited: ${toolInput.path}`;
    }
    case 'list_files': {
      const fullPath = path.resolve(vaultPath, toolInput.directory || '');
      if (!fullPath.startsWith(vaultPath)) throw new Error('Path outside vault');
      if (!fs.existsSync(fullPath)) return '[]';
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const result = entries
        .filter(e => !e.name.startsWith('.'))
        .map(e => `${e.isDirectory() ? '📁 ' : '📄 '}${e.name}`)
        .join('\n');
      return result || '(empty directory)';
    }
    case 'create_file': {
      const fullPath = path.resolve(vaultPath, toolInput.path);
      if (!fullPath.startsWith(vaultPath)) throw new Error('Path outside vault');
      if (fs.existsSync(fullPath)) return `Error: File already exists: ${toolInput.path}`;
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, toolInput.content, 'utf-8');
      return `File created: ${toolInput.path}`;
    }
    default:
      return `Unknown tool: ${toolName}`;
  }
}

let currentAbort: (() => void) | null = null;

ipcMain.handle('api:send-message', async (event, messages: any[], systemPrompt: string, providerId: string, model: string) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  devLog('api:send-message', 'start', {
    requestId,
    providerId,
    model,
    messageCount: messages?.length || 0,
    systemPromptLength: typeof systemPrompt === 'string' ? systemPrompt.length : 0,
  });
  try {
    const provider = getProvider(providerId as ProviderId);

    // Get API key and configure provider
    let apiKey: string | null = null;
    try {
      const keytar = require('keytar');
      apiKey = await keytar.getPassword('nudge-app', `api-key-${providerId}`);
    } catch {
      const settings = loadSettings();
      apiKey = settings[`apiKey-${providerId}`] || null;
    }
    if (!apiKey) throw new Error('API key not configured. Open Settings to add one.');

    const settings = loadSettings();
    const baseUrl = settings[`baseUrl-${providerId}`] || undefined;
    provider.configure(apiKey, baseUrl);
    devLog('api:send-message', 'provider configured', {
      requestId,
      providerId,
      model,
      baseUrl: baseUrl || '(default)',
      apiKeyLength: apiKey.length,
    });

    // Cancel any existing stream
    if (currentAbort) {
      devLog('api:send-message', 'canceling previous stream', { requestId });
      currentAbort();
    }

    // Agentic loop: keep calling the API while there are tool uses
    let currentMessages = [...messages];
    let continueLoop = true;
    let round = 0;

    while (continueLoop) {
      round += 1;
      devLog('api:send-message', 'round start', {
        requestId,
        round,
        currentMessageCount: currentMessages.length,
      });
      const { result, abort } = provider.sendMessageStream({
        messages: currentMessages,
        systemPrompt,
        model,
        tools: VAULT_TOOLS,
        onText: (chunk) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('api:stream-chunk', chunk);
          }
        },
      });

      currentAbort = abort;

      const roundResult = await result;
      devLog('api:send-message', 'round complete', {
        requestId,
        round,
        textLength: roundResult.textContent.length,
        toolCallCount: roundResult.toolCalls.length,
        toolNames: roundResult.toolCalls.map((c) => c.name),
      });

      if (roundResult.toolCalls.length > 0) {
        // Process tool calls
        const toolResults = [];
        for (const call of roundResult.toolCalls) {
          devLog('api:send-message', 'executing tool call', {
            requestId,
            round,
            toolName: call.name,
            toolCallId: call.id,
          });
          const toolResult = await processToolCall(call.name, call.arguments);
          toolResults.push({ toolCallId: call.id, content: toolResult });
        }

        // Build follow-up messages in provider-native format
        const followUp = provider.buildToolResultMessages(
          roundResult.rawAssistantMessage,
          toolResults
        );
        currentMessages = [...currentMessages, ...followUp];

        // Signal tool use to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('api:tool-use', roundResult.toolCalls.map((c) => c.name));
        }
      } else {
        continueLoop = false;
      }
    }

    devLog('api:send-message', 'complete', { requestId });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api:stream-done');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      devLog('api:send-message', 'aborted', { requestId });
      return;
    }
    devLog('api:send-message', 'error', { requestId, error: formatError(error) });
    const message = error?.message || 'Unknown error';
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api:stream-error', message);
    }
  }
});

ipcMain.handle('api:cancel-stream', async () => {
  devLog('api:cancel-stream', 'received cancel request', { hasCurrentAbort: !!currentAbort });
  if (currentAbort) {
    currentAbort();
    currentAbort = null;
  }
});

ipcMain.handle('api:validate-key', async (_event, providerId: string, key: string, baseUrl?: string, model?: string) => {
  try {
    devLog('api:validate-key', 'start', {
      providerId,
      baseUrl: baseUrl || '(default)',
      model: model || '(default)',
      keyLength: key?.length || 0,
    });
    const provider = getProvider(providerId as ProviderId);
    const valid = await provider.validateKey(key, baseUrl, model);
    devLog('api:validate-key', 'result', {
      providerId,
      baseUrl: baseUrl || '(default)',
      model: model || '(default)',
      valid,
    });
    return valid;
  } catch (error: any) {
    devLog('api:validate-key', 'error', {
      providerId,
      baseUrl: baseUrl || '(default)',
      model: model || '(default)',
      error: formatError(error),
    });
    return false;
  }
});

// --- App Lifecycle ---

// Migrate old single API key to new provider-aware format
async function migrateApiKey() {
  devLog('migration', 'starting API key migration check');
  try {
    const keytar = require('keytar');
    const oldKey = await keytar.getPassword('nudge-app', 'anthropic-api-key');
    if (oldKey) {
      await keytar.setPassword('nudge-app', 'api-key-anthropic', oldKey);
      await keytar.deletePassword('nudge-app', 'anthropic-api-key');
      devLog('migration', 'migrated keytar anthropic key', { migrated: true });
    }
  } catch {}
  // Also migrate settings-file fallback
  const settings = loadSettings();
  if (settings.apiKey && !settings['apiKey-anthropic']) {
    settings['apiKey-anthropic'] = settings.apiKey;
    delete settings.apiKey;
    saveSettings(settings);
    devLog('migration', 'migrated fallback settings API key', { migrated: true });
  }
}

app.whenReady().then(async () => {
  devLog('lifecycle', 'app ready');
  devLog('lifecycle', 'dev log file', { path: path.join(app.getPath('userData'), DEV_LOG_DIR, DEV_LOG_FILE) });
  await migrateApiKey();

  // Set up application menu so standard shortcuts (Cmd+Q, Cmd+C, etc.) work
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:save');
            }
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  devLog('lifecycle', 'window-all-closed', { platform: process.platform });
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
