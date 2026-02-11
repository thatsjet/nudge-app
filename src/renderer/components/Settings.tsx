import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';
import type { ProviderId } from '../../shared/types';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProviderMeta {
  name: string;
  models: { value: string; label: string }[];
  keyPlaceholder: string;
  showBaseUrl: boolean;
  allowCustomModel: boolean;
}

const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    name: 'Anthropic',
    models: [
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { value: 'claude-sonnet-4-0', label: 'Claude Sonnet 4' },
    ],
    keyPlaceholder: 'sk-ant-...',
    showBaseUrl: false,
    allowCustomModel: false,
  },
  openai: {
    name: 'OpenAI',
    models: [
      { value: 'gpt-5.2', label: 'gpt-5.2' },
      { value: 'gpt-5-mini', label: 'gpt-5-mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4.1', label: 'gpt-4.1' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { value: 'o3-mini', label: 'o3-mini' },
    ],
    keyPlaceholder: 'sk-...',
    showBaseUrl: false,
    allowCustomModel: false,
  },
  custom: {
    name: 'Custom',
    models: [
      { value: 'gpt-5.2', label: 'gpt-5.2' },
      { value: 'gpt-5-mini', label: 'gpt-5-mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4.1', label: 'gpt-4.1' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { value: 'o3-mini', label: 'o3-mini' },
    ],
    keyPlaceholder: 'your-api-key',
    showBaseUrl: true,
    allowCustomModel: true,
  },
};

const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'custom'];

type Theme = 'light' | 'dark' | 'system';

