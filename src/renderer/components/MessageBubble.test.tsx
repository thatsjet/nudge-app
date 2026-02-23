// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from './MessageBubble';
import { ChatMessage } from '../../shared/types';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: '1',
  role: 'user',
  content: 'Test message',
  timestamp: Date.now(),
  ...overrides,
});

describe('MessageBubble', () => {
  it('renders message content', () => {
    render(<MessageBubble message={makeMessage({ content: 'Hello world' })} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('applies user class for user messages', () => {
    const { container } = render(<MessageBubble message={makeMessage({ role: 'user' })} />);
    expect(container.querySelector('.message-bubble--user')).toBeInTheDocument();
  });

  it('applies assistant class for assistant messages', () => {
    const { container } = render(<MessageBubble message={makeMessage({ role: 'assistant' })} />);
    expect(container.querySelector('.message-bubble--assistant')).toBeInTheDocument();
  });

  it('displays formatted timestamp', () => {
    const timestamp = new Date('2026-02-22T14:30:00').getTime();
    render(<MessageBubble message={makeMessage({ timestamp })} />);
    expect(screen.getByText(/2:30/)).toBeInTheDocument();
  });

  it('renders markdown content', () => {
    render(<MessageBubble message={makeMessage({ content: '**bold text**' })} />);
    const strong = screen.getByText('bold text');
    expect(strong.tagName).toBe('STRONG');
  });
});
