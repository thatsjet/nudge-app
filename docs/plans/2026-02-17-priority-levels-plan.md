# Priority Levels Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add priority levels (high/medium/low) to ideas and tasks so users can see what matters most.

**Architecture:** Add `priority` field to idea frontmatter type, update the idea template, update the system prompt to use priority when capturing and surfacing items, and add priority badges to the FileExplorer by reading frontmatter from idea files.

**Tech Stack:** TypeScript, React, Electron IPC, simple regex-based frontmatter parsing (no new dependencies).

---

### Task 1: Add priority to IdeaFrontmatter type

**Files:**
- Modify: `src/shared/types.ts:3-10`

**Step 1: Add priority field to IdeaFrontmatter**

```typescript
export interface IdeaFrontmatter {
  status: 'active' | 'someday' | 'paused' | 'done';
  priority: 'high' | 'medium' | 'low';
  type: 'work' | 'personal';
  energy: 'low' | 'medium' | 'high';
  size: 'small' | 'medium' | 'large';
  tags: string[];
  started: boolean;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: No errors (IdeaFrontmatter is only used as a type reference, not instantiated anywhere currently).

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add priority field to IdeaFrontmatter type (#15)"
```

---

### Task 2: Update idea template with priority field

**Files:**
- Modify: `default-vault/ideas/_template.md`

**Step 1: Add priority to template frontmatter**

Update the template to include `priority: medium` after `status`:

```markdown
---
status: active
priority: medium
type: personal
energy: low
size: small
tags: []
started: false
---

# Idea Title

## What is it?

Describe the idea briefly.

## What does "starting" look like?

The smallest possible first step. Be concrete:
- [ ] Open a file and write one function signature
- [ ] Create a new directory and a README
- [ ] Read one article and jot down three takeaways
- [ ] Write a single test case
```

**Step 2: Commit**

```bash
git add default-vault/ideas/_template.md
git commit -m "feat: add priority field to idea template (#15)"
```

---

### Task 3: Update system prompt — idea capture and format docs

**Files:**
- Modify: `app-bundle/system-prompt.md`

**Step 1: Update Ideas Format section (around line 76-84)**

Add `priority` to the valid fields list and document it. Replace the Ideas Format section:

```markdown
### Ideas Format (`ideas/`)
- One markdown file per idea/project
- Frontmatter with status, priority, type, energy, size, tags, started flag
- Body describes the idea and what "starting" looks like
- Valid statuses: `active`, `someday`, `paused`, `done`
- Valid priorities: `high` (do soon, has deadline or blocks other work), `medium` (important but not urgent — default), `low` (nice to have, do when energy allows)
- Valid types: `work`, `personal`
- Valid energy levels: `low`, `medium`, `high`
- Valid sizes: `small` (<30min), `medium` (1-2hr), `large` (half-day+)
```

**Step 2: Update Idea Capture section (around line 66-74)**

Add priority inference. Replace point 2:

```markdown
2. Ask minimal clarifying questions for frontmatter (size, energy, type, tags) only if not obvious. Infer priority from context — "urgent", "blocking", "deadline" → high; "someday", "when I get to it", "no rush" → low; everything else → medium. Never ask about priority directly.
```

**Step 3: Commit**

```bash
git add app-bundle/system-prompt.md
git commit -m "feat: add priority to idea capture and format docs in system prompt (#15)"
```

---

### Task 4: Update system prompt — task capture with inline tags

**Files:**
- Modify: `app-bundle/system-prompt.md`

**Step 1: Update Task Capture section (around line 87-101)**

Add rules for priority tags. Add these after rule 8 (before rule 9):

