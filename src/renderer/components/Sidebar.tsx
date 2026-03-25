import React, { useState } from 'react';
import { Session } from '../../shared/types';
import SessionList from './SessionList';
import FileExplorer from './FileExplorer';
import '../styles/Sidebar.css';

type SidebarTab = 'chats' | 'vault';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onNewChat: () => void;
  onFileSelect: (path: string | null) => void;
  editingFile: string | null;
  sessionRefreshKey: number;
}

export default function Sidebar({
  isOpen,
  onClose,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onFileSelect,
  editingFile,
  sessionRefreshKey,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');

  if (!isOpen) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${activeTab === 'chats' ? 'sidebar-tab--active' : ''}`}
            onClick={() => setActiveTab('chats')}
          >
            Chats
          </button>
          <button
            className={`sidebar-tab ${activeTab === 'vault' ? 'sidebar-tab--active' : ''}`}
            onClick={() => setActiveTab('vault')}
          >
            Vault
          </button>
        </div>
        <button className="sidebar-close-btn" onClick={onClose} title="Close">
          &#10005;
        </button>
      </div>
      <div className="sidebar-content">
        {activeTab === 'chats' ? (
          <SessionList
            currentSessionId={currentSessionId}
            onSelectSession={onSelectSession}
            onNewChat={onNewChat}
            refreshKey={sessionRefreshKey}
          />
        ) : (
          <FileExplorer
            isOpen={true}
            onClose={onClose}
            onFileSelect={onFileSelect}
            editingFile={editingFile}
            embedded={true}
          />
        )}
      </div>
    </div>
  );
}
