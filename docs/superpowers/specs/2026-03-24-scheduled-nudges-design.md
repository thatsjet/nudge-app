# Scheduled Mid-Day Nudges with Do Not Disturb

**Issue:** #43
**Date:** 2026-03-24

## Overview

Three daily nudges (morning, mid-day, end-of-day) delivered via Electron Notification API and in-app chat. Each nudge creates a new session, triggers a Claude API call that reads vault context, and generates a short, warm, low-pressure message. Fire-and-forget — no catch-up if the app is closed.

## Data Model & Settings

Extend `settings.json` with a `nudges` key:

```json
{
  "nudges": {
    "morning": { "enabled": false, "time": "08:00" },
    "midday": { "enabled": false, "time": "11:00" },
    "endOfDay": { "enabled": false, "time": "15:00" },
    "doNotDisturb": false
  }
}
```

All nudges default to `enabled: false` to avoid surprising users on upgrade. Users opt in via chat (e.g., "turn on my nudges").

### Types

```typescript
type NudgeType = 'morning' | 'midday' | 'endOfDay';

interface NudgeConfig {
  enabled: boolean;
  time: string; // "HH:MM" 24-hour format
}

interface NudgeSettings {
  morning: NudgeConfig;
  midday: NudgeConfig;
  endOfDay: NudgeConfig;
  doNotDisturb: boolean;
}
```

Types added to `src/shared/types.ts` and mirrored in `src/main/providers/types.ts` per project convention.

## NudgeScheduler Class

New file: `src/main/nudgeScheduler.ts`

```typescript
class NudgeScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private firedToday: Set<NudgeType> = new Set();
  private lastDateString: string = '';

  constructor(
    private getSettings: () => NudgeSettings,
    private onNudgeFire: (type: NudgeType) => void
  ) {}

  start(): void   // Begin 60s setInterval polling
  stop(): void    // Clear interval

  private tick(): void
}
```

### Tick Logic

Each tick (every 60 seconds):

1. **Day rollover check:** Compare today's date string (`YYYY-MM-DD`) against `lastDateString`. If different, clear `firedToday` set and update `lastDateString`.
2. **DnD auto-reset:** If `doNotDisturb` is true, check if current time has passed the end-of-day nudge time (or midnight if EOD is disabled). If so, set `doNotDisturb` to false and persist via settings.
3. **DnD guard:** If `doNotDisturb` is true, return early.
4. **Nudge matching:** For each nudge type, if enabled, not already fired today, and current `HH:MM` matches the configured time, mark as fired and call `onNudgeFire(type)`.

### Design Decisions

- **No catch-up:** If the app was closed or asleep during a nudge time, the nudge is skipped.
- **Fresh settings on each tick:** `getSettings()` reads from disk, so settings changes (from Claude tool use or any other source) are picked up immediately.
- **60-second granularity:** Nudges may fire up to 59 seconds late. Acceptable for this use case.
- **In-memory fired tracking:** `firedToday` is a `Set` in memory. If the app restarts mid-day, nudges that already fired will fire again. Acceptable for v1 — a nudge firing twice is low-cost.

## Nudge Fire Flow

When `onNudgeFire(type)` is called in `main.ts`:

1. **Create a new session** — same pattern as `sessions:create`. Title: `"Morning Nudge"`, `"Mid-day Nudge"`, or `"End of Day Nudge"`.

2. **Build system prompt** — base system prompt (from `system-prompt.md`) + nudge-specific addendum with tone/purpose guidance.

3. **Add synthetic user message** — `"[Nudge triggered]"` with `role: 'user'`. Gives Claude something to respond to within the agentic loop.

4. **Call Claude API with vault tools** — reuse the extracted agentic loop helper (see below). Claude reads vault context via tool use, then generates the nudge. Collect the full response.

5. **Save assistant response** — append Claude's message to the nudge session.

6. **Show OS notification** — `new Notification({ title: "Nudge", body: truncatedResponse })`. On `click`: focus/show window, send `nudge:navigate` IPC to renderer.

7. **Notify renderer** — `mainWindow.webContents.send('nudge:fired', { sessionId, type })` so the session list updates.

### Extracting the Agentic Loop

The existing `api:send-message` IPC handler contains the agentic loop (send → tool calls → tool results → repeat). This logic is tightly coupled to IPC args and streaming to the renderer.