```markdown
9. Infer priority from context and append `#high` or `#low` to the task text when appropriate. No tag means medium (default). Examples: `- [ ] Fix login bug #high` or `- [ ] Reorganize bookmarks #low`. Signals: "urgent", "ASAP", "deadline" → #high; "eventually", "no rush", "when I can" → #low; everything else → no tag.
```

Renumber existing rules 9 and 10 to 10 and 11.

**Step 2: Commit**

```bash
git add app-bundle/system-prompt.md
git commit -m "feat: add priority tags to task capture in system prompt (#15)"
```

---

### Task 5: Update system prompt — morning review and suggestions

**Files:**
- Modify: `app-bundle/system-prompt.md`

**Step 1: Update Morning Review section (around line 36-52)**

Update step 7 to factor in priority:

```markdown
7. Surface 3-5 approachable suggestions — prioritize high-priority items first, then filter by energy level for the time of day and size. Low-priority items should only appear if nothing higher-priority fits the current energy/time.
```

**Step 2: Update Time Window section (around line 56-63)**

Update step 2:

```markdown
2. Filter active ideas and tasks by size and energy that fit, prioritizing high-priority items first
```

**Step 3: Commit**

```bash
git add app-bundle/system-prompt.md
git commit -m "feat: add priority to morning review and time window suggestions (#15)"
```

---

### Task 6: Add frontmatter reading IPC handler

**Files:**
- Modify: `src/main/main.ts` (after `vault:read-file` handler, around line 202)

**Step 1: Add `vault:read-frontmatter` IPC handler**

Add this handler after the existing `vault:read-file` handler:

```typescript
ipcMain.handle('vault:read-frontmatter', async (_event, relativePath: string) => {
  const fullPath = resolveVaultPath(relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    frontmatter[key] = value;
  }
  return frontmatter;
});
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: add vault:read-frontmatter IPC handler (#15)"
```

---

### Task 7: Expose frontmatter reading in preload bridge

**Files:**
- Modify: `src/main/preload.ts` (vault section, around line 128-138)
- Modify: `src/shared/types.ts` (NudgeAPI interface, around line 40-56)

**Step 1: Add `readFrontmatter` to preload vault bridge**

In `preload.ts`, add inside the `vault` object after `readFile`:

```typescript
readFrontmatter: (path: string) => invoke<Record<string, string> | null>('vault:read-frontmatter', path),
```

**Step 2: Add `readFrontmatter` to NudgeAPI type**

In `types.ts`, add inside the `vault` interface after `readFile`:

```typescript
readFrontmatter: (path: string) => Promise<Record<string, string> | null>;
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/main/preload.ts src/shared/types.ts
git commit -m "feat: expose readFrontmatter in preload bridge (#15)"
```

---

### Task 8: Add priority badges to FileExplorer

**Files:**
- Modify: `src/renderer/components/FileExplorer.tsx`
- Modify: `src/renderer/styles/FileExplorer.css`

**Step 1: Add priority state and frontmatter loading to FileExplorer**

In `FileExplorer.tsx`, add a state map for priorities and load them when the tree loads. After the existing `loading` state:

```typescript
const [priorities, setPriorities] = useState<Record<string, string>>({});
```

Add a function to load priorities for idea files after `loadRoot`:

```typescript
const loadPriorities = useCallback(async (entries: TreeEntry[]) => {
  const ideaEntries = entries.find(e => e.name === 'ideas' && e.isDirectory);
  if (!ideaEntries) return;
  const ideaFiles = await window.nudge.vault.listFiles('ideas');
  const newPriorities: Record<string, string> = {};
  for (const file of ideaFiles.filter((f: any) => !f.isDirectory && f.name.endsWith('.md') && f.name !== '_template.md')) {
    const frontmatter = await window.nudge.vault.readFrontmatter(file.path);
    if (frontmatter?.priority && frontmatter.priority !== 'medium') {
      newPriorities[file.path] = frontmatter.priority;
    }
  }
  setPriorities(newPriorities);
}, []);
```

Update `loadRoot` to call `loadPriorities` after loading entries:

```typescript
const loadRoot = useCallback(async () => {
  setLoading(true);
  const root = await loadDirectory('');
  setEntries(root);
  setLoading(false);
  loadPriorities(root);
}, [loadDirectory, loadPriorities]);
```

**Step 2: Render priority dots in the tree**

In `renderEntry`, add a priority dot after the file name for idea files. Replace the `<span className="file-explorer-name">` line:

```tsx
<span className="file-explorer-name">{entry.name}</span>
{priorities[entry.path] && (
  <span className={`file-explorer-priority file-explorer-priority--${priorities[entry.path]}`} />
)}
```

**Step 3: Add CSS for priority dots**

In `FileExplorer.css`, add at the end:

```css
.file-explorer-priority {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: auto;
}

.file-explorer-priority--high {
  background: var(--priority-high, #e53e3e);
}

.file-explorer-priority--low {
  background: var(--priority-low, #a0aec0);
}
```

**Step 4: Verify the build compiles**

Run: `npx vite build --config vite.config.ts`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/renderer/components/FileExplorer.tsx src/renderer/styles/FileExplorer.css
git commit -m "feat: add priority badges to FileExplorer (#15)"
```

---

### Task 9: Manual verification

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Verify the following:**

1. Open the vault explorer — idea files should show no priority dots (existing files have no `priority` field, treated as medium)
2. In chat, say "I have an idea — build a wake-up light, it's urgent" — the assistant should create an idea file with `priority: high`
3. Refresh the explorer — the new idea should show a red dot
4. In chat, say "add a task: call the dentist, no rush" — the assistant should add `- [ ] Call the dentist #low` to tasks.md
5. In chat, say "start my day" — high-priority items should surface first in suggestions

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found in manual testing (#15)"
```
