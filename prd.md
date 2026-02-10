# Nudge — Product Requirements Document

## Overview

Nudge is an open-source, cross-platform desktop application designed to help people with ADHD manage their ideas, daily planning, and work sessions through a conversational AI interface backed by structured markdown files.

### Core Philosophy

**"Starting is success, completion is optional."**

Nudge is not a task manager. It is a gentle, ADHD-aware system that reduces the overwhelm of starting by surfacing small, concrete next steps through conversation. It never guilts, never nags, and celebrates every start — even opening a file counts.

### What Makes Nudge Different

- **Chat-forward interface** — The primary interaction is a chat window, just like Claude or ChatGPT. Users talk to Nudge conversationally: "start my day", "I have 30 minutes", "add a task", "I have an idea". Nudge responds with suggestions, creates files, updates logs, and helps the user get moving.
- **Markdown backend** — Behind the chat lives a structured set of markdown/YAML files that Nudge reads and writes. Users can optionally view and edit these files directly by toggling a file explorer panel. Power users who prefer working in files directly are first-class citizens.
- **ADHD-first design** — Every UX decision optimizes for reducing paralysis and lowering the barrier to start. Small surfaces, not overwhelming lists. Concrete first steps, not abstract goals. Permission to skip, not pressure to complete.

---

## Target User

- People with ADHD (or ADHD-like executive function challenges)
- Comfortable with text/chat interfaces
- May be developers, knowledge workers, creatives, or anyone who struggles with task paralysis
- Wants a system that works *with* their brain, not against it

---

## Architecture

### Application Type

Cross-platform desktop application.

**Recommended technology stack:**
- **Electron** or **Tauri** for cross-platform desktop shell (macOS, Windows, Linux)
- Tauri is preferred for smaller bundle size and native performance, but Electron is acceptable if Tauri introduces friction
- The chat interface and file explorer can be built with any modern web framework (React, Svelte, Vue, etc.)

### AI Backend

- Nudge uses the **Anthropic Claude API** for its conversational AI
- Users **provide their own Anthropic API key** during setup — Nudge does not require an account with Nudge itself or any intermediary service
- The API key is stored locally and securely (OS keychain / credential store — never in plain text config files)
- All API calls are made directly from the user's machine to the Anthropic API — there is no Nudge server, no telemetry, no data collection
- The app must support configuring which Claude model to use (e.g., claude-sonnet-4-20250514, claude-opus-4-20250514) with a sensible default

### Data Storage

- **All data is local.** Nudge stores everything in a single directory on the user's filesystem — the "Nudge vault"
- The vault is a plain directory of markdown files that can be version-controlled with git, synced with Dropbox/iCloud, or edited with any text editor
- No database. No proprietary formats. Just files.
- Default vault location: `~/Nudge/` (configurable during setup or in settings)

---

## Vault Structure

The vault is the user's data directory. It contains the following structure:

```
~/Nudge/
├── ideas/
│   ├── _template.md
│   └── *.md              (one file per idea/project)
├── daily/
│   └── YYYY-MM-DD.md     (one file per day)
├── tasks.md               (quick to-do checklist)
├── config.md              (user preferences and context)
└── system-prompt.md       (AI behavior instructions — the "personality" of Nudge)
```

### `ideas/` Directory

Each idea or project is a single markdown file with YAML frontmatter.

**Frontmatter schema:**

| Field     | Type     | Required | Values                                           |
|-----------|----------|----------|--------------------------------------------------|
| `status`  | string   | yes      | `active`, `someday`, `paused`, `done`            |
| `type`    | string   | yes      | `work`, `personal`                               |
| `energy`  | string   | yes      | `low`, `medium`, `high`                          |
| `size`    | string   | yes      | `small` (<30min), `medium` (1-2hr), `large` (half-day+) |
| `tags`    | string[] | yes      | freeform tag array                               |
| `started` | boolean  | yes      | `true` / `false`                                 |

**Body structure:**

```markdown
# Idea Title

## What is it?

Brief description of the idea.

## What does "starting" look like?

A concrete, ordered list of the smallest possible steps. Checkboxes encouraged.
- [ ] Step 1 — the absolute tiniest thing
- [ ] Step 2 — the next small thing
...

## What does "done" look like?

Optional. A description of the finished state. Helps with motivation but is never required.
```

