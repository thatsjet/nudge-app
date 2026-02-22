# Auto-Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automatic update checking via electron-updater so users get notified of new versions and can download/install from within the app.

**Architecture:** electron-updater checks GitHub Releases for `latest*.yml` metadata files. Main process manages update state and broadcasts changes to renderer via IPC. Settings panel shows update UI; Header shows a badge dot when an update is available.

**Tech Stack:** electron-updater, Electron IPC, React state management

---

### Task 1: Install electron-updater

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npm install electron-updater`

**Step 2: Verify installation**

Run: `node -e "require('electron-updater')"`
Expected: No errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron-updater dependency (#24)"
```

---

### Task 2: Add publish config to electron-builder

**Files:**
- Modify: `electron-builder.yml`

**Step 1: Add publish config**

Add to the top of `electron-builder.yml`, after the `linux` section:

```yaml
publish:
  provider: github
  owner: thatsjet
  repo: nudge-app
```

This tells electron-updater where to look for releases. The build steps still use `--publish never` so this only affects the updater's runtime config.

**Step 2: Verify YAML is valid**

Run: `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('electron-builder.yml', 'utf8')); console.log('valid')"`

If `js-yaml` isn't available, just visually confirm the YAML structure is correct.

**Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "chore: add GitHub publish config for electron-updater (#24)"
```

---

### Task 3: Add update types to shared and main

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/providers/types.ts`

**Step 1: Add types to `src/shared/types.ts`**

Add these interfaces after the `AppSettings` interface (after line 34):

```typescript
export interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'not-available' }
  | { state: 'downloading'; progress: UpdateProgress }
  | { state: 'downloaded'; info: UpdateInfo }
  | { state: 'error'; message: string };
```

Add `autoCheckUpdates: boolean;` to the `AppSettings` interface.

Extend the `NudgeAPI` interface — add `getVersion` to the `app` section:

```typescript
app: {
  getSystemPrompt: () => Promise<string>;
  getVersion: () => Promise<string>;
  onMenuSave: (callback: () => void) => () => void;
  onCheckForUpdates: (callback: () => void) => () => void;
};
```

Add a new `updater` section to `NudgeAPI`:

```typescript
updater: {
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  getStatus: () => Promise<UpdateStatus>;
  onStatusChange: (callback: (status: UpdateStatus) => void) => () => void;
};
```

**Step 2: Duplicate update types in `src/main/providers/types.ts`**

Add at the end of the file:

```typescript
// Auto-updater types (duplicated from shared/types.ts)
export interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'not-available' }
  | { state: 'downloading'; progress: UpdateProgress }
  | { state: 'downloaded'; info: UpdateInfo }
  | { state: 'error'; message: string };
```

