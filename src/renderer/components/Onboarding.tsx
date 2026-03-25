import React, { useState, useEffect } from 'react';
import '../styles/Onboarding.css';
import type { ProviderId } from '../../shared/types';

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => {
    const explicit = document.documentElement.getAttribute('data-theme');
    if (explicit) return explicit === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const observer = new MutationObserver(() => {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit) { setIsDark(explicit === 'dark'); return; }
      setIsDark(mq.matches);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const handler = (e: MediaQueryListEvent) => {
      if (!document.documentElement.getAttribute('data-theme')) setIsDark(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => { observer.disconnect(); mq.removeEventListener('change', handler); };
  }, []);

  return isDark;
}

interface OnboardingProps {
  onComplete: () => void;
}

type Step =
  | 'welcome'
  | 'provider'
  | 'apiKey'
  | 'aboutYou'
  | 'focus'
  | 'mantra';

const STEPS: Step[] = [
  'welcome',
  'provider',
  'apiKey',
  'aboutYou',
  'focus',
  'mantra',
];

const PROVIDER_OPTIONS: { id: ProviderId; name: string; description: string }[] = [
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models (Sonnet, Opus, Haiku)' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o, GPT-4.1, GPT-5.2, and more' },
  { id: 'custom', name: 'Custom Server', description: 'Any OpenAI-compatible endpoint' },
];

const PROVIDER_KEY_INFO: Record<ProviderId, { placeholder: string; linkText: string; linkUrl: string }> = {
  anthropic: { placeholder: 'sk-ant-...', linkText: 'Get your key at console.anthropic.com', linkUrl: 'https://console.anthropic.com' },
  openai: { placeholder: 'sk-...', linkText: 'Get your key at platform.openai.com', linkUrl: 'https://platform.openai.com/api-keys' },
  custom: { placeholder: 'your-api-key', linkText: '', linkUrl: '' },
};

const PROVIDER_MODELS: Record<ProviderId, { value: string; label: string }[]> = {
  anthropic: [
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'claude-sonnet-4-0', label: 'Claude Sonnet 4' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  ],
  custom: [],
};

const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
  custom: 'gpt-4o',
};