**Key behaviors:**
- The "What does starting look like?" section is critical. Every idea must have at least one concrete, tiny first step. The AI should prompt for this during idea capture if the user doesn't provide it.
- Steps should be checkbox items so progress is visible
- The steps list should only show the next 3-7 visible actions — not the entire project plan. The idea is to avoid overwhelm. More steps are added as earlier ones complete.
- Completed steps use `[x]` and remain in the file as a record of progress

**Template file (`_template.md`):**
A template file ships with every new vault. It is used by the AI as a reference when creating new idea files. It should not be modified by the AI during normal operation.

```yaml
---
status: active
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
- Open a file and write one function signature
- Create a new directory and a README
- Read one article and jot down three takeaways
- Write a single test case
```

**Example idea files for reference:**

Here are examples of real idea files that demonstrate the range and tone of Nudge ideas. These should inform how the AI creates new ideas:

<details>
<summary>Example: Small/Low-Energy Work Idea (ssdlc-policy.md)</summary>

```yaml
---
status: active
type: work
energy: low
size: small
tags: [security, policy, grc]
started: true
---
```
```markdown
# SSDLC Policy

## What is it?

Get the Secure Software Development Lifecycle policy finalized and approved. The hard part is done — draft is written, stakeholder reviews are complete. Just need to push it through the last mile with GRC and get CISO sign-off.

## What does "starting" look like?

- [x] Write the draft
- [x] Complete stakeholder reviews
- [ ] Reach out to GRC to kick off the approval process
- [ ] Work through any GRC feedback
- [ ] Get CISO approval

## What does "done" look like?

CISO has signed off. The policy is official. You built that.
```
</details>

<details>
<summary>Example: Large/High-Energy Personal Idea (morse-magic.md)</summary>

```yaml
---
status: active
type: personal
energy: high
size: large
tags: [ham-radio, video, teaching, cw, youtube]
started: true
---
```
```markdown
# Morse Magic

## What is it?

A video training program for learning CW (morse code), published on YouTube. This is a big production — scripting, slides, recording, editing, publishing — but it gets done one piece at a time.

## What does "starting" look like?

Already rolling! Pick away at the next small piece whenever you have energy for it.

- [x] Create production schedule spreadsheet
- [x] Create slides for visuals
- [x] Write intro script
- [ ] Write the next episode script — just an outline, not a full draft
- [ ] Do a dry run of the intro — read it out loud, note what feels awkward
- [ ] Record the intro — don't edit, just capture it
- [ ] Review the intro recording — jot down what to re-do vs. what's good enough

> **Note to future me:** This list only covers the next few steps. Check the production schedule for the full picture. Add more steps here as you go — keep it to the next 3-4 visible actions so it doesn't get overwhelming.

## What does "done" look like?

The full series is published on YouTube and people are learning morse code from it. But honestly? Every episode you ship is a win on its own.
```
</details>

<details>
<summary>Example: Medium/Medium-Energy Personal Idea with Detailed Steps (wake_up_light.md)</summary>

```yaml
---
status: active
type: personal
energy: medium
size: medium
tags: [productivity, arduino, electronics, life]
started: false
---
```
```markdown
# Wake Up Light

## What is it?

This is a tiny black box with an RGB led on top that will light up or glow each morning at the configured wake up time. This keeps the user from being overwhelmed by the alarm sounds or waking up their partner. Configuration is via USB, plug it in, update the script with a new start time.

## What does "starting" look like?

- [ ] Dig through the parts bin — just find an ESP32 and an RGB LED. Put them on your desk. That's it.
- Open Tinkercad — create the project, name it "Wake-Up Light." Don't model anything yet, just create it.
- Wire the LED to the ESP32 on a breadboard — no code, no solder. Just physical connection.
- Write a 5-line script that turns the LED on. Literally just on. No fade, no timing.
- Add a simple fade — go from off to full brightness over 30 seconds.
- Add the wake-up time config — hardcoded is fine at first.

## What does "done" look like?

The final version is on your bed side table. It comes on in the morning with that soft pulsing glow letting you know it's okay to get up. Now you get to decide: wake up and start the day or press that button and go back to bed. No judgement either way. Your day belongs to you.
```
</details>

### `daily/` Directory

One markdown file per day, named `YYYY-MM-DD.md`.

**Structure:**

```markdown
# YYYY-MM-DD

## What I chose to work on

- Item 1
- Item 2

## Wins

- [x] Thing I accomplished
- [x] Another thing

## How it felt

Freeform reflection.

## What was hard

Freeform — obstacles, frustrations, blockers.

## Notes

Anything else worth remembering about the day.
```

