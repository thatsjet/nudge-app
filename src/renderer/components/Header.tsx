import React from 'react';
import '../styles/Header.css';

interface HeaderProps {
  onToggleExplorer: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  explorerOpen: boolean;
}

export default function Header({ onToggleExplorer, onOpenSettings, onNewChat, explorerOpen }: HeaderProps) {
  return (
    <div className="header drag-region">
      <div className="header-left" />

      <span className="header-title">Nudge</span>

      <div className="header-right">
        <button
          className={`header-btn ${explorerOpen ? 'header-btn--active' : ''}`}
          onClick={onToggleExplorer}
          title="Toggle file explorer"
        >
          <span role="img" aria-label="Files">&#128193;</span>
        </button>
        <button className="header-btn" onClick={onNewChat} title="New chat">
          +
        </button>
        <button className="header-btn" onClick={onOpenSettings} title="Settings">
          <span role="img" aria-label="Settings">&#9881;&#65039;</span>
        </button>
      </div>
    </div>
  );
}
