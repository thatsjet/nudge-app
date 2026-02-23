// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from './ChatPanel';
import { ChatMessage } from '../../shared/types';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: '1',
  role: 'user',
  content: 'Hello',
  timestamp: Date.now(),
  ...overrides,
});

describe('ChatPanel', () => {
  const defaultProps = {
    messages: [] as ChatMessage[],
    isStreaming: false,
    streamingContent: '',
    onSendMessage: vi.fn(),
  };

  it('shows empty state with suggestion chips when no messages', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByText('What would you like to work on?')).toBeInTheDocument();
    expect(screen.getByText('Start my day')).toBeInTheDocument();
    expect(screen.getByText('I have an idea')).toBeInTheDocument();
  });

  it('sends suggestion chip text on click', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
    await user.click(screen.getByText('Start my day'));
    expect(onSendMessage).toHaveBeenCalledWith('Start my day');
  });

  it('renders messages when provided', () => {
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'Hi there' }),
      makeMessage({ id: '2', role: 'assistant', content: 'Hello!' }),
    ];
    render(<ChatPanel {...defaultProps} messages={messages} />);
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('shows typing indicator when streaming with no content', () => {
    const { container } = render(
      <ChatPanel {...defaultProps} messages={[makeMessage()]} isStreaming={true} streamingContent="" />
    );
    expect(container.querySelector('.chat-panel-typing')).toBeInTheDocument();
  });

  it('shows streaming content when available', () => {
    render(
      <ChatPanel {...defaultProps} messages={[makeMessage()]} isStreaming={true} streamingContent="Thinking about..." />
    );
    expect(screen.getByText('Thinking about...')).toBeInTheDocument();
  });

  it('disables input while streaming', () => {
    render(<ChatPanel {...defaultProps} messages={[makeMessage()]} isStreaming={true} streamingContent="" />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
  });
});
