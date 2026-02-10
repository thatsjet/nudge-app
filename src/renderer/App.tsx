import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage } from '../shared/types';
import ChatPanel from './components/ChatPanel';
import FileExplorer from './components/FileExplorer';
import FileEditor from './components/FileEditor';
import Settings from './components/Settings';
import Onboarding from './components/Onboarding';
import Header from './components/Header';
import './styles/App.css';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>('system');
  const cancelStreamRef = useRef<(() => void) | null>(null);

  // Load initial state
  useEffect(() => {
    async function init() {
      const complete = await window.nudge.settings.get('onboardingComplete');
      setOnboardingComplete(complete === true);

      const savedTheme = await window.nudge.settings.get('theme');
      if (savedTheme) {
        setTheme(savedTheme);
        applyTheme(savedTheme);
      }

      if (complete) {
        await startNewSession();
      }
    }
    init();
  }, []);

  // Listen for theme changes from settings
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function applyTheme(t: string) {
    if (t === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
  }

  async function startNewSession() {
    const session = await window.nudge.sessions.create();
    setCurrentSessionId(session.id);
    setMessages([]);
    setStreamingContent('');
    setIsStreaming(false);
  }

  async function buildSystemPrompt(): Promise<string> {
    const vaultPath = await window.nudge.vault.getPath();
    let systemPrompt = '';
    let config = '';

    try {
      systemPrompt = await window.nudge.vault.readFile('system-prompt.md');
    } catch {
      systemPrompt = 'You are Nudge, a warm and encouraging productivity companion.';
    }

    try {
      config = await window.nudge.vault.readFile('config.md');
    } catch {}

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return `${systemPrompt}\n\n---\n\n## User Config\n\n${config}\n\n---\n\n## Current Date & Time\n\n${dateStr} at ${timeStr}\n\nVault location: ${vaultPath}`;
  }

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);
    setStreamingContent('');

    // Save user message to session
    if (currentSessionId) {
      await window.nudge.sessions.addMessage(currentSessionId, userMessage);
    }

    try {
      const systemPrompt = await buildSystemPrompt();
      const model = (await window.nudge.settings.get('model')) || 'claude-sonnet-4-20250514';

      const cancel = await window.nudge.api.sendMessage(
        updatedMessages,
        systemPrompt,
        model,
        // onChunk
        (chunk: string) => {
          setStreamingContent(prev => prev + chunk);
        },
        // onDone
        () => {
          setStreamingContent(current => {
            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: current,
              timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Save assistant message to session
            if (currentSessionId) {
              window.nudge.sessions.addMessage(currentSessionId, assistantMessage);
            }
            return '';
          });
          setIsStreaming(false);
          cancelStreamRef.current = null;
        },
        // onError
        (error: string) => {
          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: getErrorMessage(error),
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, errorMessage]);
          setStreamingContent('');
          setIsStreaming(false);
          cancelStreamRef.current = null;
        }
      );

      cancelStreamRef.current = cancel;
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: getErrorMessage(error?.message || 'Something went wrong'),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setStreamingContent('');
      setIsStreaming(false);
    }
  }, [messages, isStreaming, currentSessionId]);

  function getErrorMessage(error: string): string {
    if (error.includes('API key') || error.includes('401') || error.includes('authentication')) {
      return "Hmm, there's an issue with your API key. Check your settings to make sure it's correct.";
    }
    if (error.includes('rate') || error.includes('429')) {
      return "Nudge is taking a breather. Try again in a moment.";
    }
    if (error.includes('network') || error.includes('ENOTFOUND') || error.includes('fetch')) {
      return "Looks like you're offline. Your vault files are still here — check back when you're connected.";
    }
    return `Something went wrong: ${error}`;
  }

  async function handleOnboardingComplete() {
    setOnboardingComplete(true);
    await startNewSession();
  }

  function handleNewChat() {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
    }
    startNewSession();
  }

  // Loading state
  if (onboardingComplete === null) {
    return (
      <div className="app-loading">
        <div className="app-loading-text">Nudge</div>
      </div>
    );
  }

  // Onboarding
  if (!onboardingComplete) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="app">
      <Header
        onToggleExplorer={() => setExplorerOpen(!explorerOpen)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewChat={handleNewChat}
        explorerOpen={explorerOpen}
      />

      <div className="app-body">
        {explorerOpen && (
          <FileExplorer
            isOpen={explorerOpen}
            onClose={() => setExplorerOpen(false)}
            onFileSelect={(path) => setEditingFile(path)}
          />
        )}

        <div className="app-main">
          {editingFile ? (
            <FileEditor
              filePath={editingFile}
              onClose={() => setEditingFile(null)}
            />
          ) : (
            <div className="app-chat-container">
              <ChatPanel
                messages={messages}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                onSendMessage={handleSendMessage}
              />
            </div>
          )}
        </div>
      </div>

      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
