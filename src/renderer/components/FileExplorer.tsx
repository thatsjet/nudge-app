import React, { useState, useEffect, useCallback, useRef } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import '../styles/FileExplorer.css';

interface FileExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (path: string | null) => void;
  editingFile?: string | null;
}

interface TreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  lastModified?: number;
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

// Known vault sections with display labels and icons
const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'ideas', label: 'Ideas', icon: '\u{1F4A1}' },
  { key: 'daily', label: 'Daily', icon: '\u{1F4C5}' },
  { key: 'tasks', label: 'Tasks', icon: '\u{2705}' },
];
const SECTION_KEYS = new Set(SECTIONS.map(s => s.key));

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cleanFileName(name: string): string {
  return name.replace(/\.md$/, '').replace(/[-_]/g, ' ');
}

export default function FileExplorer({ isOpen, onClose, onFileSelect, editingFile }: FileExplorerProps) {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [priorities, setPriorities] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(SECTION_KEYS));
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
          lastModified: f.lastModified,
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

    // Auto-expand section directories and load their children
    const withSections = await Promise.all(root.map(async (entry) => {
      if (entry.isDirectory && SECTION_KEYS.has(entry.name)) {
        if (expandedPaths.has(entry.path) || !entry.loaded) {
          const children = await loadDirectory(entry.path);
          const restoredChildren = expandedPaths.size > 0
            ? await restoreExpanded(children, expandedPaths)
            : children;
          return { ...entry, children: restoredChildren, loaded: true, expanded: true };
        }
      }
      if (expandedPaths.has(entry.path)) {
        const children = await loadDirectory(entry.path);
        const restoredChildren = await restoreExpanded(children, expandedPaths);
        return { ...entry, children: restoredChildren, loaded: true, expanded: true };
      }
      return entry;
    }));

    setEntries(withSections);
    setLoading(false);
    loadPriorities(withSections).catch(() => {});
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

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const renderFileItem = (entry: TreeEntry, isActive: boolean) => (
    <div
      key={entry.path}
      className={`fe-file-item ${isActive ? 'fe-file-item--active' : ''}`}
      onClick={() => {
        if (renamingPath === entry.path) return;
        handleClick(entry);
      }}
      onContextMenu={(e) => handleContextMenu(e, entry)}
    >
      <div className="fe-file-main">
        {renamingPath === entry.path ? (
          <input
            ref={renameInputRef}
            className="file-explorer-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
              else if (e.key === 'Escape') cancelRename();
            }}
            onBlur={confirmRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="fe-file-name">{cleanFileName(entry.name)}</span>
            {priorities[entry.path] && (
              <span className={`fe-priority fe-priority--${priorities[entry.path]}`} />
            )}
          </>
        )}
      </div>
      {entry.lastModified && renamingPath !== entry.path && (
        <span className="fe-file-meta">{formatRelativeDate(entry.lastModified)}</span>
      )}
    </div>
  );

  const renderSubdirEntry = (entry: TreeEntry) => (
    <div key={entry.path}>
      <div
        className="fe-subdir-item"
        onClick={() => toggleDirectory(entry)}
      >
        <span className={`fe-subdir-chevron ${entry.expanded ? 'fe-subdir-chevron--open' : ''}`}>
          &#9654;
        </span>
        <span className="fe-subdir-name">{entry.name}</span>
      </div>
      {entry.expanded && entry.children && (
        <div className="fe-subdir-children">
          {entry.children.length > 0
            ? entry.children.map(child =>
                child.isDirectory
                  ? renderSubdirEntry(child)
                  : renderFileItem(child, editingFile === child.path)
              )
            : <div className="fe-empty">Empty</div>
          }
        </div>
      )}
    </div>
  );

  const renderSection = (sectionDef: { key: string; label: string; icon: string }, sectionEntry: TreeEntry) => {
    const isExpanded = expandedSections.has(sectionDef.key);
    const children = sectionEntry.children || [];
    const fileCount = children.filter(c => !c.isDirectory).length;

    return (
      <div key={sectionDef.key} className="fe-section">
        <div
          className="fe-section-header"
          onClick={() => toggleSection(sectionDef.key)}
        >
          <span className={`fe-section-chevron ${isExpanded ? 'fe-section-chevron--open' : ''}`}>
            &#9654;
          </span>
          <span className="fe-section-icon">{sectionDef.icon}</span>
          <span className="fe-section-label">{sectionDef.label}</span>
          <span className="fe-section-count">{fileCount}</span>
        </div>
        {isExpanded && (
          <div className="fe-section-content">
            {children.length > 0 ? (
              children.map(child =>
                child.isDirectory
                  ? renderSubdirEntry(child)
                  : renderFileItem(child, editingFile === child.path)
              )
            ) : (
              <div className="fe-empty">No files yet</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Separate entries into known sections and "other"
  const sectionEntries: { def: typeof SECTIONS[0]; entry: TreeEntry }[] = [];
  const otherEntries: TreeEntry[] = [];
  for (const entry of entries) {
    if (entry.isDirectory && SECTION_KEYS.has(entry.name)) {
      const def = SECTIONS.find(s => s.key === entry.name)!;
      sectionEntries.push({ def, entry });
    } else {
      otherEntries.push(entry);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="file-explorer">
      <div className="fe-header">
        <span className="fe-header-title">Vault</span>
        <div className="fe-header-actions">
          <button className="fe-btn" onClick={loadRoot} title="Refresh">
            &#8635;
          </button>
          <button className="fe-btn" onClick={onClose} title="Close">
            &#10005;
          </button>
        </div>
      </div>
      <div className="fe-body">
        {loading ? (
          <div className="fe-empty">Loading...</div>
        ) : entries.length > 0 ? (
          <>
            {sectionEntries.map(({ def, entry }) => renderSection(def, entry))}
            {otherEntries.length > 0 && (
              <div className="fe-section fe-section--other">
                <div className="fe-section-divider" />
                {otherEntries.map(entry =>
                  entry.isDirectory
                    ? renderSubdirEntry(entry)
                    : renderFileItem(entry, editingFile === entry.path)
                )}
              </div>
            )}
          </>
        ) : (
          <div className="fe-empty">No files found</div>
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
