import React, { useState, useEffect } from 'react';
import '../styles/Onboarding.css';

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

type Step = 'welcome' | 'apiKey' | 'vault' | 'ready';
const STEPS: Step[] = ['welcome', 'apiKey', 'vault', 'ready'];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const isDark = useIsDark();
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [initializing, setInitializing] = useState(false);

  const currentIndex = STEPS.indexOf(step);

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return;

    setValidating(true);
    setFeedback(null);

    try {
      const valid = await window.nudge.api.validateKey(apiKey.trim());
      if (valid) {
        await window.nudge.settings.setApiKey(apiKey.trim());
        setFeedback({ type: 'success', message: 'Key validated successfully.' });
        setTimeout(() => setStep('vault'), 800);
      } else {
        setFeedback({ type: 'error', message: 'Invalid API key. Please check and try again.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Could not validate. Check your connection.' });
    } finally {
      setValidating(false);
    }
  };

  const handleVaultSetup = async () => {
    setInitializing(true);
    try {
      // Use the default vault path from settings (set by main process)
      const currentPath = await window.nudge.vault.getPath();
      await window.nudge.vault.initialize(currentPath);
      setStep('ready');
    } catch {
      // Vault may already exist, proceed anyway
      setStep('ready');
    } finally {
      setInitializing(false);
    }
  };

  const handleComplete = async () => {
    await window.nudge.settings.set('onboardingComplete', true);
    onComplete();
  };

  const renderDots = () => (
    <div className="onboarding-progress">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`onboarding-dot ${i === currentIndex ? 'onboarding-dot--active' : ''} ${i < currentIndex ? 'onboarding-dot--done' : ''}`}
        />
      ))}
    </div>
  );

  return (
    <div className="onboarding">
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
            <button className="onboarding-btn onboarding-btn--primary" onClick={() => setStep('apiKey')}>
              Get Started
            </button>
            {renderDots()}
          </div>
        )}

        {step === 'apiKey' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">Connect to Claude</h1>
            <p className="onboarding-text">
              Nudge uses the Anthropic API to power its conversational AI. You will need your own API key.
            </p>
            <a
              className="onboarding-link"
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get your API key at console.anthropic.com
            </a>
            <div className="onboarding-input-group">
              <label className="onboarding-input-label">API Key</label>
              <div className="onboarding-input-row">
                <input
                  className="onboarding-input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setFeedback(null); }}
                  placeholder="sk-ant-..."
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
            <button
              className="onboarding-btn onboarding-btn--primary"
              onClick={handleValidateKey}
              disabled={validating || !apiKey.trim()}
            >
              {validating ? 'Validating...' : 'Validate & Continue'}
            </button>
            {renderDots()}
          </div>
        )}

        {step === 'vault' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">Choose your vault location</h1>
            <p className="onboarding-text">
              Your vault is where Nudge stores your ideas, daily logs, and tasks. Everything stays on your machine.
            </p>
            <div className="onboarding-vault-path">~/Nudge/</div>
            <button
              className="onboarding-btn onboarding-btn--primary"
              onClick={handleVaultSetup}
              disabled={initializing}
            >
              {initializing ? 'Setting up...' : 'Use Default'}
            </button>
            {renderDots()}
          </div>
        )}

        {step === 'ready' && (
          <div className="onboarding-step">
            <h1 className="onboarding-heading">You're all set!</h1>
            <p className="onboarding-text">
              Nudge is ready. Start a conversation whenever you're ready.
            </p>
            <button className="onboarding-btn onboarding-btn--primary" onClick={handleComplete}>
              Start Chatting
            </button>
            {renderDots()}
          </div>
        )}
      </div>
    </div>
  );
}