**Step 3: Verify both configs compile**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: No errors

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: Errors about missing implementations in preload (expected — we'll fix in next tasks)

**Step 4: Commit**

```bash
git add src/shared/types.ts src/main/providers/types.ts
git commit -m "feat: add auto-update types (#24)"
```

---

### Task 4: Add updater logic and IPC handlers to main process

**Files:**
- Modify: `src/main/main.ts`

**Step 1: Add import and module-level state**

At the top of `src/main/main.ts`, add the import after the existing imports:

```typescript
import { autoUpdater } from 'electron-updater';
import { UpdateStatus } from './providers/types';
```

Add module-level state after the existing `const IS_DEV` line:

```typescript
let updateStatus: UpdateStatus = { state: 'idle' };

function setUpdateStatus(status: UpdateStatus): void {
  updateStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status-changed', status);
  }
}
```

**Step 2: Add updater configuration and event wiring**

Add a function after the `setUpdateStatus` helper:

```typescript
function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdateStatus({
      state: 'available',
      info: { version: info.version, releaseDate: info.releaseDate },
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateStatus({ state: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdateStatus({
      state: 'downloading',
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      },
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateStatus({
      state: 'downloaded',
      info: { version: info.version, releaseDate: info.releaseDate },
    });
  });

  autoUpdater.on('error', (error) => {
    setUpdateStatus({ state: 'error', message: error?.message || 'Update check failed' });
  });
}
```

**Step 3: Add IPC handlers**

Add these alongside the existing IPC handlers (after the `app:get-system-prompt` handler):

```typescript
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) return;
  await autoUpdater.checkForUpdates();
});

ipcMain.handle('updater:download', async () => {
  if (!app.isPackaged) return;
  await autoUpdater.downloadUpdate();
});

ipcMain.handle('updater:install', () => {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
});

ipcMain.handle('updater:get-status', () => {
  return updateStatus;
});
```

**Step 4: Add "Check for Updates..." to File menu**

In the `app.whenReady().then()` block, find the File menu submenu array and add the menu item between Save and the separator:

```typescript
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
    {
      label: 'Check for Updates...',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('menu:check-for-updates');
        }
        if (app.isPackaged) {
          autoUpdater.checkForUpdates();
        }
      },
    },
    { type: 'separator' },
    { role: 'close' },
  ],
},
```

**Step 5: Call setup and startup check**

In the `app.whenReady().then()` block, add after `await migrateApiKey()` and before the menu setup:

```typescript
setupAutoUpdater();
```

After `createWindow()`, add the startup check:

```typescript
// Auto-check for updates on startup (packaged builds only)
if (app.isPackaged) {
  const settings = loadSettings();
  if (settings.autoCheckUpdates !== false) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 3000);
  }
}
```

**Step 6: Verify main process compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: add auto-updater logic, IPC handlers, and menu item (#24)"
```

---

### Task 5: Expose updater APIs in preload bridge

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: Add getVersion and onCheckForUpdates to app section**

In the `contextBridge.exposeInMainWorld('nudge', {` block, update the `app` section:

```typescript
app: {
  getSystemPrompt: () => invoke<string>('app:get-system-prompt'),
  getVersion: () => invoke<string>('app:get-version'),
  onMenuSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save', handler);
    return () => { ipcRenderer.removeListener('menu:save', handler); };
  },
  onCheckForUpdates: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:check-for-updates', handler);
    return () => { ipcRenderer.removeListener('menu:check-for-updates', handler); };
  },
},
```

**Step 2: Add updater section**

Add the `updater` section after `sessions`:

```typescript
updater: {
  checkForUpdates: () => invoke<void>('updater:check'),
  downloadUpdate: () => invoke<void>('updater:download'),
  installUpdate: () => invoke<void>('updater:install'),
  getStatus: () => invoke<any>('updater:get-status'),
  onStatusChange: (callback: (status: any) => void) => {
    const handler = (_event: any, status: any) => callback(status);
    ipcRenderer.on('updater:status-changed', handler);
    return () => { ipcRenderer.removeListener('updater:status-changed', handler); };
  },
},
```

**Step 3: Verify main process compiles**

Run: `npx tsc -p tsconfig.electron.json --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat: expose updater APIs in preload bridge (#24)"
```

---

### Task 6: Add update badge to Header

**Files:**
- Modify: `src/renderer/components/Header.tsx`
- Modify: `src/renderer/styles/Header.css`

**Step 1: Update Header component**

Update `HeaderProps` to include `hasUpdate`:

```typescript
interface HeaderProps {
  onToggleExplorer: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  explorerOpen: boolean;
  hasUpdate?: boolean;
}
```

Update the component signature and wrap the settings button to show a dot:

```typescript
export default function Header({ onToggleExplorer, onOpenSettings, onNewChat, explorerOpen, hasUpdate }: HeaderProps) {
```

Replace the settings button with:

```tsx
<button className="header-btn header-btn--settings" onClick={onOpenSettings} title="Settings">
  <span role="img" aria-label="Settings">&#9881;&#65039;</span>
  {hasUpdate && <span className="header-update-dot" />}
</button>
```

**Step 2: Add badge dot style to `src/renderer/styles/Header.css`**

Add at the end:

```css
.header-btn--settings {
  position: relative;
}

.header-update-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}
```

**Step 3: Verify renderer builds**

Run: `npx vite build --config vite.config.ts`
Expected: Build succeeds (may have type errors until App.tsx passes the prop — that's OK, we fix it in the next task)

**Step 4: Commit**

```bash
git add src/renderer/components/Header.tsx src/renderer/styles/Header.css
git commit -m "feat: add update badge dot to settings gear icon (#24)"
```

---

### Task 7: Wire up hasUpdate state in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Add hasUpdate state and updater subscription**

Add state near the other `useState` calls:

```typescript
const [hasUpdate, setHasUpdate] = useState(false);
```

Add a `useEffect` for the updater status subscription (after the existing `useEffect` blocks):

```typescript
// Subscribe to update status changes
useEffect(() => {
  // Check initial status
  window.nudge.updater.getStatus().then((status) => {
    setHasUpdate(status.state === 'available' || status.state === 'downloaded');
  });

  // Listen for changes
  const cleanup = window.nudge.updater.onStatusChange((status) => {
    setHasUpdate(status.state === 'available' || status.state === 'downloaded');
  });

  return cleanup;
}, []);
```

Add a `useEffect` for the menu "Check for Updates..." event:

```typescript
// Listen for "Check for Updates..." menu item
useEffect(() => {
  const cleanup = window.nudge.app.onCheckForUpdates(() => {
    setSettingsOpen(true);
  });
  return cleanup;
}, []);
```

**Step 2: Pass hasUpdate to Header**

Update the `<Header>` JSX to pass the prop:

```tsx
<Header
  onToggleExplorer={() => setExplorerOpen(!explorerOpen)}
  onOpenSettings={() => setSettingsOpen(true)}
  onNewChat={handleNewChat}
  explorerOpen={explorerOpen}
  hasUpdate={hasUpdate}
/>
```

**Step 3: Verify renderer builds**

Run: `npx vite build --config vite.config.ts`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire update badge state and menu listener in App (#24)"
```

---

### Task 8: Add update UI to Settings panel

**Files:**
- Modify: `src/renderer/components/Settings.tsx`
- Modify: `src/renderer/styles/Settings.css`

**Step 1: Import UpdateStatus type and add state**

Add import at the top of Settings.tsx:

```typescript
import type { ProviderId, UpdateStatus } from '../../shared/types';
```

Add state inside the component, near the other `useState` calls:

```typescript
const [appVersion, setAppVersion] = useState('');
const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
```

**Step 2: Load version and update settings in the existing useEffect**

Inside the existing `loadSettings` async function in the `useEffect`, add:

```typescript
const version = await window.nudge.app.getVersion();
setAppVersion(version);

const autoCheck = await window.nudge.settings.get('autoCheckUpdates');
setAutoCheckUpdates(autoCheck !== false);

const status = await window.nudge.updater.getStatus();
setUpdateStatus(status);
```

**Step 3: Subscribe to status changes**

Add a separate `useEffect` for the updater subscription:

```typescript
useEffect(() => {
  if (!isOpen) return;

  const cleanup = window.nudge.updater.onStatusChange((status: UpdateStatus) => {
    setUpdateStatus(status);
  });

  return cleanup;
}, [isOpen]);
```

Add another `useEffect` to auto-clear "not-available" status after 5 seconds:

```typescript
useEffect(() => {
  if (updateStatus.state !== 'not-available') return;

  const timer = setTimeout(() => {
    setUpdateStatus({ state: 'idle' });
  }, 5000);

  return () => clearTimeout(timer);
}, [updateStatus.state]);
```

**Step 4: Add toggle handler**

```typescript
const handleAutoCheckToggle = async () => {
  const newValue = !autoCheckUpdates;
  setAutoCheckUpdates(newValue);
  await window.nudge.settings.set('autoCheckUpdates', newValue);
};
```

**Step 5: Replace the About section in the JSX**

Replace the existing About section (the `{/* About */}` block) with:

```tsx
{/* About */}
<div className="settings-section">
  <label className="settings-label">About</label>
  <div className="settings-about">
    Nudge v{appVersion || '...'}<br />
    Open source under MIT license.
  </div>

  <div className="settings-toggle-row">
    <label>
      <input
        type="checkbox"
        checked={autoCheckUpdates}
        onChange={handleAutoCheckToggle}
      />
      Check for updates on startup
    </label>
  </div>

  {updateStatus.state === 'checking' && (
    <div className="settings-update-banner">
      Checking for updates...
    </div>
  )}

  {updateStatus.state === 'available' && (
    <div className="settings-update-banner">
      <span>Version {updateStatus.info.version} is available</span>
      <button
        className="settings-btn settings-btn--primary settings-btn--small"
        onClick={() => window.nudge.updater.downloadUpdate()}
      >
        Download &amp; Update
      </button>
    </div>
  )}

  {updateStatus.state === 'downloading' && (
    <div className="settings-update-banner">
      <span>Downloading... {Math.round(updateStatus.progress.percent)}%</span>
      <div className="settings-progress-bar">
        <div
          className="settings-progress-fill"
          style={{ width: `${updateStatus.progress.percent}%` }}
        />
      </div>
    </div>
  )}

  {updateStatus.state === 'downloaded' && (
    <div className="settings-update-banner">
      <span>Version {updateStatus.info.version} is ready</span>
      <button
        className="settings-btn settings-btn--primary settings-btn--small"
        onClick={() => window.nudge.updater.installUpdate()}
      >
        Restart to Update
      </button>
    </div>
  )}

  {updateStatus.state === 'not-available' && (
    <div className="settings-update-banner">
      You're on the latest version.
    </div>
  )}

  {updateStatus.state === 'error' && (
    <div className="settings-update-banner settings-update-banner--error">
      Update error: {updateStatus.message}
    </div>
  )}

  {updateStatus.state === 'idle' && (
    <button
      className="settings-btn settings-btn--secondary settings-btn--small"
      onClick={() => window.nudge.updater.checkForUpdates()}
      style={{ marginTop: 8 }}
    >
      Check for Updates
    </button>
  )}
</div>
```

**Step 6: Add styles to `src/renderer/styles/Settings.css`**

Add at the end of the file:

```css
.settings-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.settings-toggle-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.settings-toggle-row input[type="checkbox"] {
  accent-color: var(--accent);
}

.settings-update-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  font-size: 13px;
  color: var(--text-primary);
}

.settings-update-banner--error {
  color: #a85040;
  background: rgba(168, 80, 64, 0.1);
}

.settings-progress-bar {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  overflow: hidden;
}

.settings-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 200ms ease;
}
```

**Step 7: Verify full build**

Run: `npx tsc -p tsconfig.electron.json --noEmit && npx vite build --config vite.config.ts`
Expected: Both compile without errors

**Step 8: Commit**

```bash
git add src/renderer/components/Settings.tsx src/renderer/styles/Settings.css
git commit -m "feat: add update UI to Settings panel (#24)"
```

---

### Task 9: Update CI workflow to generate latest*.yml metadata

**Files:**
- Modify: `.github/workflows/release-electron.yml`

**Step 1: Add metadata generation steps to the release job**

In the `release` job, after the "Merge checksums" step and before the "Create GitHub Release" step, add:

```yaml
- name: Generate electron-updater metadata
  run: |
    cd artifacts
    VERSION=$(node -e "console.log(require('../package.json').version)" 2>/dev/null || echo "")
    if [ -z "$VERSION" ]; then
      # Fallback: extract from tag
      VERSION="${{ github.event.inputs.tag || github.ref_name }}"
      VERSION="${VERSION#v}"
    fi

    generate_metadata() {
      local file="$1"
      local output="$2"
      if [ ! -f "$file" ]; then return; fi
      local sha512=$(shasum -a 512 "$file" | awk '{print $1}' | xxd -r -p | base64)
      local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
      local filename=$(basename "$file")
      cat > "$output" << YAML
    version: ${VERSION}
    files:
      - url: ${filename}
        sha512: ${sha512}
        size: ${size}
    path: ${filename}
    sha512: ${sha512}
    releaseDate: $(date -u +%Y-%m-%dT%H:%M:%S.000Z)
    YAML
      echo "Generated $output for $filename"
    }

    # macOS
    DMG=$(ls *.dmg 2>/dev/null | head -1)
    if [ -n "$DMG" ]; then
      generate_metadata "$DMG" "latest-mac.yml"
    fi

    # Windows
    EXE=$(ls *.exe 2>/dev/null | head -1)
    if [ -n "$EXE" ]; then
      generate_metadata "$EXE" "latest.yml"
    fi

    # Linux
    APPIMAGE=$(ls *.AppImage 2>/dev/null | head -1)
    if [ -n "$APPIMAGE" ]; then
      generate_metadata "$APPIMAGE" "latest-linux.yml"
    fi
```

**Step 2: Add metadata files to the release upload**

In the "Create GitHub Release" step, add the metadata files to the `files` list:

```yaml
files: |
  artifacts/*.dmg
  artifacts/*.zip
  artifacts/*.exe
  artifacts/*.AppImage
  artifacts/*.deb
  artifacts/*.snap
  artifacts/*.tar.gz
  artifacts/SHA256SUMS.txt
  artifacts/latest.yml
  artifacts/latest-mac.yml
  artifacts/latest-linux.yml
```

**Step 3: Commit**

```bash
git add .github/workflows/release-electron.yml
git commit -m "feat: generate electron-updater metadata in release workflow (#24)"
```

---

### Task 10: Final verification

**Step 1: Full build check**

Run: `npx tsc -p tsconfig.electron.json --noEmit && npx vite build --config vite.config.ts`
Expected: Both compile without errors

**Step 2: Dev mode smoke test**

Run: `npm run dev`

Verify:
- App launches without updater errors (updater is no-op in dev mode)
- Settings panel shows version number (from `package.json`, e.g., "Nudge v0.1.2")
- "Check for updates on startup" checkbox is visible and toggleable
- "Check for Updates" button appears in idle state
- File > "Check for Updates..." menu item exists
- No dot badge on gear icon (no update available in dev)

**Step 3: Commit any final fixes if needed**

```bash
git add -A
git commit -m "fix: address final auto-update issues (#24)"
```
