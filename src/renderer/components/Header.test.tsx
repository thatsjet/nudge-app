// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from './Header';

describe('Header', () => {
  const defaultProps = {
    onToggleExplorer: vi.fn(),
    onOpenSettings: vi.fn(),
    onNewChat: vi.fn(),
    explorerOpen: false,
  };

  it('renders the app title', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('Nudge')).toBeInTheDocument();
  });

  it('calls onNewChat when + button clicked', async () => {
    const onNewChat = vi.fn();
    render(<Header {...defaultProps} onNewChat={onNewChat} />);
    await userEvent.click(screen.getByTitle('New chat'));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('calls onOpenSettings when settings button clicked', async () => {
    const onOpenSettings = vi.fn();
    render(<Header {...defaultProps} onOpenSettings={onOpenSettings} />);
    await userEvent.click(screen.getByTitle('Settings'));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('calls onToggleExplorer when files button clicked', async () => {
    const onToggleExplorer = vi.fn();
    render(<Header {...defaultProps} onToggleExplorer={onToggleExplorer} />);
    await userEvent.click(screen.getByTitle('Toggle file explorer'));
    expect(onToggleExplorer).toHaveBeenCalledOnce();
  });

  it('shows active class when explorer is open', () => {
    render(<Header {...defaultProps} explorerOpen={true} />);
    const btn = screen.getByTitle('Toggle file explorer');
    expect(btn.className).toContain('header-btn--active');
  });

  it('shows update dot when hasUpdate is true', () => {
    const { container } = render(<Header {...defaultProps} hasUpdate={true} />);
    expect(container.querySelector('.header-update-dot')).toBeInTheDocument();
  });

  it('hides update dot when hasUpdate is false', () => {
    const { container } = render(<Header {...defaultProps} hasUpdate={false} />);
    expect(container.querySelector('.header-update-dot')).not.toBeInTheDocument();
  });
});
