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

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  onSendMessage: (content: string) => void;
}

const SUGGESTION_CHIPS = [
  'Start my day',
  'I have an idea',
  'I have 30 minutes',
  'Add a task',
];

export default function ChatPanel({
  messages,
  isStreaming,
  streamingContent,
  onSendMessage,
}: ChatPanelProps) {
  const isDark = useIsDark();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="chat-panel">
      <div className="chat-panel-messages">
        {isEmpty ? (
          <div className="chat-panel-empty">
            <div className="chat-panel-empty-logo">
              <img src='./icon_sm.png' alt="Nudge" width="56" height="56" />
            </div>
            <h2 className="chat-panel-empty-title">What would you like to work on?</h2>
            <div className="chat-panel-empty-chips">
              {SUGGESTION_CHIPS.map((chip) => (
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
              <div className="chat-panel-typing">
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
