import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../../shared/types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import '../styles/ChatPanel.css';

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

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getGreeting(timeOfDay: TimeOfDay, userName: string | null): string {
  const name = userName ? `, ${userName}` : '';
  switch (timeOfDay) {
    case 'morning': return `Good morning${name}`;
    case 'afternoon': return `Good afternoon${name}`;
    case 'evening': return `Winding down for the evening?`;
  }
}

const CHIPS_BY_TIME: Record<TimeOfDay, string[]> = {
  morning: [
    'Review today\u2019s tasks',
    'Plan my focus blocks',
    'I have an idea',
    'Start my day',
  ],
  afternoon: [
    'I have 30 minutes',
    'What should I tackle next?',
    'I have an idea',
    'Add a task',
  ],
  evening: [
    'Capture what I got done',
    'Brain dump before tomorrow',
    'Add a task',
    'I have an idea',
  ],
};

function parseConfigField(config: string, field: string): string | null {
  const regex = new RegExp(`## ${field}\\s*\\n\\s*([\\s\\S]*?)(?=\\n##|$)`);
  const match = config.match(regex);
  if (!match) return null;
  return match[1].trim() || null;
}

function extractName(aboutMe: string): string | null {
  // Try common patterns like "I'm Jeremy", "My name is Jeremy", "I am Jeremy"
  const patterns = [
    /(?:I'm|I am|my name is|name's)\s+([A-Z][a-z]+)/i,
    /^([A-Z][a-z]+)\s+here/i,
  ];
  for (const pattern of patterns) {
    const match = aboutMe.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractMantra(mantraSection: string): string | null {
  // Mantra is stored as **"mantra text"**
  const match = mantraSection.match(/\*\*"(.+?)"\*\*/);
  if (match) return match[1];
  return mantraSection;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  onSendMessage: (content: string) => void;
}

export default function ChatPanel({
  messages,
  isStreaming,
  streamingContent,
  onSendMessage,
}: ChatPanelProps) {
  const isDark = useIsDark();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [mantra, setMantra] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay);

  // Load user config from vault
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await window.nudge.vault.readFile('config.md');
        const aboutMe = parseConfigField(config, 'About Me');
        if (aboutMe) setUserName(extractName(aboutMe));
        const mantraSection = parseConfigField(config, 'Mantra');
        if (mantraSection) setMantra(extractMantra(mantraSection));
      } catch {}
    }
    loadConfig();
  }, []);

  // Update time of day every minute
  useEffect(() => {
    const interval = setInterval(() => setTimeOfDay(getTimeOfDay()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const isEmpty = messages.length === 0 && !isStreaming;
  const chips = CHIPS_BY_TIME[timeOfDay];

  return (
    <div className="chat-panel">
      <div className="chat-panel-messages">
        {isEmpty ? (
          <div className="chat-panel-empty">
            <div className="chat-panel-empty-logo">
              <img src='./icon_sm.png' alt="Nudge" width="56" height="56" />
            </div>
            <h2 className="chat-panel-empty-title">{getGreeting(timeOfDay, userName)}</h2>
            {mantra && (
              <p className="chat-panel-empty-mantra">{mantra}</p>
            )}
            <div className="chat-panel-empty-chips">
              {chips.map((chip) => (
                <button
                  key={chip}
                  className="chat-panel-chip"
                  onClick={() => onSendMessage(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isStreaming && streamingContent && (
              <div className="message-bubble message-bubble--assistant">
                <div className="message-bubble-content markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingContent}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {isStreaming && !streamingContent && (
              <div className="chat-panel-typing" role="status" aria-live="polite" aria-label="Nudge is typing">
                <span className="chat-panel-typing-dot" />
                <span className="chat-panel-typing-dot" />
                <span className="chat-panel-typing-dot" />
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput onSend={onSendMessage} disabled={isStreaming} />
    </div>
  );
}
