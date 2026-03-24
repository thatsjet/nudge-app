import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage, Session } from '../shared/types';
import ChatPanel from './components/ChatPanel';
import FileEditor from './components/FileEditor';
import Settings from './components/Settings';
import Onboarding from './components/Onboarding';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import './styles/App.css';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>('system');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const streamingContentRef = useRef('');

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
        await resumeOrStartSession();
      }
    }
    init();
  }, []);

  // Listen for theme changes from settings
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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

  // Listen for "Check for Updates..." menu item
  useEffect(() => {
    const cleanup = window.nudge.app.onCheckForUpdates(() => {
      setSettingsOpen(true);
    });
    return cleanup;
  }, []);

  // Listen for nudge events
  useEffect(() => {
    const cleanupFired = window.nudge.nudges.onFired(() => {
      // Refresh session list so the new nudge session appears
      setSessionRefreshKey(k => k + 1);
    });

    const cleanupNavigate = window.nudge.nudges.onNavigate(async (data) => {
      // Navigate to the nudge session when notification is clicked
      const session = await window.nudge.sessions.get(data.sessionId);
      if (session) {
        if (cancelStreamRef.current) {
          cancelStreamRef.current();
        }
        setCurrentSessionId(session.id);
        setMessages(session.messages);
        setSessionTitle(session.title);
        setStreamingContent('');
        streamingContentRef.current = '';
        setIsStreaming(false);
        setEditingFile(null);
        setSessionRefreshKey(k => k + 1);
      }
    });

    return () => {
      cleanupFired();
      cleanupNavigate();
    };
  }, []);

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
    setSessionTitle('');
    setMessages([]);
    setStreamingContent('');
    streamingContentRef.current = '';
    setIsStreaming(false);
    setSessionRefreshKey(k => k + 1);
  }

  async function resumeOrStartSession() {
    const sessions = await window.nudge.sessions.list();
    if (sessions.length > 0) {
      // Sessions are sorted by updatedAt desc — resume the most recent one
      const latest = sessions[0];
      const full = await window.nudge.sessions.get(latest.id);
      if (full) {
        setCurrentSessionId(full.id);
        setMessages(full.messages);
        setSessionTitle(full.title);
        setStreamingContent('');
        streamingContentRef.current = '';
        setIsStreaming(false);
        setSessionRefreshKey(k => k + 1);
        return;
      }
    }
    await startNewSession();
  }

  async function handleSelectSession(session: Session) {
    if (session.id === currentSessionId) return;
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
    }
    const full = await window.nudge.sessions.get(session.id);
    if (full) {
      setCurrentSessionId(full.id);
      setMessages(full.messages);
      setStreamingContent('');
      streamingContentRef.current = '';
      setIsStreaming(false);
      setEditingFile(null);
    }
  }

  async function buildSystemPrompt(): Promise<string> {
    const vaultPath = await window.nudge.vault.getPath();
    let systemPrompt = '';
    let config = '';

    try {
      systemPrompt = await window.nudge.app.getSystemPrompt();
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
    streamingContentRef.current = '';

    // Save user message to session
    if (currentSessionId) {
      await window.nudge.sessions.addMessage(currentSessionId, userMessage);
      // Update title on first user message (backend sets title to first 50 chars)
      if (messages.length === 0) {
        setSessionTitle(content.trim().slice(0, 50));
      }
    }

    try {
      const systemPrompt = await buildSystemPrompt();
      const activeProvider = (await window.nudge.settings.get('activeProvider')) || 'anthropic';
      const model = (await window.nudge.settings.get(`model-${activeProvider}`))
        || (activeProvider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o');

      const cancel = await window.nudge.api.sendMessage(
        updatedMessages,
        systemPrompt,
        activeProvider,
        model,
        // onChunk
        (chunk: string) => {
          setStreamingContent(prev => {
            const next = prev + chunk;
            streamingContentRef.current = next;
            return next;
          });
        },
        // onDone
        () => {
          const finalContent = streamingContentRef.current;
          if (finalContent.trim()) {
            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: finalContent,
              timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Save assistant message to session
            if (currentSessionId) {
              window.nudge.sessions.addMessage(currentSessionId, assistantMessage);
            }
          }
          streamingContentRef.current = '';
          setStreamingContent('');
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
          streamingContentRef.current = '';
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
      streamingContentRef.current = '';
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
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <Header
        onToggleExplorer={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewChat={handleNewChat}
        explorerOpen={sidebarOpen}
        hasUpdate={hasUpdate}
        sessionTitle={sessionTitle}
      />

      <div className="app-body">
        {sidebarOpen && (
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onFileSelect={(path) => setEditingFile(path)}
            editingFile={editingFile}
            sessionRefreshKey={sessionRefreshKey}
          />
        )}

        <main id="main-content" className={`app-main ${editingFile ? 'app-main--split' : ''}`}>
          <div className="app-chat-container">
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              onSendMessage={handleSendMessage}
            />
          </div>
          {editingFile && (
            <div className="app-editor-pane">
              <FileEditor
                filePath={editingFile}
                onClose={() => setEditingFile(null)}
              />
            </div>
          )}
        </main>
      </div>

      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
