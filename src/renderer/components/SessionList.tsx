import React, { useState, useEffect, useCallback } from 'react';
import { Session } from '../../shared/types';
import '../styles/SessionList.css';

interface SessionListProps {
  currentSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onNewChat: () => void;
  refreshKey: number;
}

export default function SessionList({ currentSessionId, onSelectSession, onNewChat, refreshKey }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.nudge.sessions.list();
      setSessions(list);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  const toggleStar = async (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    await window.nudge.sessions.update(session.id, { starred: !session.starred });
    setSessions(prev =>
      prev.map(s => s.id === session.id ? { ...s, starred: !s.starred } : s)
    );
  };

  const deleteSession = async (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    const confirmed = window.confirm('Delete this conversation?');
    if (!confirmed) return;
    await window.nudge.sessions.delete(session.id);
    setSessions(prev => prev.filter(s => s.id !== session.id));
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Sort: starred first, then by updatedAt
  const sorted = [...sessions].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="session-list">
      <button className="session-list-new" onClick={onNewChat}>
        <span className="session-list-new-icon">+</span>
        New chat
      </button>
      <div className="session-list-items">
        {loading && sessions.length === 0 ? (
          <div className="session-list-empty">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="session-list-empty">No conversations yet</div>
        ) : (
          sorted.map(session => (
            <div
              key={session.id}
              className={`session-list-item ${session.id === currentSessionId ? 'session-list-item--active' : ''}`}
              onClick={() => onSelectSession(session)}
            >
              <div className="session-list-item-content">
                <div className="session-list-item-title">{session.title}</div>
                <div className="session-list-item-date">{formatDate(session.updatedAt)}</div>
              </div>
              <div className="session-list-item-actions">
                <button
                  className={`session-list-item-btn session-list-star ${session.starred ? 'session-list-star--active' : ''}`}
                  onClick={(e) => toggleStar(e, session)}
                  title={session.starred ? 'Unstar' : 'Star'}
                >
                  {session.starred ? '\u2605' : '\u2606'}
                </button>
                <button
                  className="session-list-item-btn session-list-delete"
                  onClick={(e) => deleteSession(e, session)}
                  title="Delete"
                >
                  \u00D7
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
