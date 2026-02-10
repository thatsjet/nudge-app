import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

let mainWindow: BrowserWindow | null = null;
let anthropicClient: Anthropic | null = null;

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
    model: 'claude-sonnet-4-20250514',
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

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// --- Vault IPC Handlers ---

ipcMain.handle('vault:read-file', async (_event, relativePath: string) => {
  const fullPath = resolveVaultPath(relativePath);
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

ipcMain.handle('vault:initialize', async (_event, vaultPath: string) => {
  ensureDir(vaultPath);
  // Copy default vault template
  const defaultVaultPath = path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, 'default-vault')
      : path.join(__dirname, '../../default-vault')
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

ipcMain.handle('settings:get-api-key', async () => {
  try {
    const keytar = require('keytar');
    return await keytar.getPassword('nudge-app', 'anthropic-api-key');
  } catch {
    // Fallback to settings file if keytar not available
    const settings = loadSettings();
    return settings.apiKey || null;
  }
});

ipcMain.handle('settings:set-api-key', async (_event, key: string) => {
  try {
    const keytar = require('keytar');
    await keytar.setPassword('nudge-app', 'anthropic-api-key', key);
  } catch {
    // Fallback to settings file if keytar not available
    const settings = loadSettings();
    settings.apiKey = key;
    saveSettings(settings);
  }
  // Reset client so it picks up new key
  anthropicClient = null;
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

async function getAnthropicClient(): Promise<Anthropic> {
  if (anthropicClient) return anthropicClient;

  let apiKey: string | null = null;
  try {
    const keytar = require('keytar');
    apiKey = await keytar.getPassword('nudge-app', 'anthropic-api-key');
  } catch {
    const settings = loadSettings();
    apiKey = settings.apiKey || null;
  }

  if (!apiKey) {
    throw new Error('API key not configured');
  }

  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

// Tool definitions for Claude
const vaultTools: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the vault. Use this to check tasks, ideas, config, daily logs, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to vault root (e.g., "tasks.md", "ideas/my-idea.md")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file in the vault.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Make a targeted edit to a file by replacing specific text. Use this for checking off tasks, updating status, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
        old_text: { type: 'string', description: 'The exact text to find and replace' },
        new_text: { type: 'string', description: 'The text to replace it with' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a vault directory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        directory: { type: 'string', description: 'Directory path relative to vault root (e.g., "ideas/", "daily/")' },
      },
      required: ['directory'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new file in the vault. Fails if the file already exists.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
];

// Process tool calls from Claude
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

let streamAbortController: AbortController | null = null;

ipcMain.handle('api:send-message', async (event, messages: any[], systemPrompt: string, model: string) => {
  try {
    const client = await getAnthropicClient();

    // Cancel any existing stream
    if (streamAbortController) {
      streamAbortController.abort();
    }
    streamAbortController = new AbortController();

    // Convert messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Agentic loop: keep calling the API while there are tool uses
    let currentMessages = [...anthropicMessages];
    let continueLoop = true;

    while (continueLoop) {
      const stream = client.messages.stream({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: currentMessages,
        tools: vaultTools,
      });

      let fullResponse = '';
      let toolUseBlocks: any[] = [];
      let currentToolUse: any = null;

      stream.on('text', (text: string) => {
        fullResponse += text;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('api:stream-chunk', text);
        }
      });

      // Collect the final message
      const finalMessage = await stream.finalMessage();

      // Check for tool use blocks
      toolUseBlocks = finalMessage.content.filter((block: any) => block.type === 'tool_use');

      if (toolUseBlocks.length > 0) {
        // Process tool calls
        const toolResults: any[] = [];
        for (const toolBlock of toolUseBlocks) {
          const result = await processToolCall(toolBlock.name, toolBlock.input as Record<string, string>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result,
          });
        }

        // Add assistant message and tool results to continue the loop
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: finalMessage.content },
          { role: 'user', content: toolResults },
        ];

        // Signal that the AI is working on something (tool use indicator)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('api:tool-use', toolUseBlocks.map((b: any) => b.name));
        }
      } else {
        // No more tool calls — we're done
        continueLoop = false;
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api:stream-done');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') return;
    const message = error?.message || 'Unknown error';
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api:stream-error', message);
    }
  }
});

ipcMain.handle('api:cancel-stream', async () => {
  if (streamAbortController) {
    streamAbortController.abort();
    streamAbortController = null;
  }
});

ipcMain.handle('api:validate-key', async (_event, key: string) => {
  try {
    const testClient = new Anthropic({ apiKey: key });
    await testClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    return true;
  } catch {
    return false;
  }
});

// --- App Lifecycle ---

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