**Key behaviors:**
- Created during morning review or first interaction of the day
- Updated throughout the day as tasks are started/completed
- Updated at end of day during reflection
- The "Wins" section should be populated by scanning completed tasks from `tasks.md`, completed steps from idea files, and any other accomplishments mentioned in conversation
- The tone is always celebratory, never judgmental
- If the user skips a day, no log is created and no mention is made of the gap

**Example daily log for reference:**

```markdown
# 2026-02-09

## What I chose to work on

- Set up the Nudge system
- Capture ideas and tasks
- Rename project from Start Day → Nudge

## Wins

- [x] Built the whole repo structure — CLAUDE.md, config, idea templates, tasks
- [x] Captured 9 ideas into `ideas/` with proper frontmatter
- [x] Set up tasks.md with Today / Recurring / Later sections
- [x] Updated Nudge for minimal task capture
- [x] Used Claude to enter tasks
- [x] Checked email
- [x] Walked Zero (morning + afternoon)
- [x] Renamed project to Nudge — README, CLAUDE.md, idea files all updated
- [x] Added README
- [x] 3 commits pushed

## How it felt

Really good. Not having to see a huge list of notes or todos was less overwhelming — could focus just on the tasks at hand.

## What was hard

- Lost conversation history when renaming the folder — but recovered fine

## Notes

First day using the system. Built the whole thing from scratch and got it working. That's a huge start. Starting is success.
```

### `tasks.md`

A simple markdown checklist for quick to-do items. These are NOT ideas or projects — they are small, discrete actions like appointments, payments, errands, and reminders.

**Structure:**

```markdown
# Tasks

Quick things to do. No frontmatter, no overthinking. Check them off and move on.

## Today

- [ ] Task 1
- [ ] Task 2
- [x] Completed task

## Recurring Daily

- [ ] Daily habit 1
- [ ] Daily habit 2

## Recurring Weekly

- [ ] Weekly item (resets each week)

## Later

- [ ] Not urgent but don't forget
<!-- Move things here if they're not urgent but you don't want to forget them -->
```

**Key behaviors:**
- When the user says "add a task" or "remind me to...", the item goes here — NOT into an idea file
- Adding a task should be instant and frictionless — no questions asked unless the user is ambiguous about timing
- Completed tasks use `[x]` and remain visible until the user cleans them up or until end-of-day archiving
- Recurring Daily items should be unchecked at the start of each new day (the AI handles this during morning review)
- Recurring Weekly items should be unchecked at the start of each week (Monday morning review)
- During morning review, unchecked Today items and due Recurring items are surfaced alongside idea suggestions

### `config.md`

User preferences, energy patterns, and personal context. The AI reads this at the start of every session.

**Structure:**

```markdown
# Config

## About Me

- Freeform personal context
- ADHD specifics, work style, etc.

## Mantra

**"Starting is success, completion is optional."**

## Energy Patterns

- Morning: ...
- Afternoon: ...
- Evening: ...

## Preferences

- Suggestion preferences
- Work style preferences
- What helps when stuck

## Current Focus Areas

- What's top of mind right now
```

**Key behaviors:**
- Users edit this file directly or tell the AI to update it
- The AI uses this to calibrate suggestion energy levels, sizes, and types based on time of day
- The mantra can be customized by the user — it appears in the default config but is user-editable

### `system-prompt.md`

This is the AI behavior instruction file — the equivalent of `CLAUDE.md` in the current prototype. It defines how Nudge's AI behaves: its personality, its interaction patterns, its rules.

**This file ships with a default configuration but is fully user-editable.** Advanced users can customize the AI's personality, add new behaviors, or change existing ones.

The system prompt is injected into every API call as the system message. It is the soul of Nudge.

**Default content should include all behaviors defined in the "AI Behaviors" section below.**

---

## User Interface

### Layout

The app has two primary UI regions:

```
┌─────────────────────────────────────────────────┐
│  ┌──────┐                              [⚙️]     │
│  │ 📁   │         Nudge                         │
│  └──────┘                                       │
├──────────┬──────────────────────────────────────┤
│          │                                       │
│  File    │         Chat                          │
│  Explorer│                                       │
│  (toggle)│   Messages appear here                │
│          │   in a conversational format           │
│          │                                       │
│          │                                       │
│          │                                       │
│          │                                       │
│          │                                       │
│          │  ┌─────────────────────────────┐      │
│          │  │  Type a message...      [⏎] │      │
│          │  └─────────────────────────────┘      │
└──────────┴──────────────────────────────────────┘
```

