# Security Policy

## Our Commitment

Nudge is designed with privacy and security as core principles. All data stays on your machine, there are no Nudge servers, and the only external network calls are to the Anthropic API using your own key.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in Nudge, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@nudge-app.dev** (or open a private security advisory on GitHub under the Security tab).

Include:
- A description of the vulnerability
- Steps to reproduce it
- The potential impact
- Any suggested fix (if you have one)

We will acknowledge your report within **48 hours** and aim to provide a fix or mitigation within **7 days** for critical issues.

## Security Architecture

### API Key Storage

- API keys are stored in the **OS credential store** via [keytar](https://github.com/nicknisi/keytar):
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: Secret Service API (GNOME Keyring / KDE Wallet)
- Keys are **never** written to plain text config files, logs, or the vault directory
- If keytar is unavailable (e.g., on some Linux setups without a secrets service), keys fall back to the app's local settings file in the user data directory

### Data Privacy

- **No telemetry.** Nudge does not collect analytics, crash reports, or usage data
- **No accounts.** There is no Nudge server, login, or registration
- **Local-only storage.** All vault data (ideas, tasks, daily logs) stays on your filesystem
- **No cloud sync.** If you want to sync your vault, that's your choice (git, Dropbox, iCloud, etc.)
- The only network traffic is between your machine and the Anthropic API

### Vault Sandboxing

- All file operations are sandboxed to the vault directory
- Path traversal attacks are prevented — resolved paths are validated to ensure they stay within the vault root
- The AI (Claude) can only read and write files inside the vault through the defined tool interface

### Electron Security

- `nodeIntegration` is **disabled** in the renderer process
- `contextIsolation` is **enabled** — the renderer communicates with the main process only through the preload bridge (`window.nudge`)
- A Content Security Policy is set on the renderer HTML
- External links open in the system browser, not in the Electron window

## Best Practices for Users

- **Keep your API key private.** Don't commit it to version control or share it in public vault files
- **Review your vault before sharing.** If you push your vault to a public git repo, make sure it doesn't contain sensitive information
- **Keep Nudge updated.** Security patches will be released as new versions
- **Use a secrets service on Linux.** Install GNOME Keyring or KDE Wallet for secure API key storage
