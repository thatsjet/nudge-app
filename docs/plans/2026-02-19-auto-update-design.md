# Auto-Update Feature Design

**Issue:** #24
**Date:** 2026-02-19

## Overview

Add automatic update checking via `electron-updater`. On startup (if enabled), the app checks GitHub Releases for new versions. Users see a badge on the gear icon and can download/install from Settings > About. A "Check for Updates..." menu item provides manual checking.

## User Flow

1. App starts -> checks for updates (if toggle ON, default ON)
2. If update found -> dot badge appears on gear icon, Settings > About shows version + "Download & Update" button
3. User clicks Download -> progress bar shown
4. Download completes -> "Restart to Update" button
5. User clicks -> app quits, installs, relaunches

Manual path: File > "Check for Updates..." triggers a check and opens Settings.

## Data Types

New types in `src/shared/types.ts` (duplicated in `src/main/providers/types.ts`):

```ts
interface UpdateInfo { version: string; releaseDate?: string }
interface UpdateProgress { percent: number; bytesPerSecond: number; total: number; transferred: number }
type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'not-available' }
  | { state: 'downloading'; progress: UpdateProgress }
  | { state: 'downloaded'; info: UpdateInfo }
  | { state: 'error'; message: string }
```

`AppSettings` gets `autoCheckUpdates: boolean` (default `true`).

`NudgeAPI` extensions:
- `app.getVersion()` -> `Promise<string>`
- `updater.checkForUpdates()` -> `Promise<void>`
- `updater.downloadUpdate()` -> `Promise<void>`
- `updater.installUpdate()` -> `Promise<void>`
- `updater.getStatus()` -> `Promise<UpdateStatus>`
- `updater.onStatusChange(cb)` -> returns cleanup function

## Main Process (`src/main/main.ts`)

**Updater setup:**
- Import `autoUpdater` from `electron-updater` (NOT `electron`)
- Module-level `let updateStatus: UpdateStatus = { state: 'idle' }`
- `setUpdateStatus()` helper — updates variable, broadcasts via `mainWindow.webContents.send('updater:status-changed', status)`
- Configure: `autoUpdater.autoDownload = false`, `autoUpdater.autoInstallOnAppQuit = false`
- Wire all `autoUpdater` events to `setUpdateStatus()` calls
- Guard everything with `app.isPackaged` — in dev, `getStatus` returns `idle`, check/download/install are no-ops

**IPC handlers:**
- `app:get-version` -> `app.getVersion()`
- `updater:check` -> `autoUpdater.checkForUpdates()`
- `updater:download` -> `autoUpdater.downloadUpdate()`
- `updater:install` -> `autoUpdater.quitAndInstall()`
- `updater:get-status` -> returns current `updateStatus`

**Startup check:**
- After `createWindow()`, if `app.isPackaged` and `autoCheckUpdates !== false`, call `autoUpdater.checkForUpdates()` with 3-second delay

**App menu:**
- Add "Check for Updates..." to File menu (between Save and the separator)
- On click: calls `autoUpdater.checkForUpdates()` (guarded by `app.isPackaged`), sends `mainWindow.webContents.send('menu:check-for-updates')` so renderer can open Settings

## Preload Bridge (`src/main/preload.ts`)

- `app.getVersion` -> `ipcRenderer.invoke('app:get-version')`
- New `updater` namespace:
  - `checkForUpdates` -> `ipcRenderer.invoke('updater:check')`
  - `downloadUpdate` -> `ipcRenderer.invoke('updater:download')`
  - `installUpdate` -> `ipcRenderer.invoke('updater:install')`
  - `getStatus` -> `ipcRenderer.invoke('updater:get-status')`
  - `onStatusChange(callback)` -> listener on `'updater:status-changed'` channel, returns cleanup function (same pattern as `onMenuSave`)

## Renderer

### Settings.tsx — About section
- Load `appVersion` from `window.nudge.app.getVersion()` on mount, replace hardcoded "v0.1.0"
- Subscribe to `updater.onStatusChange` while settings panel is open
- "Check for updates on startup" checkbox toggle (reads/writes `autoCheckUpdates` setting)
- Conditional rendering by `updateStatus.state`:
  - `checking`: "Checking for updates..."
  - `available`: "Version X.X.X is available" + "Download & Update" button
  - `downloading`: progress bar with percentage
  - `downloaded`: "Restart to Update" button
  - `not-available`: "You're on the latest version" (auto-clears after 5s)
  - `error`: error message
- Listen for `menu:check-for-updates` -> open settings panel if not already open

### App.tsx
- `hasUpdate` state, initialized from `updater.getStatus()` on mount
- Subscribe to `updater.onStatusChange` — `hasUpdate = true` when state is `available` or `downloaded`
- Listen for `menu:check-for-updates` -> open settings
- Pass `hasUpdate` to `<Header>`

### Header.tsx
- Add `hasUpdate?: boolean` prop
- Render `.header-update-dot` on gear button when `hasUpdate` is true

### New styles
- `Settings.css`: `.settings-progress-bar` / `.settings-progress-fill` (thin accent bar), `.settings-update-banner`, `.settings-toggle-row`
- `Header.css`: `.header-update-dot` — 8px accent circle, top-right of gear button

## Build & CI

### `package.json`
- `npm install electron-updater`

### `electron-builder.yml`
- Add top-level `publish` config:
  ```yaml
  publish:
    provider: github
    owner: thatsjet
    repo: nudge-app
  ```

### `.github/workflows/release-electron.yml`
- Build steps stay `--publish never` (build, smoke test, checksums all run first)
- In the `release` job (after all builds succeed), generate `latest.yml` / `latest-mac.yml` / `latest-linux.yml` metadata files:
  - Read version from `package.json`
  - Compute sha512 and file size of each installer artifact
  - Write YAML metadata files in electron-updater's expected format
- Upload metadata files alongside installers via existing `softprops/action-gh-release` step
- `EP_DRAFT` not needed — softprops handles draft via its existing `draft` input

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Add `electron-updater` dependency |
| `electron-builder.yml` | Add `publish` config |
| `src/shared/types.ts` | Add `UpdateInfo`, `UpdateProgress`, `UpdateStatus`; extend `AppSettings`, `NudgeAPI` |
| `src/main/providers/types.ts` | Duplicate update types for main process |
| `src/main/main.ts` | Updater setup, IPC handlers, startup check, menu item |
| `src/main/preload.ts` | Expose `getVersion` + `updater` namespace |
| `src/renderer/components/Settings.tsx` | Dynamic version, toggle, update status UI |
| `src/renderer/styles/Settings.css` | Progress bar, banner, toggle styles |
| `src/renderer/App.tsx` | `hasUpdate` state, menu listener, pass to Header |
| `src/renderer/components/Header.tsx` | Accept `hasUpdate`, render badge dot |
| `src/renderer/styles/Header.css` | Badge dot style |
| `.github/workflows/release-electron.yml` | Generate + upload `latest*.yml` metadata in release job |

## Deferred

- `skippedVersion` / "Skip this version" button — adds state complexity, can add later