Extract the core loop into a helper function:

```typescript
async function runAgenticLoop(params: {
  messages: ChatMessageShape[];
  systemPrompt: string;
  provider: LLMProvider;
  model: string;
  tools: NeutralToolDef[];
  onText?: (chunk: string) => void;
  onToolUse?: (toolNames: string[]) => void;
}): Promise<string> // Returns full assistant text
```

The IPC handler calls this with streaming callbacks that send to the renderer. The nudge scheduler calls it with a simple text-collecting callback.

## System Prompts per Nudge Type

Constants stored alongside the NudgeScheduler. Appended to the base system prompt.

**Morning:**
> This is a morning nudge. Read the user's tasks and ideas from the vault, then suggest one small thing to start with. Keep it to 1-2 sentences. Be warm and low-pressure. No lists, no overwhelm.

**Mid-day:**
> This is a mid-day nudge. Light check-in — suggest a quick win from their tasks or a movement/stretch break. 1-2 sentences max. Keep it casual.

**End of day:**
> This is an end-of-day nudge. Invite a quick reflection on the day. Don't summarize their day for them — just ask a simple question. 1-2 sentences, warm tone.

## Claude Tool: `update_nudge_settings`

Added to tool definitions in `src/main/providers/tools.ts`:

```typescript
{
  name: "update_nudge_settings",
  description: "Update nudge notification settings. Use when the user wants to change nudge times, enable/disable nudges, or toggle Do Not Disturb.",
  input_schema: {
    type: "object",
    properties: {
      morning: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          time: { type: "string", description: "HH:MM 24-hour format" }
        }
      },
      midday: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          time: { type: "string", description: "HH:MM 24-hour format" }
        }
      },
      endOfDay: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          time: { type: "string", description: "HH:MM 24-hour format" }
        }
      },
      doNotDisturb: { type: "boolean" }
    }
  }
}
```

- Partial updates — only provided fields are merged into current settings.
- Handled in `processToolCall()` in `main.ts`.
- Returns a confirmation string describing what changed (e.g., "Morning nudge updated to 09:00").

## IPC Channels

### New Main → Renderer Events

| Channel | Payload | Purpose |
|---------|---------|---------|
| `nudge:fired` | `{ sessionId: string, type: NudgeType }` | Nudge session created, refresh session list |
| `nudge:navigate` | `{ sessionId: string }` | Notification clicked, navigate to session |

No new `ipcMain.handle` channels needed — nudge settings use existing `settings:get`/`settings:set`.

### Preload Additions

```typescript
window.nudge.nudges = {
  onFired: (callback: (data: { sessionId: string, type: string }) => void) => () => void,
  onNavigate: (callback: (data: { sessionId: string }) => void) => () => void,
}
```

Both return cleanup functions following the existing pattern.

## Renderer Changes

### App.tsx

- Register `nudge:fired` listener on mount → refresh session list
- Register `nudge:navigate` listener on mount → set active session ID
- Clean up both on unmount

### No Other UI Changes

Per the spec: "No preferences UI (chat-only config)." Nudge sessions appear as regular sessions in the sidebar. No special visual treatment in v1.

## File Change Summary

| File | Change |
|------|--------|
| `src/main/nudgeScheduler.ts` | **New** — NudgeScheduler class, nudge type prompts |
| `src/main/main.ts` | Extract agentic loop helper, instantiate scheduler, handle `onNudgeFire`, add `update_nudge_settings` to `processToolCall`, add nudge defaults to settings |
| `src/main/preload.ts` | Add `nudge:fired` and `nudge:navigate` event listeners in `nudges` namespace |
| `src/shared/types.ts` | Add `NudgeType`, `NudgeConfig`, `NudgeSettings` types, extend `NudgeAPI` interface |
| `src/main/providers/types.ts` | Mirror `NudgeType`, `NudgeConfig`, `NudgeSettings` types |
| `src/main/providers/tools.ts` | Add `update_nudge_settings` tool definition |
| `src/renderer/App.tsx` | Register nudge event listeners |

## Not in v1

- No snooze/re-nudge
- No preferences UI (chat-only config)
- No weekend/weekday distinction
- No visual indicator for nudge sessions in sidebar
- No persistence of "already fired" state across app restarts
