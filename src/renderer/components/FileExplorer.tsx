import React, { useState, useEffect, useCallback } from 'react';
import '../styles/FileExplorer.css';

interface FileExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (path: string) => void;
}

interface TreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeEntry[];
  expanded?: boolean;
  loaded?: boolean;
}

export default function FileExplorer({ isOpen, onClose, onFileSelect }: FileExplorerProps) {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [priorities, setPriorities] = useState<Record<string, string>>({});

  const loadDirectory = useCallback(async (directory: string): Promise<TreeEntry[]> => {
    try {
      const files = await window.nudge.vault.listFiles(directory);
      return files
        .filter((f: any) => !f.name.startsWith('.'))
        .sort((a: any, b: any) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        })
        .map((f: any) => ({
          name: f.name,
          path: f.path,
          isDirectory: f.isDirectory,
          children: [],
          expanded: false,
          loaded: false,
        }));
    } catch {
      return [];
    }
  }, []);

  const loadPriorities = useCallback(async (entries: TreeEntry[]) => {
    const ideaEntries = entries.find(e => e.name === 'ideas' && e.isDirectory);
    if (!ideaEntries) return;
    const ideaFiles = await window.nudge.vault.listFiles('ideas');
    const filtered = ideaFiles.filter((f: any) => !f.isDirectory && f.name.endsWith('.md') && f.name !== '_template.md');
    const results = await Promise.all(
      filtered.map(async (file: any) => {
        const frontmatter = await window.nudge.vault.readFrontmatter(file.path);
        return { path: file.path, priority: frontmatter?.priority };
      })
    );
    const newPriorities: Record<string, string> = {};
    for (const r of results) {
      if (r.priority && r.priority !== 'medium') {
        newPriorities[r.path] = r.priority;
      }
    }
    setPriorities(newPriorities);
  }, []);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    const root = await loadDirectory('');
    setEntries(root);
    setLoading(false);
    loadPriorities(root).catch(() => {});
  }, [loadDirectory, loadPriorities]);

  useEffect(() => {
    if (isOpen) {
      loadRoot();
    }
  }, [isOpen, loadRoot]);

  const toggleDirectory = async (entry: TreeEntry) => {
    if (!entry.isDirectory) return;

    if (!entry.loaded) {
      const children = await loadDirectory(entry.path);
      setEntries(prev => updateTree(prev, entry.path, { children, loaded: true, expanded: true }));
    } else {
      setEntries(prev => updateTree(prev, entry.path, { expanded: !entry.expanded }));
    }
  };

  const updateTree = (items: TreeEntry[], targetPath: string, updates: Partial<TreeEntry>): TreeEntry[] => {
    return items.map(item => {
      if (item.path === targetPath) {
        return { ...item, ...updates };
      }
      if (item.children && item.children.length > 0) {
        return { ...item, children: updateTree(item.children, targetPath, updates) };
      }
      return item;
    });
  };

  const handleClick = (entry: TreeEntry) => {
    if (entry.isDirectory) {
      toggleDirectory(entry);
    } else {
      onFileSelect(entry.path);
    }
  };

  const renderEntry = (entry: TreeEntry) => (
    <div key={entry.path}>
      <div
        className={`file-explorer-item ${entry.isDirectory ? 'file-explorer-item--dir' : ''}`}
        onClick={() => handleClick(entry)}
      >
        {entry.isDirectory && (
          <span className={`file-explorer-chevron ${entry.expanded ? 'file-explorer-chevron--open' : ''}`}>
            &#9654;
          </span>
        )}
        <span className="file-explorer-icon">
          {entry.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
        </span>
        <span className="file-explorer-name">{entry.name}</span>
        {priorities[entry.path] && (
          <span className={`file-explorer-priority file-explorer-priority--${priorities[entry.path]}`} />
        )}
      </div>
      {entry.isDirectory && entry.expanded && entry.children && (
        <div className="file-explorer-children">
          {entry.children.length > 0
            ? entry.children.map(renderEntry)
            : <div className="file-explorer-empty">Empty folder</div>
          }
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <span className="file-explorer-header-title">Vault</span>
        <div className="file-explorer-header-actions">
          <button className="file-explorer-btn" onClick={loadRoot} title="Refresh">
            &#8635;
          </button>
          <button className="file-explorer-btn" onClick={onClose} title="Close">
            &#10005;
          </button>
        </div>
      </div>
      <div className="file-explorer-tree">
        {loading ? (
          <div className="file-explorer-empty">Loading...</div>
        ) : entries.length > 0 ? (
          entries.map(renderEntry)
        ) : (
          <div className="file-explorer-empty">No files found</div>
        )}
      </div>
    </div>
  );
}
