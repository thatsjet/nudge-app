# Scheduled Nudges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three scheduled daily nudges (morning, midday, end-of-day) that deliver personalized Claude-powered messages via OS notifications and in-app chat sessions.

**Architecture:** A `NudgeScheduler` class in the main process polls every 60 seconds, comparing current time against configured nudge times. When a nudge fires, it creates a new session, runs the agentic Claude loop with vault tools to generate a personalized message, shows an OS notification, and notifies the renderer. The core agentic loop is extracted from the existing IPC handler into a reusable helper.

**Tech Stack:** Electron (Notification API, BrowserWindow), existing LLM provider system, existing vault tools, Node.js timers.

**Spec:** `docs/superpowers/specs/2026-03-24-scheduled-nudges-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/main/nudgeScheduler.ts` | Create | NudgeScheduler class, nudge prompt constants, types |
| `src/main/agenticLoop.ts` | Create | Extracted reusable agentic loop helper |
| `src/main/main.ts` | Modify | Import scheduler + agentic loop, instantiate scheduler, add `update_nudge_settings` tool, add nudge defaults, wire notification click |
| `src/main/providers/tools.ts` | Modify | Add `update_nudge_settings` tool definition |
| `src/main/preload.ts` | Modify | Add `nudges` namespace with `onFired` and `onNavigate` listeners |
| `src/shared/types.ts` | Modify | Add nudge types, extend `NudgeAPI` interface |
| `src/renderer/App.tsx` | Modify | Register nudge event listeners |

---

### Task 1: Add Nudge Types

**Files:**
- Modify: `src/shared/types.ts:61-65` (after ToolUseRequest, before NudgeAPI)
- Modify: `src/main/nudgeScheduler.ts` (will use its own copy per tsconfig convention)

- [ ] **Step 1: Add types to `src/shared/types.ts`**

Add after the `ToolUseRequest` interface (line 64):

```typescript
export type NudgeType = 'morning' | 'midday' | 'endOfDay';

export interface NudgeConfig {
  enabled: boolean;
  time: string; // "HH:MM" 24-hour format
}

export interface NudgeSettings {
  morning: NudgeConfig;
  midday: NudgeConfig;
  endOfDay: NudgeConfig;
  doNotDisturb: boolean;
}
```

- [ ] **Step 2: Update `ToolUseRequest` to include the new tool**

Change the `name` union in `ToolUseRequest` (line 62) to add `'update_nudge_settings'`:

```typescript
export interface ToolUseRequest {
  name: 'read_file' | 'write_file' | 'edit_file' | 'list_files' | 'create_file' | 'move_file' | 'archive_tasks' | 'update_nudge_settings';
  input: Record<string, string>;
}
```

- [ ] **Step 3: Extend `NudgeAPI` interface with nudges namespace**

Add inside the `NudgeAPI` interface, after the `sessions` block (before the closing `}`):

```typescript
  nudges: {
    onFired: (callback: (data: { sessionId: string; type: string }) => void) => () => void;
    onNavigate: (callback: (data: { sessionId: string }) => void) => () => void;
  };
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: No errors (renderer tsconfig)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add nudge types and extend NudgeAPI interface (#43)"
```

---

### Task 2: Extract Agentic Loop Helper

**Files:**
- Create: `src/main/agenticLoop.ts`
- Modify: `src/main/main.ts:645-765` (the `api:send-message` handler)

- [ ] **Step 1: Create `src/main/agenticLoop.ts`**

This extracts the core agentic loop from `main.ts` lines 686-748 into a reusable function. The function takes provider, messages, system prompt, model, tools, a tool executor, and optional callbacks.

```typescript
import { LLMProvider, NeutralToolDef, NeutralToolCall, ChatMessageShape } from './providers/types';

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
```

- [ ] **Step 2: Refactor `api:send-message` in `main.ts` to use `runAgenticLoop`**

Replace the agentic loop section of `api:send-message` (lines 686-748) with a call to `runAgenticLoop`. Add the import at the top of `main.ts`:

```typescript
import { runAgenticLoop } from './agenticLoop';
```

Replace the while loop (lines 686-748) with:

```typescript
    const { fullText } = await runAgenticLoop({
      provider,
      messages,
      systemPrompt,
      model,
      tools: VAULT_TOOLS,
      processToolCall,
      onText: (chunk) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('api:stream-chunk', chunk);
        }
      },
      onToolUse: (toolNames) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('api:tool-use', toolNames);
        }
      },
      setAbort: (abort) => { currentAbort = abort; },
    });
```