### Chat Panel (Primary)

- This is the default and primary view — **chat-forward, just like Claude**
- Standard chat interface: user messages on the right, Nudge responses on the left (or similar conversational layout)
- Markdown rendering in messages (code blocks, checkboxes, headers, bold, etc.)
- The chat input is always visible at the bottom
- Messages stream in real-time as the AI generates them (streaming API responses)
- Chat history persists across sessions — the user can scroll back to see previous conversations
- New conversation sessions can be started manually (clear chat) but old sessions are archived/accessible
- The AI has full context of the vault files — it reads them as needed to answer questions and make suggestions

### File Explorer Panel (Secondary, Toggle)

- Toggled by clicking the **file explorer icon** (📁) in the top-left area or header
- When open, it appears as a **side panel on the left** of the chat
- Displays the vault directory tree: `ideas/`, `daily/`, `tasks.md`, `config.md`, `system-prompt.md`
- Clicking a file opens it in an **inline editor** (either replacing the chat temporarily or in a split view — implementation detail left to engineering, but split view is preferred)
- The editor should support markdown with syntax highlighting
- Files edited in the explorer are saved to disk immediately (autosave or explicit save)
- The file explorer is **closed by default** — the chat is the primary interface. The explorer is for power users who want to view or hand-edit their files
- Changes made in the file explorer are immediately reflected in the AI's context (the AI reads from disk)

### Settings Panel

Accessed via a gear icon (⚙️) in the header area. Contains:

- **API Key** — Input field for the user's Anthropic API key, stored securely. Masked by default with a show/hide toggle.
- **Model Selection** — Dropdown to choose which Claude model to use (with sensible default)
- **Vault Location** — Display current vault path and option to change it or open a different vault
- **Theme** — Light / Dark / System (follow OS preference)
- **About** — Version, license (open source), links to GitHub repo

### Visual Design Principles

- **Clean and minimal** — No visual clutter. The chat is the focus.
- **Calm color palette** — Soft, muted tones. Not flashy. The app should feel like a quiet room, not a dashboard.
- **Typography-first** — Good readable fonts, generous line height, comfortable message spacing
- **Dark mode support** — Essential. Many ADHD users work late or prefer dark mode.
- **No badges, counters, or red indicators** — These create anxiety. No "5 tasks overdue!" No red circles. No notification dots.
- **No animations that demand attention** — Subtle transitions are fine. Flashing, bouncing, or pulsing elements are not.

---

## AI Behaviors

The AI in Nudge has a specific personality and set of behaviors. These are defined in the `system-prompt.md` file and are customizable, but the defaults below represent the intended Nudge experience.

### Core Personality

- Warm, low-pressure, encouraging
- Brief and action-oriented — not verbose
- Celebrates starts, never guilts about non-completion
- Biased toward action over planning
- Suggests small things over big things
- Respects "not today" without pushback

### Morning Review

Triggered by: "start my day", "morning review", "daily review", opening the app for the first time on a new day, or similar phrases.

**Behavior:**
1. Read `config.md` for user context and energy patterns
2. Check yesterday's daily log (if it exists) — note any carryover items but don't guilt about them
3. Scan `ideas/` for items with `status: active`
4. Check `tasks.md` for unchecked Today items and due Recurring items
5. Reset Recurring Daily checkboxes (uncheck them for the new day)
6. If it's Monday, reset Recurring Weekly checkboxes
7. Surface 3-5 suggestions that feel approachable today — mix of:
   - Tasks from `tasks.md` (especially tiny recurring ones)
   - Active ideas filtered by energy level appropriate for time of day
   - A mix of sizes, leaning toward small
8. Let the user pick, skip, or ask for different options — no pressure
9. Create today's daily log file (`daily/YYYY-MM-DD.md`) with chosen items, or leave it as a skeleton to fill in later
10. Occasionally (not every day) suggest an exercise break as part of the day's plan

**Rules:**
- Items with `status: someday` should only surface occasionally and gently
- Items with `status: paused` should never surface unless explicitly asked about
- Never mention skipped days or gaps in daily logs

### Time Window

Triggered by: "I have 30 minutes", "I have an hour", "I've got 15 minutes", or similar time-bounded statements.

