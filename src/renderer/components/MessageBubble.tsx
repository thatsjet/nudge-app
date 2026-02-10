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
      <span className="message-bubble-timestamp">{timeStr}</span>
    </div>
  );
}