export default function Settings({ isOpen, onClose }: SettingsProps) {
  const [activeProvider, setActiveProvider] = useState<ProviderId>('anthropic');
  const [providerKeys, setProviderKeys] = useState<Record<ProviderId, string>>({
    anthropic: '', openai: '', custom: '',
  });
  const [providerModels, setProviderModels] = useState<Record<ProviderId, string>>({
    anthropic: 'claude-sonnet-4-5',
    openai: 'gpt-4o',
    custom: 'gpt-4o',
  });
  const [customModelInput, setCustomModelInput] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [vaultPath, setVaultPath] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      try {
        const savedProvider = await window.nudge.settings.get('activeProvider');
        if (savedProvider) setActiveProvider(savedProvider as ProviderId);

        for (const pid of PROVIDER_IDS) {
          const key = await window.nudge.settings.getApiKey(pid);
          if (key) setProviderKeys((prev) => ({ ...prev, [pid]: key }));

          const savedModel = await window.nudge.settings.get(`model-${pid}`);
          if (savedModel) setProviderModels((prev) => ({ ...prev, [pid]: savedModel }));
        }

        const baseUrl = await window.nudge.settings.getProviderBaseUrl('custom');
        if (baseUrl) setCustomBaseUrl(baseUrl);

        const savedTheme = await window.nudge.settings.get('theme');
        if (savedTheme) setTheme(savedTheme as Theme);

        const path = await window.nudge.vault.getPath();
        if (path) setVaultPath(path);
      } catch {
        // Settings may not be initialized yet
      }
    };

    loadSettings();
    setKeyFeedback(null);
    setShowKey(false);
  }, [isOpen]);

  const handleProviderChange = async (pid: ProviderId) => {
    setActiveProvider(pid);
    setKeyFeedback(null);
    setShowKey(false);
    await window.nudge.settings.set('activeProvider', pid);
  };

  const handleValidateKey = async () => {
    const key = providerKeys[activeProvider].trim();
    if (!key) return;
    const model = providerModels[activeProvider];

    setValidating(true);
    setKeyFeedback(null);

    try {
      const baseUrl = activeProvider === 'custom' ? customBaseUrl.trim() || undefined : undefined;
      const valid = await window.nudge.api.validateKey(activeProvider, key, baseUrl, model);
      if (valid) {
        await window.nudge.settings.setApiKey(activeProvider, key);
        if (baseUrl) {
          await window.nudge.settings.setProviderBaseUrl(activeProvider, baseUrl);
        }
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

  const handleModelChange = async (value: string) => {
    setProviderModels((prev) => ({ ...prev, [activeProvider]: value }));
    await window.nudge.settings.set(`model-${activeProvider}`, value);
  };

  const handleCustomModelSubmit = async () => {
    const val = customModelInput.trim();
    if (!val) return;
    setProviderModels((prev) => ({ ...prev, custom: val }));
    await window.nudge.settings.set('model-custom', val);
    setCustomModelInput('');
  };

  const handleThemeChange = async (newTheme: Theme) => {
    setTheme(newTheme);
    await window.nudge.settings.set('theme', newTheme);

    const root = document.documentElement;
    if (newTheme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', newTheme);
    }
  };

  if (!isOpen) return null;

  const meta = PROVIDERS[activeProvider];
  const currentModel = providerModels[activeProvider];
  const isPresetModel = meta.models.some((m) => m.value === currentModel);

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>&#10005;</button>
        </div>

        <div className="settings-body">
          {/* Provider Tabs */}
          <div className="settings-section">
            <label className="settings-label">Provider</label>
            <div className="settings-provider-tabs">
              {PROVIDER_IDS.map((pid) => (
                <button
                  key={pid}
                  className={`settings-provider-tab ${activeProvider === pid ? 'settings-provider-tab--active' : ''}`}
                  onClick={() => handleProviderChange(pid)}
                >
                  {PROVIDERS[pid].name}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL (Custom only) */}
          {meta.showBaseUrl && (
            <div className="settings-section">
              <label className="settings-label">Base URL</label>
              <p className="settings-description">The OpenAI-compatible API endpoint.</p>
              <input
                className="settings-input"
                type="text"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="https://your-server.com/v1"
              />
            </div>
          )}

          {/* API Key */}
          <div className="settings-section">
            <label className="settings-label">API Key</label>
            <p className="settings-description">
              Your {meta.name} API key. Stored securely on your device.
            </p>
            <div className="settings-input-row">
              <input
                className="settings-input"
                type={showKey ? 'text' : 'password'}
                value={providerKeys[activeProvider]}
                onChange={(e) => {
                  setProviderKeys((prev) => ({ ...prev, [activeProvider]: e.target.value }));
                  setKeyFeedback(null);
                }}
                placeholder={meta.keyPlaceholder}
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
                disabled={validating || !providerKeys[activeProvider].trim()}
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
            <select
              className="settings-select"
              value={isPresetModel ? currentModel : '__custom__'}
              onChange={(e) => {
                if (e.target.value !== '__custom__') {
                  handleModelChange(e.target.value);
                }
              }}
            >
              {meta.models.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
              {meta.allowCustomModel && (
                <option value="__custom__">Custom model...</option>
              )}
              {!isPresetModel && !meta.allowCustomModel && (
                <option value={currentModel}>{currentModel}</option>
              )}
            </select>

            {/* Custom model text input */}
            {meta.allowCustomModel && (isPresetModel ? false : true) && (
              <div className="settings-input-row" style={{ marginTop: 8 }}>
                <input
                  className="settings-input"
                  type="text"
                  value={customModelInput || (isPresetModel ? '' : currentModel)}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  placeholder="Enter model name"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomModelSubmit(); }}
                />
                <button
                  className="settings-btn settings-btn--primary settings-btn--small"
                  onClick={handleCustomModelSubmit}
                  disabled={!customModelInput.trim() && isPresetModel}
                >
                  Set
                </button>
              </div>
            )}

            {/* Show when user selects "Custom model..." from dropdown */}
            {meta.allowCustomModel && isPresetModel && (
              <p className="settings-description" style={{ marginTop: 4 }}>
                Select "Custom model..." to enter a model name manually.
              </p>
            )}
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
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
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