**Behavior:**
1. Parse the time window
2. Filter active ideas and tasks by `size` and `energy` that fit within the window
3. Suggest 1-3 options, each with a **concrete first step** — the absolute smallest thing they can do right now
4. Emphasize starting, not finishing: "Open the file and write the first function signature" not "Implement the feature"
5. Once the user picks, help them start immediately — if the task involves creating files, writing code, drafting text, etc., the AI should *do it* with them, not just describe what to do

### Idea Capture

Triggered by: "I have an idea", "add this to my ideas", "new idea", or when the user describes a project/idea in conversation.

**Behavior:**
1. Listen to the idea description
2. Ask minimal clarifying questions if needed (only for required frontmatter: size, energy, type, tags — and only if not obvious from context)
3. Create a new markdown file in `ideas/` with:
   - Proper YAML frontmatter
   - A clear title
   - "What is it?" section from user's description
   - "What does starting look like?" section with at least one concrete tiny step (ask the user or suggest based on the idea)
4. Confirm the idea is saved with the filename
5. Keep it quick — don't interrupt the user's flow with excessive questions

**File naming convention:** Lowercase, hyphenated, descriptive. E.g., `wake-up-light.md`, `quarterly-ctf.md`, `my-taxes.md`

### Task Capture

Triggered by: "add a task", "remind me to", "I need to", or similar quick-add phrases.

**Behavior:**
1. Add the item to `tasks.md` under the appropriate section:
   - Default: **Today**
   - If user says "later" or "not urgent": **Later**
   - If user describes a recurring pattern: **Recurring Daily** or **Recurring Weekly**
2. No questions — just add it and confirm
3. Keep it fast. Tasks are meant to be frictionless.

### End of Day / Reflection

Triggered by: "wrap up my day", "end of day", "let's reflect", "log my day", "let's wrap up the day", or similar phrases.

**Behavior:**
1. Scan conversation history from the current session for accomplishments, tasks completed, and ideas worked on
2. Check `tasks.md` for items completed today (checked off)
3. Check `ideas/` for any ideas that were started or had progress
4. Update today's daily log (`daily/YYYY-MM-DD.md`) with:
   - Wins section populated with everything accomplished
   - Update "What I chose to work on" if not already filled in
5. Mark any ideas that were started today (`started: true` in frontmatter) if not already marked
6. Ask one light reflective question — "How did today feel?" or "Anything you want to remember about today?" — but don't push if the user doesn't engage
7. Keep the tone celebratory. Even a single checked box is a win.

### Exercise Break Suggestions

Not a scheduled behavior — this is a gentle, occasional suggestion woven into the AI's responses.

**Behavior:**
- Occasionally suggest a short exercise break between tasks or when energy seems to be dipping
- Options to suggest (configurable by user in `config.md`):
  - Weighted vest walk
  - Kettlebell set
  - Squats or stretches
  - Any user-defined exercise options
- Frame as a break, not an obligation: "Want to take a quick exercise break to reset?" is fine. Adding it to a to-do list is not.
- If declined or ignored, drop it completely for the rest of the session
- Maximum: suggest once per session

### Idea and Task Updates

The AI should be able to:
- Mark tasks as complete in `tasks.md` when the user says they did something
- Update idea files — check off steps, add new steps, change status
- Move ideas between statuses (`active` → `paused`, `active` → `done`, etc.)
- Update `config.md` when the user shares new preferences or context
- All file modifications should be confirmed briefly in chat ("Done — marked that as complete")

---

## API Integration Details

### Anthropic Claude API Usage

**Authentication:**
- API key provided by the user, stored in OS credential store
- Sent as `x-api-key` header on every request
- Key is validated on entry (test call to `/v1/messages` with a minimal prompt)

**API calls structure:**
- Every message uses the `/v1/messages` endpoint
- `system` parameter: contents of `system-prompt.md` + relevant vault context
- `messages` parameter: conversation history for the current session
- `stream`: `true` (always stream responses for real-time display)

