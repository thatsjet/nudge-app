import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../../shared/types';
import '../styles/MessageBubble.css';

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={`message-bubble ${isUser ? 'message-bubble--user' : 'message-bubble--assistant'}`}>
      {isUser && (
        <div className="message-bubble-row">
          <div className="message-bubble-content markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                input: ({ node, ...props }) => (
                  <input {...props} />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          <div className="message-bubble-avatar">U</div>
        </div>
      )}
      {!isUser && (
        <div className="message-bubble-content markdown-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              input: ({ node, ...props }) => (
                <input {...props} />
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      )}
      <span className="message-bubble-timestamp">{timeStr}</span>
    </div>
  );
}
