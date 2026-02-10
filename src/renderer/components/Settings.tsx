import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

type Theme = 'light' | 'dark' | 'system';

export default function Settings({ isOpen, onClose }: SettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [theme, setTheme] = useState<Theme>('system');
  const [vaultPath, setVaultPath] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      try {
        const key = await window.nudge.settings.getApiKey();
        if (key) setApiKey(key);

        const savedModel = await window.nudge.settings.get('model');
        if (savedModel) setModel(savedModel);

        const savedTheme = await window.nudge.settings.get('theme');
        if (savedTheme) setTheme(savedTheme as Theme);

        const path = await window.nudge.vault.getPath();
        if (path) setVaultPath(path);
      } catch {
        // Settings may not be initialized yet
      }
    };

    loadSettings();
  }, [isOpen]);

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return;

    setValidating(true);
    setKeyFeedback(null);

    try {
      const valid = await window.nudge.api.validateKey(apiKey.trim());
      if (valid) {
        await window.nudge.settings.setApiKey(apiKey.trim());
        setKeyFeedback({ type: 'success', message: 'API key saved successfully.' });
      } else {
        setKeyFeedback({ type: 'error', message: 'Invalid API key. Please check and try again.' });
      }
    } catch {
      setKeyFeedback({ type: 'error', message: 'Could not validate key. Check your connection.' });
    } finally {
      setValidating(false);
    }
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setModel(value);
    await window.nudge.settings.set('model', value);
  };

  const handleThemeChange = async (newTheme: Theme) => {
    setTheme(newTheme);
    await window.nudge.settings.set('theme', newTheme);

    // Apply theme immediately
    const root = document.documentElement;
    if (newTheme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', newTheme);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>&#10005;</button>
        </div>

        <div className="settings-body">
          {/* API Key */}
          <div className="settings-section">
            <label className="settings-label">API Key</label>
            <p className="settings-description">Your Anthropic API key. Stored securely on your device.</p>
            <div className="settings-input-row">
              <input
                className="settings-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyFeedback(null); }}
                placeholder="sk-ant-..."
              />
              <button
                className="settings-btn settings-btn--secondary settings-btn--small"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                className="settings-btn settings-btn--primary settings-btn--small"
                onClick={handleValidateKey}
                disabled={validating || !apiKey.trim()}
              >
                {validating ? '...' : 'Save'}
              </button>
            </div>
            {keyFeedback && (
              <div className={`settings-feedback settings-feedback--${keyFeedback.type}`}>
                {keyFeedback.message}
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div className="settings-section">
            <label className="settings-label">Model</label>
            <select className="settings-select" value={model} onChange={handleModelChange}>
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Vault Location */}
          <div className="settings-section">
            <label className="settings-label">Vault Location</label>
            <input
              className="settings-input settings-input--readonly"
              type="text"
              value={vaultPath}
              readOnly
            />
          </div>

          {/* Theme */}
          <div className="settings-section">
            <label className="settings-label">Theme</label>
            <div className="settings-theme-options">
              {(['light', 'dark', 'system'] as Theme[]).map(t => (
                <button
                  key={t}
                  className={`settings-theme-btn ${theme === t ? 'settings-theme-btn--active' : ''}`}
                  onClick={() => handleThemeChange(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-divider" />

          {/* About */}
          <div className="settings-section">
            <label className="settings-label">About</label>
            <div className="settings-about">
              Nudge v0.1.0<br />
              Open source under MIT license.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