Remove the now-unused local variables `currentMessages`, `continueLoop`, `round`, and the per-round devLog calls. The devLog calls at the handler boundaries (start, complete, error) stay.

- [ ] **Step 3: Verify the refactor compiles**

Run: `npx tsc -p tsconfig.electron.json`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Send a message in chat. Verify streaming still works, tool calls still work (e.g., "read my tasks").

- [ ] **Step 5: Commit**

```bash
git add src/main/agenticLoop.ts src/main/main.ts
git commit -m "refactor: extract agentic loop into reusable helper (#43)"
```

---

### Task 3: Create NudgeScheduler

**Files:**
- Create: `src/main/nudgeScheduler.ts`

- [ ] **Step 1: Create `src/main/nudgeScheduler.ts`**

```typescript
// Types duplicated from shared/types.ts per tsconfig convention
export type NudgeType = 'morning' | 'midday' | 'endOfDay';

export interface NudgeConfig {
  enabled: boolean;
  time: string; // "HH:MM" 24-hour format
}

export interface NudgeSettings {
  morning: NudgeConfig;
  midday: NudgeConfig;
  endOfDay: NudgeConfig;
  doNotDisturb: boolean;
}

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = {
  morning: { enabled: false, time: '08:00' },
  midday: { enabled: false, time: '11:00' },
  endOfDay: { enabled: false, time: '15:00' },
  doNotDisturb: false,
};

export const NUDGE_PROMPTS: Record<NudgeType, { title: string; sessionTitle: string; addendum: string }> = {
  morning: {
    title: 'Morning Nudge',
    sessionTitle: 'Morning Nudge',
    addendum: `\n\n---\n\n## Nudge Context\n\nThis is a morning nudge. Read the user's tasks and ideas from the vault, then suggest one small thing to start with. Keep it to 1-2 sentences. Be warm and low-pressure. No lists, no overwhelm.`,
  },
  midday: {
    title: 'Mid-day Nudge',
    sessionTitle: 'Mid-day Nudge',
    addendum: `\n\n---\n\n## Nudge Context\n\nThis is a mid-day nudge. Light check-in — suggest a quick win from their tasks or a movement/stretch break. 1-2 sentences max. Keep it casual.`,
  },
  endOfDay: {
    title: 'End of Day Nudge',
    sessionTitle: 'End of Day Nudge',
    addendum: `\n\n---\n\n## Nudge Context\n\nThis is an end-of-day nudge. Invite a quick reflection on the day. Don't summarize their day for them — just ask a simple question. 1-2 sentences, warm tone.`,
  },
};

const NUDGE_TYPES: NudgeType[] = ['morning', 'midday', 'endOfDay'];

