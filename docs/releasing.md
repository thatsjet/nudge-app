# Releasing Nudge

This document describes the automated release process for the Nudge Electron app, required secrets, and how to reproduce builds locally.

## Overview

Releases are built automatically by GitHub Actions using the workflow defined in `.github/workflows/release-electron.yml`. The workflow:

1. Triggers on git tags matching `v*.*.*` (e.g. `v0.2.0`) or via manual `workflow_dispatch`.
2. Builds distributable artifacts for **macOS** (DMG), **Windows** (NSIS installer), and **Linux** (AppImage) using a matrix build.
3. Signs and notarizes the macOS build (when secrets are configured).
4. Signs the Windows build (when secrets are configured).
5. Runs smoke tests to verify artifacts are valid.
6. Runs a vault preservation test to ensure existing user data is not deleted or overwritten.
7. Generates SHA256 checksums for all artifacts.
8. Creates a GitHub Release and uploads all artifacts and checksums.

## Creating a Release

### Via git tag (recommended)

```bash
# Ensure you are on the main branch with a clean working tree
git checkout main
git pull origin main

# Create and push a tag
git tag v0.2.0
git push origin v0.2.0
```

The workflow will trigger automatically, build all platforms, and create a GitHub Release.

### Via workflow_dispatch (manual)

1. Go to **Actions** → **Release Electron App** in the GitHub repository.
2. Click **Run workflow**.
3. Choose whether to create a **draft** release (default: `true`).
4. Click **Run workflow**.

Draft releases are useful for testing — they are not visible to users until manually published.

## Required Secrets

Configure these in **Settings** → **Secrets and variables** → **Actions** in your GitHub repository.

### macOS Code Signing & Notarization

| Secret | Description |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` certificate for macOS code signing |
| `CSC_KEY_PASSWORD` | Password for the `.p12` certificate |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password generated at [appleid.apple.com](https://appleid.apple.com) |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

**Note:** If these secrets are not set, the macOS build will still succeed but the app will be unsigned/un-notarized. Users will see a Gatekeeper warning on first launch.

### Windows Code Signing

| Secret | Description |
|---|---|
| `WINDOWS_CSC_LINK` | Base64-encoded `.pfx` certificate for Windows code signing |
| `WINDOWS_CSC_KEY_PASSWORD` | Password for the `.pfx` certificate |

**Note:** If these secrets are not set, the Windows build will still succeed but the installer will be unsigned. Users may see SmartScreen warnings.

### Automatically Provided

| Secret | Description |
|---|---|
| `GITHUB_TOKEN` | Provided automatically by GitHub Actions; used to create releases and upload assets |

## Build Artifacts

Each release produces the following artifacts:

| Platform | Artifact | Format |
|---|---|---|
| macOS | `Nudge-{version}.dmg` | DMG disk image |
| Windows | `Nudge Setup {version}.exe` | NSIS installer |
| Linux | `Nudge-{version}.AppImage` | AppImage |

A `SHA256SUMS.txt` file is included with checksums for all artifacts.

### Verifying Checksums

```bash
# Download the release artifacts and SHA256SUMS.txt, then:
sha256sum -c SHA256SUMS.txt
```

## Smoke Tests

The workflow runs basic smoke tests for each platform:

- **macOS**: Verifies the `.app` bundle exists and the main binary is present.
- **Linux**: Verifies the AppImage is a valid ELF binary.
- **Windows**: Verifies the installer `.exe` exists and has a reasonable file size (>50 MB).

## Vault Preservation (Installer Safety)

The Nudge vault is a directory (default: `~/Nudge`) where users store their ideas, tasks, and configuration. It is critical that the installer **never** deletes or overwrites existing vault data.

### How it works

- The `vault:initialize` IPC handler copies default vault template files only if they do **not** already exist at the destination (see `src/main/main.ts`).
- The NSIS installer (Windows) and DMG/AppImage installers (macOS/Linux) do not touch the user's home directory vault.

### Automated verification

The release workflow includes a **vault preservation test** on every platform:

1. Creates a simulated vault directory with user data files.
2. Records SHA256 hashes of all files.
3. Verifies that all files remain present and unchanged after the build.

The test script is at `scripts/release-smoke-test.sh` (macOS/Linux) with an equivalent inline PowerShell step for Windows.

### Manual verification checklist

If doing a manual release or verifying on a real machine:

- [ ] Install Nudge on a machine that already has a `~/Nudge` vault directory with data.
- [ ] After installation, verify all files in `~/Nudge` are unchanged.
- [ ] Launch Nudge and verify it opens the existing vault without prompting to re-initialize.
- [ ] Verify no files were added, deleted, or modified in the vault unless the user explicitly requested it.

## Reproducing Builds Locally

### Prerequisites

- Node.js 20+
- npm 10+
- For macOS signing: a valid Apple Developer certificate installed in your Keychain
- For Windows signing: a valid code-signing certificate (`.pfx` file)

### Steps

```bash
# Install dependencies
npm ci

# Build the renderer (Vite)
npm run build:vite

# Build the Electron main process (TypeScript)
npm run build:electron

# Package for your current platform
npx electron-builder

# Or target a specific platform
npx electron-builder --mac
npx electron-builder --win
npx electron-builder --linux
```

Built artifacts will be in the `release/` directory.

### Signing locally

For macOS:
```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
npx electron-builder --mac
```

For Windows:
```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your-password
npx electron-builder --win
```

## Troubleshooting

### Build fails with "Cannot find module" errors

Run `npm ci` to ensure all dependencies are installed.

### macOS notarization fails

- Verify `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` secrets are correct.
- Ensure the Apple ID has accepted the latest Apple Developer agreements.
- Check that the app-specific password has not expired.

### Windows SmartScreen warning

This occurs when the installer is not code-signed. Configure `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD` secrets to enable signing.

### Linux AppImage does not launch

Ensure `libfuse2` is installed: `sudo apt install libfuse2`.
