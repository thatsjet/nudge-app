# CLAUDE.md

## Build & Verify

```bash
npm run dev                              # Dev server + Electron (hot reload)
npx tsc -p tsconfig.electron.json        # Type-check main process
npx vite build --config vite.config.ts   # Build renderer
```

No test framework yet. Verify changes by running both TypeScript compilers above.

## Key Constraints

- **Two tsconfig files**: `tsconfig.electron.json` (main process, CommonJS, rootDir `src/main`) and `tsconfig.json` (renderer, ESNext). Don't import from `src/shared/` in main process code — types are duplicated in `src/main/providers/types.ts` to avoid cross-rootDir issues.
- **New IPC operations** require changes in three places: handler in `main.ts`, bridge in `preload.ts`, type in `NudgeAPI` interface (`src/shared/types.ts`).
- **Vault path security**: All vault file operations go through `resolveVaultPath()` in main.ts. Never bypass this.
- **API keys** are stored in OS keychain via keytar, never in settings JSON.
- **Streaming**: Main process sends chunks via `webContents.send()`, preload sets up listeners. The `sendMessage` API returns a cancel function — callers must handle cleanup.

## Conventions

- **Commits**: `type: description (#issue)` — e.g. `feat: add priority badges (#15)`
- **Components**: One `.tsx` per component in `components/`, matching `.css` in `styles/`
- **CSS**: Use custom properties from `global.css` (`var(--bg-primary)`, etc.). No CSS-in-JS.
- **Providers**: LLM providers implement the `LLMProvider` interface in `src/main/providers/types.ts`.
