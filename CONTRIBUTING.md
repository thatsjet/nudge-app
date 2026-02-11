# Contributing to Nudge

Thanks for your interest in contributing to Nudge! This project is built for people with ADHD, so we try to practice what we preach: keep things small, make starting easy, and celebrate every contribution.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- An [Anthropic API key](https://console.anthropic.com/) or [OpenAI API Key](https://platform.openai.com/) (for testing chat features)

### Setup

```bash
git clone https://github.com/your-username/nudge-app.git
cd nudge-app
npm install
npm run dev
```

This starts the Vite dev server and Electron together. The app will open with hot reload enabled.

### Project Structure

```
src/
├── main/              # Electron main process (Node.js)
│   ├── main.ts        # Window management, IPC handlers, Claude/ChatGPT API, vault ops
│   └── preload.ts     # Context bridge (window.nudge API)
├── renderer/          # React frontend (browser context)
│   ├── App.tsx        # Root component
│   ├── components/    # UI components (Chat, FileExplorer, Settings, etc.)
│   └── styles/        # CSS files (one per component + global theme)
└── shared/
    └── types.ts       # TypeScript interfaces shared between main and renderer
```

### Build Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev mode (Vite + Electron with hot reload) |
| `npm run build` | Full production build |
| `npm run build:vite` | Build renderer only |
| `npm run build:electron` | Compile main process only |

## How to Contribute

### Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS and Nudge version

Don't stress about formatting. A rough description is better than no report at all.

### Suggesting Features

Open an issue with the `enhancement` label. Describe the problem you're trying to solve, not just the feature you want. We'll figure out the right solution together.

Keep in mind Nudge's [non-goals](prd.md) — it's intentionally not a project manager, calendar, habit tracker, or team tool.

### Submitting Code

1. **Fork the repo** and create a branch from `main`
2. **Make your changes** — keep PRs small and focused. One thing per PR.
3. **Test your changes** — make sure `npm run build` passes
4. **Write a clear PR description** — what changed and why
5. **Submit the PR** — we'll review it as soon as we can

#### Commit Messages

No strict format required. Just be descriptive:

```
Add dark mode toggle to settings panel
Fix file explorer not refreshing after vault edit
Update system prompt to handle weekly recurring tasks
```

## Design Principles

When contributing to Nudge, keep these principles in mind:

### ADHD-First UX

- **Reduce overwhelm.** Small surfaces, not big lists. 3-5 options, not 20.
- **Lower the barrier to start.** Every interaction should make starting easier, not harder.
- **No guilt.** Never add language, UI elements, or features that create pressure. No streaks, no overdue badges, no red indicators.
- **Respect "not today."** If a user declines something, drop it. No follow-ups, no "are you sure?"

### Visual Design

- **Calm color palette.** Soft, muted tones. The app should feel like a quiet room.
- **Typography-first.** Readable fonts, generous line height, comfortable spacing.
- **No attention-grabbing elements.** No pulsing, bouncing, or flashing. Subtle transitions only (150ms ease).
- **Dark mode is essential.** Test your changes in both light and dark themes.

### Technical

- **Keep it local.** No network calls except to the model provider.
- **Keep it transparent.** The user should always be able to see what the AI knows by looking at their vault files.
- **Keep it simple.** Plain markdown files, simple JSON settings, no database.

## Code Style

- TypeScript strict mode is enabled
- React functional components with hooks
- CSS files per component (no CSS-in-JS), using CSS custom properties from `global.css`
- Relative imports for cross-directory references (`../../shared/types`)

## Questions?

Open an issue or start a discussion. There are no stupid questions.

Starting is success.