// Energy level options
const ENERGY_OPTIONS = ['High', 'Medium', 'Low', 'Varies'];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const isDark = useIsDark();
  const [step, setStep] = useState<Step>('welcome');

  // Provider & API key state
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('anthropic');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('gpt-4o');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Profile wizard state
  const [aboutMe, setAboutMe] = useState('');
  const [energyMorning, setEnergyMorning] = useState('');
  const [energyAfternoon, setEnergyAfternoon] = useState('');
  const [energyEvening, setEnergyEvening] = useState('');
  const [helpWhenStuck, setHelpWhenStuck] = useState('');
  const [suggestionStyle, setSuggestionStyle] = useState('');
  const [focusAreas, setFocusAreas] = useState('');
  const [mantra, setMantra] = useState('Starting is success, completion is optional.');

  // Collapsible sections for "About You" step
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    about: true,
    energy: false,
    preferences: false,
  });

  // Toast state
  const [showToast, setShowToast] = useState(false);

  const currentIndex = STEPS.indexOf(step);

  function goNext() {
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  }

  function goBack() {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex]);
    }
  }

  function toggleSection(section: string) {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return;

    setValidating(true);
    setFeedback(null);

    try {
      const baseUrl = selectedProvider === 'custom' ? customBaseUrl.trim() || undefined : undefined;
      const model = selectedProvider === 'custom' ? customModel.trim() : selectedModel;
      const valid = await window.nudge.api.validateKey(selectedProvider, apiKey.trim(), baseUrl, model);
      if (valid) {
        await window.nudge.settings.setApiKey(selectedProvider, apiKey.trim());
        await window.nudge.settings.set('activeProvider', selectedProvider);
        await window.nudge.settings.set(`model-${selectedProvider}`, model);
        if (baseUrl) {
          await window.nudge.settings.setProviderBaseUrl(selectedProvider, baseUrl);
        }
        setFeedback({ type: 'success', message: 'Key validated successfully.' });
        // Auto-initialize vault with default path, then advance
        try {
          const currentPath = await window.nudge.vault.getPath();
          await window.nudge.vault.initialize(currentPath);
        } catch {
          // Non-blocking — vault setup is best-effort
        }
        setTimeout(() => setStep('aboutYou'), 800);
      } else {
        setFeedback({ type: 'error', message: 'Invalid API key. Please check and try again.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Could not validate. Check your connection.' });
    } finally {
      setValidating(false);
    }
  };

  function buildConfigMd(): string {
    const aboutSection = aboutMe.trim() || 'Tell Nudge about yourself — what you do, how you work, what helps you focus.';
    const mantraSection = mantra.trim() || 'Starting is success, completion is optional.';
    const morning = energyMorning || '';
    const afternoon = energyAfternoon || '';
    const evening = energyEvening || '';
    const stuck = helpWhenStuck.trim() || '';
    const style = suggestionStyle.trim() || '';
    const focus = focusAreas.trim() || 'What\'s top of mind right now';

    return `# Config

## About Me

${aboutSection}

## Mantra

**"${mantraSection}"**

## Energy Patterns

- Morning: ${morning}
- Afternoon: ${afternoon}
- Evening: ${evening}

## Preferences

- What helps when you're stuck: ${stuck}
- Preferred suggestion style: ${style}

## Current Focus Areas

- ${focus}
`;
  }

  const handleComplete = async () => {
    // Write profile to config.md
    try {
      const configContent = buildConfigMd();
      await window.nudge.vault.writeFile('config.md', configContent);
    } catch {
      // Non-blocking — vault may not be ready
    }
    await window.nudge.settings.set('onboardingComplete', true);

    // Show toast then transition
    setShowToast(true);
    setTimeout(() => {
      onComplete();
    }, 1500);
  };

  const renderStepIndicator = () => (
    <div className="onboarding-step-indicator">
      Step {currentIndex + 1} of {STEPS.length}
    </div>
  );

  // Reusable navigation bar for profile wizard steps
  const renderWizardNav = (opts?: { nextLabel?: string; onNext?: () => void; nextDisabled?: boolean; hideSkip?: boolean }) => (
    <div className="onboarding-wizard-nav">
      <button className="onboarding-nav-btn onboarding-nav-btn--back" onClick={goBack}>
        <span className="onboarding-nav-arrow">&larr;</span> Back
      </button>
      <div className="onboarding-wizard-nav-right">
        {!opts?.hideSkip && (
          <button className="onboarding-nav-btn onboarding-nav-btn--skip" onClick={goNext}>
            Skip
          </button>
        )}
        <button
          className="onboarding-btn onboarding-btn--primary onboarding-btn--nav"
          onClick={opts?.onNext || goNext}
          disabled={opts?.nextDisabled}
        >
          {opts?.nextLabel || 'Next'} <span className="onboarding-nav-arrow">&rarr;</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="onboarding">
      {showToast && (
        <div className="onboarding-toast">
          You're all set! Nudge is ready.
        </div>
      )}
      <div className="onboarding-card">
        {step === 'welcome' && (
          <div className="onboarding-step">
            <img src='./nudge_logo_cropped.png' alt="Nudge" className="onboarding-logo" />
            <h1 className="onboarding-heading">Welcome to Nudge</h1>
            <p className="onboarding-text">
              A gentle productivity companion for ADHD brains.
            </p>
            <p className="onboarding-mantra">
              "Starting is success, completion is optional."
            </p>
            <button className="onboarding-btn onboarding-btn--primary" onClick={() => setStep('provider')}>
              Get Started
            </button>
            {renderStepIndicator()}
          </div>
        )}

        {step === 'provider' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">Choose your AI provider</h1>
            <p className="onboarding-text">
              Nudge works with multiple AI providers. Pick the one you'd like to use.
            </p>
            <div className="onboarding-provider-cards">
              {PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`onboarding-provider-card ${selectedProvider === opt.id ? 'onboarding-provider-card--active' : ''}`}
                  onClick={() => { setSelectedProvider(opt.id); setSelectedModel(DEFAULT_MODELS[opt.id]); }}
                >
                  <span className="onboarding-provider-name">{opt.name}</span>
                  <span className="onboarding-provider-desc">{opt.description}</span>
                </button>
              ))}
            </div>
            <div className="onboarding-wizard-nav">
              <button className="onboarding-nav-btn onboarding-nav-btn--back" onClick={goBack}>
                <span className="onboarding-nav-arrow">&larr;</span> Back
              </button>
              <button
                className="onboarding-btn onboarding-btn--primary onboarding-btn--nav"
                onClick={() => setStep('apiKey')}
              >
                Continue <span className="onboarding-nav-arrow">&rarr;</span>
              </button>
            </div>
            {renderStepIndicator()}
          </div>
        )}

        {step === 'apiKey' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">Connect to {PROVIDER_OPTIONS.find((p) => p.id === selectedProvider)?.name}</h1>
            <p className="onboarding-text">
              Enter your API key to get started. Your vault will be set up automatically at ~/Nudge/ (you can change it later in Settings).
            </p>
            {PROVIDER_KEY_INFO[selectedProvider].linkUrl && (
              <a
                className="onboarding-link"
                href={PROVIDER_KEY_INFO[selectedProvider].linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {PROVIDER_KEY_INFO[selectedProvider].linkText}
              </a>
            )}
            {selectedProvider !== 'custom' && PROVIDER_MODELS[selectedProvider].length > 0 && (
              <div className="onboarding-input-group">
                <label className="onboarding-input-label">Model</label>
                <div className="onboarding-model-cards">
                  {PROVIDER_MODELS[selectedProvider].map((m) => (
                    <button
                      key={m.value}
                      className={`onboarding-model-card ${selectedModel === m.value ? 'onboarding-model-card--active' : ''}`}
                      onClick={() => { setSelectedModel(m.value); setFeedback(null); }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedProvider === 'custom' && (
              <>
                <div className="onboarding-input-group">
                  <label className="onboarding-input-label">Base URL</label>
                  <input
                    className="onboarding-input"
                    type="text"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="https://your-server.com/v1"
                  />
                </div>
                <div className="onboarding-input-group">
                  <label className="onboarding-input-label">Model</label>
                  <input
                    className="onboarding-input"
                    type="text"
                    value={customModel}
                    onChange={(e) => { setCustomModel(e.target.value); setFeedback(null); }}
                    placeholder="gpt-4o"
                  />
                </div>
              </>
            )}
            <div className="onboarding-input-group">
              <label className="onboarding-input-label">API Key</label>
              <div className="onboarding-input-row">
                <input
                  className="onboarding-input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setFeedback(null); }}
                  placeholder={PROVIDER_KEY_INFO[selectedProvider].placeholder}
                />
                <button className="onboarding-toggle-btn" onClick={() => setShowKey(!showKey)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {feedback && (
              <div className={`onboarding-feedback onboarding-feedback--${feedback.type}`}>
                {feedback.message}
              </div>
            )}
            <div className="onboarding-wizard-nav">
              <button className="onboarding-nav-btn onboarding-nav-btn--back" onClick={goBack}>
                <span className="onboarding-nav-arrow">&larr;</span> Back
              </button>
              <button
                className="onboarding-btn onboarding-btn--primary onboarding-btn--nav"
                onClick={handleValidateKey}
                disabled={validating || !apiKey.trim() || (selectedProvider === 'custom' && !customModel.trim())}
              >
                {validating ? 'Validating...' : 'Validate & Continue'} <span className="onboarding-nav-arrow">&rarr;</span>
              </button>
            </div>
            {renderStepIndicator()}
          </div>
        )}

        {/* --- About You: merged aboutMe + energy + preferences with collapsible sections --- */}

        {step === 'aboutYou' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">About You</h1>
            <p className="onboarding-text">
              Help Nudge understand how you work. Expand any section to fill in details.
            </p>

            <div className="onboarding-collapsible-sections">
              {/* About Me section */}
              <div className="onboarding-collapsible">
                <button className="onboarding-collapsible-header" onClick={() => toggleSection('about')}>
                  <span className="onboarding-collapsible-title">About Me</span>
                  <span className={`onboarding-collapsible-arrow ${expandedSections.about ? 'onboarding-collapsible-arrow--open' : ''}`}>&#9662;</span>
                </button>
                {expandedSections.about && (
                  <div className="onboarding-collapsible-body">
                    <textarea
                      className="onboarding-textarea"
                      value={aboutMe}
                      onChange={(e) => setAboutMe(e.target.value)}
                      placeholder="e.g. I'm a software developer who works best in short focused bursts. I like to have a clear list of what to do next."
                      rows={3}
                    />
                  </div>
                )}
              </div>

              {/* Energy Patterns section */}
              <div className="onboarding-collapsible">
                <button className="onboarding-collapsible-header" onClick={() => toggleSection('energy')}>
                  <span className="onboarding-collapsible-title">Energy Patterns</span>
                  <span className={`onboarding-collapsible-arrow ${expandedSections.energy ? 'onboarding-collapsible-arrow--open' : ''}`}>&#9662;</span>
                </button>
                {expandedSections.energy && (
                  <div className="onboarding-collapsible-body">
                    <div className="onboarding-energy-grid">
                      {([
                        { label: 'Morning', value: energyMorning, setter: setEnergyMorning },
                        { label: 'Afternoon', value: energyAfternoon, setter: setEnergyAfternoon },
                        { label: 'Evening', value: energyEvening, setter: setEnergyEvening },
                      ] as const).map(({ label, value, setter }) => (
                        <div key={label} className="onboarding-energy-row">
                          <span className="onboarding-energy-label">{label}</span>
                          <div className="onboarding-energy-options">
                            {ENERGY_OPTIONS.map((opt) => (
                              <button
                                key={opt}
                                className={`onboarding-energy-btn ${value === opt ? 'onboarding-energy-btn--active' : ''}`}
                                onClick={() => setter(opt)}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preferences section */}
              <div className="onboarding-collapsible">
                <button className="onboarding-collapsible-header" onClick={() => toggleSection('preferences')}>
                  <span className="onboarding-collapsible-title">Preferences</span>
                  <span className={`onboarding-collapsible-arrow ${expandedSections.preferences ? 'onboarding-collapsible-arrow--open' : ''}`}>&#9662;</span>
                </button>
                {expandedSections.preferences && (
                  <div className="onboarding-collapsible-body">
                    <div className="onboarding-input-group">
                      <label className="onboarding-input-label">What helps when you're stuck?</label>
                      <input
                        className="onboarding-input"
                        type="text"
                        value={helpWhenStuck}
                        onChange={(e) => setHelpWhenStuck(e.target.value)}
                        placeholder="e.g. Breaking things into tiny steps, body doubling, changing scenery"
                      />
                    </div>
                    <div className="onboarding-input-group" style={{ marginTop: 12 }}>
                      <label className="onboarding-input-label">Preferred suggestion style</label>
                      <input
                        className="onboarding-input"
                        type="text"
                        value={suggestionStyle}
                        onChange={(e) => setSuggestionStyle(e.target.value)}
                        placeholder="e.g. Gentle nudges, direct to-do lists, playful encouragement"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {renderWizardNav()}
            {renderStepIndicator()}
          </div>
        )}

        {step === 'focus' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">What's on your plate?</h1>
            <p className="onboarding-text">
              What are your current focus areas? Nudge will keep these in mind during your chats.
            </p>
            <div className="onboarding-input-group">
              <textarea
                className="onboarding-textarea"
                value={focusAreas}
                onChange={(e) => setFocusAreas(e.target.value)}
                placeholder="e.g. Finishing the Q1 report, learning Rust, exercising 3x a week"
                rows={3}
              />
            </div>
            {renderWizardNav()}
            {renderStepIndicator()}
          </div>
        )}

        {step === 'mantra' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">Pick your mantra</h1>
            <p className="onboarding-text">
              A short phrase Nudge can remind you of when things feel hard. Use ours or write your own.
            </p>
            <div className="onboarding-input-group">
              <input
                className="onboarding-input onboarding-input--mantra"
                type="text"
                value={mantra}
                onChange={(e) => setMantra(e.target.value)}
                placeholder="Starting is success, completion is optional."
              />
            </div>
            {renderWizardNav({ nextLabel: 'Finish', onNext: handleComplete, hideSkip: true })}
            {renderStepIndicator()}
          </div>
        )}
      </div>
    </div>
  );
}