export class NudgeScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private firedToday: Set<NudgeType> = new Set();
  private lastDateString: string = '';

  constructor(
    private getSettings: () => NudgeSettings,
    private saveSettings: (settings: NudgeSettings) => void,
    private onNudgeFire: (type: NudgeType) => void,
  ) {}

  start(): void {
    if (this.intervalId) return;
    this.lastDateString = this.todayString();
    this.intervalId = setInterval(() => this.tick(), 60_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private todayString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private currentHHMM(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private tick(): void {
    const today = this.todayString();
    const currentTime = this.currentHHMM();

    // Day rollover — reset fired tracking
    if (today !== this.lastDateString) {
      this.firedToday.clear();
      this.lastDateString = today;
    }

    const settings = this.getSettings();

    // Auto-reset DnD at end-of-day time (or midnight if EOD disabled)
    if (settings.doNotDisturb) {
      const resetTime = settings.endOfDay.enabled ? settings.endOfDay.time : '00:00';
      if (currentTime === resetTime) {
        settings.doNotDisturb = false;
        this.saveSettings(settings);
      }
      return; // DnD active — skip all nudges
    }

    // Check each nudge type
    for (const type of NUDGE_TYPES) {
      const config = settings[type];
      if (config.enabled && !this.firedToday.has(type) && currentTime === config.time) {
        this.firedToday.add(type);
        this.onNudgeFire(type);
      }
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/nudgeScheduler.ts
git commit -m "feat: add NudgeScheduler class with polling and DnD (#43)"
```

---

### Task 4: Add `update_nudge_settings` Tool Definition

**Files:**
- Modify: `src/main/providers/tools.ts`

- [ ] **Step 1: Add the tool to `VAULT_TOOLS` array**

Add after the `archive_tasks` entry (line 86, before the closing `];`):

```typescript
  {
    name: 'update_nudge_settings',
    description: 'Update nudge notification settings. Use when the user wants to change nudge times, enable/disable nudges, or toggle Do Not Disturb. Partial updates — only provided fields are changed.',
    parameters: {
      type: 'object',
      properties: {
        morning_enabled: { type: 'string', description: 'Set morning nudge enabled: "true" or "false"' },
        morning_time: { type: 'string', description: 'Set morning nudge time in HH:MM 24-hour format (e.g., "09:00")' },
        midday_enabled: { type: 'string', description: 'Set mid-day nudge enabled: "true" or "false"' },
        midday_time: { type: 'string', description: 'Set mid-day nudge time in HH:MM 24-hour format (e.g., "11:00")' },
        endOfDay_enabled: { type: 'string', description: 'Set end-of-day nudge enabled: "true" or "false"' },
        endOfDay_time: { type: 'string', description: 'Set end-of-day nudge time in HH:MM 24-hour format (e.g., "15:00")' },
        doNotDisturb: { type: 'string', description: 'Set Do Not Disturb: "true" or "false". When enabled, suppresses all nudges until auto-reset at end-of-day time.' },
      },
      required: [],
    },
  },
```

Note: Tool input values are strings (per the existing `Record<string, string>` convention in `NeutralToolCall.arguments`). The tool handler will parse booleans from `"true"`/`"false"`.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/providers/tools.ts
git commit -m "feat: add update_nudge_settings tool definition (#43)"
```

---

### Task 5: Wire Scheduler and Nudge Firing into Main Process

**Files:**
- Modify: `src/main/main.ts`

This is the largest task — it connects everything together.

- [ ] **Step 1: Add imports at top of `main.ts`**

Add after the existing imports (after line 8):

```typescript
import { Notification } from 'electron';
import { NudgeScheduler, NudgeType, NudgeSettings, DEFAULT_NUDGE_SETTINGS, NUDGE_PROMPTS } from './nudgeScheduler';
```

(The `runAgenticLoop` import was already added in Task 2.)

- [ ] **Step 2: Add `update_nudge_settings` case to `processToolCall`**

Add a new case in the `switch` statement in `processToolCall()`, before the `default:` case (before line 638):

```typescript
    case 'update_nudge_settings': {
      const settings = loadSettings();
      const nudges: NudgeSettings = { ...DEFAULT_NUDGE_SETTINGS, ...settings.nudges };
      const changes: string[] = [];

      if (toolInput.morning_enabled !== undefined) {
        nudges.morning.enabled = toolInput.morning_enabled === 'true';
        changes.push(`Morning nudge ${nudges.morning.enabled ? 'enabled' : 'disabled'}`);
      }
      if (toolInput.morning_time !== undefined) {
        nudges.morning.time = toolInput.morning_time;
        changes.push(`Morning nudge time set to ${toolInput.morning_time}`);
      }
      if (toolInput.midday_enabled !== undefined) {
        nudges.midday.enabled = toolInput.midday_enabled === 'true';
        changes.push(`Mid-day nudge ${nudges.midday.enabled ? 'enabled' : 'disabled'}`);
      }
      if (toolInput.midday_time !== undefined) {
        nudges.midday.time = toolInput.midday_time;
        changes.push(`Mid-day nudge time set to ${toolInput.midday_time}`);
      }
      if (toolInput.endOfDay_enabled !== undefined) {
        nudges.endOfDay.enabled = toolInput.endOfDay_enabled === 'true';
        changes.push(`End-of-day nudge ${nudges.endOfDay.enabled ? 'enabled' : 'disabled'}`);
      }
      if (toolInput.endOfDay_time !== undefined) {
        nudges.endOfDay.time = toolInput.endOfDay_time;
        changes.push(`End-of-day nudge time set to ${toolInput.endOfDay_time}`);
      }
      if (toolInput.doNotDisturb !== undefined) {
        nudges.doNotDisturb = toolInput.doNotDisturb === 'true';
        changes.push(`Do Not Disturb ${nudges.doNotDisturb ? 'enabled' : 'disabled'}`);
      }

      settings.nudges = nudges;
      saveSettings(settings);

      return changes.length > 0
        ? `Nudge settings updated:\n${changes.join('\n')}`
        : 'No changes made — no fields were provided.';
    }
```

- [ ] **Step 3: Add the `handleNudgeFire` function**

Add this function after `processToolCall` and before `currentAbort` (before line 643):

```typescript
async function handleNudgeFire(type: NudgeType): Promise<void> {
  devLog('nudge', 'firing nudge', { type });

  try {
    // 1. Get provider and API key
    const settings = loadSettings();
    const providerId = (settings.activeProvider || 'anthropic') as ProviderId;
    const provider = await getProvider(providerId);

    let apiKey: string | null = null;
    try {
      const keytar = require('keytar');
      apiKey = await keytar.getPassword('nudge-app', `api-key-${providerId}`);
    } catch {
      apiKey = settings[`apiKey-${providerId}`] || null;
    }
    if (!apiKey) {
      devLog('nudge', 'no API key configured, skipping nudge', { type });
      return;
    }

    const baseUrl = settings[`baseUrl-${providerId}`] || undefined;
    provider.configure(apiKey, baseUrl);
    const model = settings[`model-${providerId}`] || (providerId === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o');

    // 2. Create a new session
    const { v4: uuidv4 } = require('uuid');
    const prompt = NUDGE_PROMPTS[type];
    const session = {
      id: uuidv4(),
      title: prompt.sessionTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [] as any[],
    };
    ensureDir(sessionsDir);
    const sessionPath = path.join(sessionsDir, `${session.id}.json`);

    // 3. Build system prompt with nudge addendum
    const bundledPath = path.join(
      app.isPackaged
        ? path.join(process.resourcesPath, 'app-bundle')
        : path.join(__dirname, '../app-bundle'),
      'system-prompt.md'
    );
    let baseSystemPrompt = fs.readFileSync(bundledPath, 'utf-8');

    let config = '';
    try {
      const vaultPath = getVaultPath();
      const configPath = path.resolve(vaultPath, 'config.md');
      if (fs.existsSync(configPath)) {
        config = fs.readFileSync(configPath, 'utf-8');
      }
    } catch {}

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const vaultPath = getVaultPath();

    const systemPrompt = `${baseSystemPrompt}\n\n---\n\n## User Config\n\n${config}\n\n---\n\n## Current Date & Time\n\n${dateStr} at ${timeStr}\n\nVault location: ${vaultPath}${prompt.addendum}`;

    // 4. Create trigger message
    const triggerMessage = {
      id: uuidv4(),
      role: 'user' as const,
      content: '[Nudge triggered]',
      timestamp: Date.now(),
    };
    session.messages.push(triggerMessage);

    // 5. Run agentic loop
    const { fullText } = await runAgenticLoop({
      provider,
      messages: [triggerMessage],
      systemPrompt,
      model,
      tools: VAULT_TOOLS,
      processToolCall,
      // No streaming to renderer — collect text silently
    });

    // 6. Save assistant response to session
    const assistantMessage = {
      id: uuidv4(),
      role: 'assistant' as const,
      content: fullText,
      timestamp: Date.now(),
    };
    session.messages.push(assistantMessage);
    session.updatedAt = Date.now();
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

    // 7. Show OS notification
    const notificationBody = fullText.length > 200 ? fullText.slice(0, 197) + '...' : fullText;
    const notification = new Notification({
      title: prompt.title,
      body: notificationBody,
    });

    notification.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('nudge:navigate', { sessionId: session.id });
      }
    });

    notification.show();

    // 8. Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nudge:fired', { sessionId: session.id, type });
    }

    devLog('nudge', 'nudge delivered', { type, sessionId: session.id, textLength: fullText.length });
  } catch (error: any) {
    devLog('nudge', 'nudge failed', { type, error: formatError(error) });
  }
}
```

- [ ] **Step 4: Instantiate and start the scheduler in `app.whenReady()`**

Add after `createWindow();` (after line 918) in the `app.whenReady()` callback:

```typescript
  // Start nudge scheduler
  const nudgeScheduler = new NudgeScheduler(
    () => {
      const settings = loadSettings();
      return { ...DEFAULT_NUDGE_SETTINGS, ...settings.nudges };
    },
    (nudgeSettings: NudgeSettings) => {
      const settings = loadSettings();
      settings.nudges = nudgeSettings;
      saveSettings(settings);
    },
    (type: NudgeType) => { handleNudgeFire(type); },
  );
  nudgeScheduler.start();
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: wire nudge scheduler, firing, and settings tool into main process (#43)"
```

---

### Task 6: Add Preload Bridge for Nudge Events

**Files:**
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Add `nudges` namespace to the `contextBridge.exposeInMainWorld` call**

Add after the `updater` block (after line 240, before the closing `});`):

```typescript
  nudges: {
    onFired: (callback: (data: { sessionId: string; type: string }) => void) => {
      const handler = (_event: any, data: { sessionId: string; type: string }) => callback(data);
      ipcRenderer.on('nudge:fired', handler);
      return () => { ipcRenderer.removeListener('nudge:fired', handler); };
    },
    onNavigate: (callback: (data: { sessionId: string }) => void) => {
      const handler = (_event: any, data: { sessionId: string }) => callback(data);
      ipcRenderer.on('nudge:navigate', handler);
      return () => { ipcRenderer.removeListener('nudge:navigate', handler); };
    },
  },
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -p tsconfig.electron.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat: add nudge event listeners to preload bridge (#43)"
```

---

### Task 7: Add Renderer Listeners in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add `useEffect` for nudge events**

Add after the "Check for Updates" menu listener `useEffect` (after line 72):

```typescript
  // Listen for nudge events
  useEffect(() => {
    const cleanupFired = window.nudge.nudges.onFired(() => {
      // Refresh session list so the new nudge session appears
      setSessionRefreshKey(k => k + 1);
    });

    const cleanupNavigate = window.nudge.nudges.onNavigate(async (data) => {
      // Navigate to the nudge session when notification is clicked
      const session = await window.nudge.sessions.get(data.sessionId);
      if (session) {
        if (cancelStreamRef.current) {
          cancelStreamRef.current();
        }
        setCurrentSessionId(session.id);
        setMessages(session.messages);
        setSessionTitle(session.title);
        setStreamingContent('');
        streamingContentRef.current = '';
        setIsStreaming(false);
        setEditingFile(null);
        setSessionRefreshKey(k => k + 1);
      }
    });

    return () => {
      cleanupFired();
      cleanupNavigate();
    };
  }, []);
```

- [ ] **Step 2: Verify it compiles**

Run: `npx vite build --config vite.config.ts`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: add nudge event listeners to renderer (#43)"
```

---

### Task 8: Update System Prompt with Nudge Tool

**Files:**
- Modify: `app-bundle/system-prompt.md`

- [ ] **Step 1: Add `update_nudge_settings` to the Tools Available section**

Add after the `archive_tasks` entry in the Tools Available section (after line 30):

```markdown
- **update_nudge_settings** — Update scheduled nudge settings (times, enabled/disabled, Do Not Disturb)
```

- [ ] **Step 2: Add a Nudge Settings section**

Add before the `## Boundaries` section (before line 36):

```markdown
## Nudge Settings

Users can configure three daily nudges (morning, mid-day, end-of-day) via chat. When a user asks to change nudge timing, enable/disable nudges, or turn on Do Not Disturb, use the `update_nudge_settings` tool.

Examples:
- "Turn on my nudges" → enable all three: `morning_enabled: "true"`, `midday_enabled: "true"`, `endOfDay_enabled: "true"`
- "Move my morning nudge to 9" → `morning_time: "09:00"`
- "Turn off mid-day nudges" → `midday_enabled: "false"`
- "Don't disturb me today" → `doNotDisturb: "true"`
- "Do not disturb" → `doNotDisturb: "true"`

After making changes, confirm briefly what you changed.
```

- [ ] **Step 3: Update the Boundaries section**

Remove this line from the Boundaries section (line 40):
```
- Set timers, alarms, or reminders that trigger later
```

Replace with:
```
- Set timers or alarms (but you CAN manage scheduled nudges via the update_nudge_settings tool)
```

- [ ] **Step 4: Commit**

```bash
git add app-bundle/system-prompt.md
git commit -m "docs: add nudge settings tool to system prompt (#43)"
```

---

### Task 9: Full Integration Test

- [ ] **Step 1: Verify both TypeScript configs compile**

Run: `npx tsc -p tsconfig.electron.json && npx tsc -p tsconfig.json --noEmit`
Expected: No errors from either

- [ ] **Step 2: Run the app**

Run: `npm run dev`

- [ ] **Step 3: Test nudge settings via chat**

Type: "Turn on my morning nudge"
Expected: Claude uses `update_nudge_settings` tool, confirms the change. Check `settings.json` in userData to verify the nudge settings were persisted.

- [ ] **Step 4: Test nudge firing (manual time override)**

Temporarily modify the morning nudge time to the current time + 1 minute via chat: "Set my morning nudge to [HH:MM]" (where HH:MM is 1 minute from now).
Expected: After 1 minute, OS notification appears, new "Morning Nudge" session appears in sidebar. Clicking the notification navigates to the session.

- [ ] **Step 5: Test Do Not Disturb**

Type: "Don't disturb me today"
Expected: Claude sets DnD. No further nudges fire until reset.

- [ ] **Step 6: Commit final state**

If any fixes were needed during testing, commit them:
```bash
git add -A
git commit -m "fix: integration fixes for scheduled nudges (#43)"
```
