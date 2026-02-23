// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from './ChatInput';

describe('ChatInput', () => {
  it('renders textarea with placeholder', () => {
    render(<ChatInput onSend={vi.fn()} disabled={false} />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('disables textarea when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled={true} />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
  });

  it('calls onSend with trimmed value on Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'hello world{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello world');
  });

  it('does not send on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables send button when input is empty', () => {
    render(<ChatInput onSend={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'hello{Enter}');
    expect(textarea).toHaveValue('');
  });
});