**System message construction:**
The system message sent with every API call should be assembled as follows:
1. Full contents of `system-prompt.md` (the AI personality and behavior rules)
2. Full contents of `config.md` (user preferences and context)
3. Current date and time
4. Any additional vault context relevant to the current conversation (e.g., contents of specific idea files, `tasks.md`, yesterday's daily log — included on-demand based on what the AI needs)

**Tool use / Function calling:**
The AI needs to read and write files in the vault. This should be implemented using Claude's tool use feature:

| Tool Name         | Description                                          | Parameters                        |
|-------------------|------------------------------------------------------|-----------------------------------|
| `read_file`       | Read the contents of a file in the vault             | `path` (relative to vault root)   |
| `write_file`      | Write/overwrite a file in the vault                  | `path`, `content`                 |
| `edit_file`       | Make a targeted edit to a file (find and replace)    | `path`, `old_text`, `new_text`    |
| `list_files`      | List files in a vault directory                      | `directory` (e.g., `ideas/`)      |
| `create_file`     | Create a new file in the vault                       | `path`, `content`                 |

These tools operate ONLY within the vault directory. The AI cannot access files outside the vault. All paths are relative to the vault root.

**Context window management:**
- Always include: `system-prompt.md` + `config.md` (these are small files)
- Include on-demand: The AI requests specific files via tools as needed
- Conversation history: Include full history for current session; summarize or truncate older turns if approaching context limits
- The app should track token usage and manage context window intelligently

**Error handling:**
- API key invalid → Clear error message, link to settings to update it
- Rate limited → "Nudge is taking a breather. Try again in a moment."
- Network error → "Looks like you're offline. Your vault files are still here — check back when you're connected."
- Context too long → Automatically summarize older conversation turns and retry

---

## Conversation Context & Session Management

### How the AI Gets Context

Before responding to any message, the AI should have context from:
1. **`system-prompt.md`** — Always loaded as the system message
2. **`config.md`** — Always included for user preferences
3. **Relevant vault files** — Read on-demand via tool use based on conversation context (e.g., read `tasks.md` when the user asks about tasks, scan `ideas/` during morning review)
4. **Conversation history** — Previous messages in the current session

### Session Persistence

- Chat history should be stored locally (SQLite or JSON files)
- Sessions can be browsed and revisited (sidebar or searchable history)
- A new session starts each day by default, or when the user explicitly starts one
- The AI should have access to the current session's full history for context

### Context Window Management

- The AI's context window is finite. The app must manage what's included:
  - Always include: `system-prompt.md`, `config.md`
  - Include on-demand: specific idea files, `tasks.md`, daily logs (only when relevant)
  - Summarize older conversation turns if the session gets long
- The app should handle this transparently — the user should never have to think about context limits

---

## First-Run Experience

### Onboarding Flow

1. **Welcome screen** — Brief explanation of what Nudge is and the core philosophy. Calm, minimal design. Not a product tour — just enough to understand what this is.
2. **API key setup** — Prompt for Anthropic API key with a link to where to get one (`console.anthropic.com`). Validate the key with a test API call. Show clear success/failure feedback.
3. **Vault location** — Choose where to create the vault directory (default: `~/Nudge/`). Allow selecting an existing vault directory.
4. **Vault initialization** — Create the directory structure:
   - `ideas/` with `_template.md`
   - `daily/`
   - `tasks.md` (empty but structured with section headers)
   - `config.md` (with default structure and placeholder prompts)
   - `system-prompt.md` (with full default Nudge personality and behaviors)
5. **First conversation** — Drop the user into chat with a warm welcome message that helps them fill in `config.md` conversationally:
   - "Hey! Let's get Nudge set up for you. Tell me a bit about yourself — what kind of work do you do?"
   - "When do you have the most energy during the day?"
   - "What are you working on right now, or what's been on your mind?"
   - Write their answers into `config.md`
6. **First idea capture** — Gently prompt: "Got an idea or project rattling around in your head? Let's capture one to get started." If they do, create the idea file. If they don't, that's fine — the system is ready when they are.

### Existing Vault Detection

- If a Nudge vault already exists at the configured location, skip initialization and load it
- Support pointing to an existing vault (e.g., one synced from another machine or cloned from git)
- Validate vault structure on load — if missing expected files/directories, offer to create them

---

## Cross-Platform Requirements

### Supported Platforms

- **macOS** (Intel and Apple Silicon)
- **Windows** (10 and later)
- **Linux** (AppImage or .deb — common distributions)

### Platform-Specific Considerations

- **macOS**: Native title bar styling, system dark mode detection, Keychain for API key storage
- **Windows**: Windows Credential Manager for API key storage, proper DPI scaling
- **Linux**: Secret Service API (GNOME Keyring / KDE Wallet) for API key storage, respect system theme where possible
- File paths must be handled cross-platform (use path libraries, not hardcoded separators)
- Line endings should be normalized (LF preferred for markdown files regardless of OS)

---

## Open Source Requirements

### License

- Permissive open-source license: **MIT** or **Apache 2.0** (recommended)

### Repository Structure

```
nudge-app/
├── src/                   (application source code)
├── public/                (static assets — icons, fonts)
├── default-vault/         (default vault template files)
│   ├── ideas/
│   │   └── _template.md
│   ├── daily/             (empty directory)
│   ├── tasks.md
│   ├── config.md
│   └── system-prompt.md
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── package.json           (or equivalent build config)
└── ...
```

### Build & Distribution

- Automated builds via GitHub Actions (or similar CI) for all three platforms
- Release binaries for macOS (universal), Windows (x64), and Linux (AppImage/deb)
- Signed builds where feasible (macOS notarization, Windows code signing)
- Auto-update mechanism (Electron: electron-updater; Tauri: built-in updater)
- Semantic versioning

---

## Privacy & Security

- **No telemetry.** Nudge does not phone home, collect analytics, or send any data anywhere except the user's own Anthropic API calls.
- **No accounts.** There is no Nudge account, no login, no server.
- **API key security.** The API key is stored in the OS credential store, never in plain text files.
- **Local-only data.** All vault data stays on the user's machine. If they want to sync or back up, that's their choice (git, Dropbox, iCloud, etc.).
- **No cloud features.** Nudge is intentionally local-first. Cloud sync is out of scope.
- **Transparent AI context.** The user can see exactly what the AI knows by looking at their vault files and the `system-prompt.md`. There are no hidden prompts or behaviors.

---

## Non-Goals (Explicit Exclusions)

These are things Nudge intentionally does NOT do:

- **Not a full project manager** — No Gantt charts, no dependencies, no sprints, no Kanban boards
- **Not a calendar** — No scheduling, no reminders, no notifications, no alarms
- **Not a note-taking app** — Ideas have structure. This isn't a freeform notebook or wiki.
- **Not a team tool** — Single user only. No sharing, collaboration, or multi-user features.
- **Not a habit tracker** — Recurring items exist but there are no streaks, scores, or tracking graphs
- **No gamification** — No points, no levels, no achievements, no streaks. These create pressure, not momentum.
- **No notifications or alerts** — The user opens Nudge when they're ready. Nudge does not interrupt them. Ever.
- **No AI memory across sessions beyond vault files** — The AI's "memory" is the vault. There is no separate memory store or learned behavior. This keeps things transparent and user-controllable.

---

## Future Considerations (Out of Scope for V1)

These are ideas worth exploring later but are explicitly NOT part of the initial release:

- **Git integration** — Auto-commit vault changes, push/pull from remote
- **Mobile companion app** — Quick idea/task capture from phone
- **Voice input** — Speak ideas instead of typing
- **Multiple vaults** — Switch between work and personal vaults
- **Plugin system** — User-defined AI behaviors or integrations
- **Import/export** — Bring in tasks from Todoist, Notion, Things, etc.
- **Local LLM support** — Run with Ollama or similar instead of Claude API
- **Additional AI provider support** — OpenAI, Google, etc. as alternatives to Claude
- **Keyboard shortcuts** — Power-user shortcuts for common actions (new idea, new task, toggle explorer)
- **Search** — Full-text search across vault files from within the app

---

## Success Metrics (For the Project, Not the User)

Nudge does not track user metrics — that would be antithetical to its philosophy. But for the open-source project itself, these are indicators of a good implementation:

- Users can go from download → API key entry → first conversation in **under 3 minutes**
- The app starts and is ready for input in **under 2 seconds**
- Vault files are always human-readable and editable outside the app with any text editor
- The AI responds within normal Claude API latency (no added delay from the app)
- Zero data leaves the user's machine except Anthropic API calls
- The app works fully offline (vault browsing and file editing) — only AI chat requires internet
- A new user with no technical background can understand and use the app from the welcome screen alone

---

## Summary

Nudge is a chat-forward desktop app with a markdown backend, designed for ADHD brains. The user talks to it like a supportive coach. Behind the scenes, it reads and writes structured markdown files that the user can also view and edit directly via a toggleable file explorer. It requires the user's own Anthropic API key, stores everything locally, and is fully open source. The entire AI personality is defined in a user-editable system prompt file, making it transparent and customizable.

The goal is simple: help people start. Everything else is optional.
