import React, { useState, useEffect, useCallback, useRef } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import '../styles/FileExplorer.css';

interface FileExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (path: string | null) => void;
  editingFile?: string | null;
  embedded?: boolean;
}

interface TreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeEntry[];
  expanded?: boolean;
  loaded?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  filePath: string;
  fileName: string;
}

export default function FileExplorer({ isOpen, onClose, onFileSelect, editingFile, embedded }: FileExplorerProps) {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [priorities, setPriorities] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const entriesRef = useRef<TreeEntry[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

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

  const getExpandedPaths = useCallback((items: TreeEntry[]): Set<string> => {
    const expanded = new Set<string>();
    const walk = (entries: TreeEntry[]) => {
      for (const entry of entries) {
        if (entry.isDirectory && entry.expanded) {
          expanded.add(entry.path);
          if (entry.children) walk(entry.children);
        }
      }
    };
    walk(items);
    return expanded;
  }, []);

  const restoreExpanded = useCallback(async (root: TreeEntry[], expandedPaths: Set<string>): Promise<TreeEntry[]> => {
    const restore = async (items: TreeEntry[]): Promise<TreeEntry[]> => {
      return Promise.all(items.map(async (item) => {
        if (item.isDirectory && expandedPaths.has(item.path)) {
          const children = await loadDirectory(item.path);
          const restoredChildren = await restore(children);
          return { ...item, children: restoredChildren, loaded: true, expanded: true };
        }
        return item;
      }));
    };
    return restore(root);
  }, [loadDirectory]);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    const expandedPaths = getExpandedPaths(entriesRef.current);
    const root = await loadDirectory('');
    const restored = expandedPaths.size > 0 ? await restoreExpanded(root, expandedPaths) : root;
    setEntries(restored);
    setLoading(false);
    loadPriorities(restored).catch(() => {});
  }, [loadDirectory, loadPriorities, getExpandedPaths, restoreExpanded]);

  useEffect(() => {
    if (isOpen) {
      loadRoot();
    }
  }, [isOpen]);

  // Auto-refresh on vault changes
  useEffect(() => {
    if (!isOpen) return;
    const cleanup = window.nudge.vault.onChanged(() => {
      loadRoot();
    });
    return cleanup;
  }, [isOpen, loadRoot]);

  // Focus and select rename input when renaming starts
  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      const input = renameInputRef.current;
      input.focus();
      // Select name without extension
      const dotIndex = renameValue.lastIndexOf('.');
      if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
      } else {
        input.select();
      }
    }
  }, [renamingPath, renameValue]);

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

  const getParentDir = (filePath: string): string => {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
  };

  const handleContextMenu = (e: React.MouseEvent, entry: TreeEntry) => {
    if (entry.isDirectory) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, filePath: entry.path, fileName: entry.name });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // --- Rename ---
  const startRename = (filePath: string, fileName: string) => {
    setRenamingPath(filePath);
    setRenameValue(fileName);
    closeContextMenu();
  };

  const confirmRename = async () => {
    if (!renamingPath || !renameValue.trim()) {
      cancelRename();
      return;
    }
    const newName = renameValue.trim();
    const parentDir = getParentDir(renamingPath);
    const newPath = parentDir ? `${parentDir}/${newName}` : newName;
    if (newPath !== renamingPath) {
      try {
        await window.nudge.vault.moveFile(renamingPath, newPath);
        // If the renamed file was being edited, update the editor
        if (editingFile === renamingPath) {
          onFileSelect(newPath);
        }
        await loadRoot();
      } catch (err: any) {
        console.error('Rename failed:', err?.message || err);
      }
    }
    setRenamingPath(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingPath(null);
    setRenameValue('');
  };

  // --- Duplicate ---
  const duplicateFile = async (filePath: string, fileName: string) => {
    closeContextMenu();
    try {
      const content = await window.nudge.vault.readFile(filePath);
      const dotIndex = fileName.lastIndexOf('.');
      let newName: string;
      if (dotIndex > 0) {
        const baseName = fileName.substring(0, dotIndex);
        const ext = fileName.substring(dotIndex);
        newName = `${baseName} (copy)${ext}`;
      } else {
        newName = `${fileName} (copy)`;
      }
      const parentDir = getParentDir(filePath);
      const newPath = parentDir ? `${parentDir}/${newName}` : newName;
      await window.nudge.vault.createFile(newPath, content);
      await loadRoot();
    } catch (err: any) {
      console.error('Duplicate failed:', err?.message || err);
    }
  };

  // --- Archive ---
  const archiveFile = async (filePath: string, fileName: string) => {
    closeContextMenu();
    const confirmed = window.confirm('Are you sure you\'d like to archive this file?');
    if (!confirmed) return;
    try {
      const newPath = `archive/${fileName}`;
      await window.nudge.vault.moveFile(filePath, newPath);
      if (editingFile === filePath) {
        onFileSelect(null);
      }
      await loadRoot();
    } catch (err: any) {
      console.error('Archive failed:', err?.message || err);
    }
  };

  // --- Delete ---
  const deleteFile = async (filePath: string) => {
    closeContextMenu();
    const confirmed = window.confirm(`Delete "${filePath}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await window.nudge.vault.deleteFile(filePath);
      if (editingFile === filePath) {
        onFileSelect(null);
      }
      await loadRoot();
    } catch (err: any) {
      console.error('Delete failed:', err?.message || err);
    }
  };

  const buildContextMenuItems = (): ContextMenuEntry[] => {
    if (!contextMenu) return [];
    const { filePath, fileName } = contextMenu;
    const currentDir = getParentDir(filePath);

    const isIdea = currentDir === 'ideas';

    const items: ContextMenuEntry[] = [
      { label: 'Rename', onClick: () => startRename(filePath, fileName) },
      { label: 'Duplicate', onClick: () => duplicateFile(filePath, fileName) },
    ];

    if (isIdea) {
      items.push({ label: 'Archive', onClick: () => archiveFile(filePath, fileName) });
    }

    items.push({ separator: true });
    items.push({ label: 'Delete', onClick: () => deleteFile(filePath), danger: true });

    return items;
  };

  const renderEntry = (entry: TreeEntry) => (
    <div key={entry.path}>
      <div
        className={`file-explorer-item ${entry.isDirectory ? 'file-explorer-item--dir' : ''}`}
        onClick={() => {
          if (renamingPath === entry.path) return;
          handleClick(entry);
        }}
        onContextMenu={(e) => handleContextMenu(e, entry)}
      >
        {entry.isDirectory && (
          <span className={`file-explorer-chevron ${entry.expanded ? 'file-explorer-chevron--open' : ''}`}>
            &#9654;
          </span>
        )}
        <span className="file-explorer-icon">
          {entry.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
        </span>
        {renamingPath === entry.path ? (
          <input
            ref={renameInputRef}
            className="file-explorer-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                confirmRename();
              } else if (e.key === 'Escape') {
                cancelRename();
              }
            }}
            onBlur={confirmRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="file-explorer-name">{entry.name}</span>
        )}
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

  if (embedded) {
    return (
      <div className="file-explorer file-explorer--embedded">
        <div className="file-explorer-tree">
          {loading ? (
            <div className="file-explorer-empty">Loading...</div>
          ) : entries.length > 0 ? (
            entries.map(renderEntry)
          ) : (
            <div className="file-explorer-empty">No files found</div>
          )}
        </div>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={buildContextMenuItems()}
            onClose={closeContextMenu}
          />
        )}
      </div>
    );
  }

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
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
