import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/FileEditor.css';

interface FileEditorProps {
  filePath: string | null;
  onClose: () => void;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

function useIsDark() {
  const [isDark, setIsDark] = useState(() => {
    const explicit = document.documentElement.getAttribute('data-theme');
    if (explicit) return explicit === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!document.documentElement.getAttribute('data-theme')) setIsDark(e.matches);
    };
    const observer = new MutationObserver(() => {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit) setIsDark(explicit === 'dark');
      else setIsDark(mq.matches);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    mq.addEventListener('change', onChange);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', onChange);
    };
  }, []);
  return isDark;
}

function LineNumbers({
  content,
  scrollTop,
  lineHeights,
}: {
  content: string;
  scrollTop: number;
  lineHeights: number[] | null;
}) {
  const lineCount = content.split('\n').length;
  return (
    <div className="file-editor-line-numbers" style={{ transform: `translateY(-${scrollTop}px)` }}>
      {Array.from({ length: lineCount }, (_, i) => (
        <div
          key={i}
          className="file-editor-line-number"
          style={lineHeights?.[i] ? { height: lineHeights[i] } : undefined}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
}

// Toolbar helpers: wrap selection or insert at cursor
function wrapSelection(ta: HTMLTextAreaElement, before: string, after: string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const selected = text.slice(start, end);
  const replacement = before + (selected || 'text') + after;
  // Use execCommand to preserve undo history
  ta.focus();
  document.execCommand('insertText', false, replacement);
  // Select inner text if nothing was selected
  if (!selected) {
    ta.setSelectionRange(start + before.length, start + before.length + 4);
  }
}

function prefixLines(ta: HTMLTextAreaElement, prefix: string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  // Find line boundaries
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const blockEnd = lineEnd === -1 ? text.length : lineEnd;
  const block = text.slice(lineStart, blockEnd);
  const prefixed = block.split('\n').map(line => prefix + line).join('\n');
  ta.setSelectionRange(lineStart, blockEnd);
  ta.focus();
  document.execCommand('insertText', false, prefixed);
}

function insertAtCursor(ta: HTMLTextAreaElement, text: string) {
  ta.focus();
  document.execCommand('insertText', false, text);
}

interface ToolbarAction {
  label: string;
  title: string;
  icon: string;
  action: (ta: HTMLTextAreaElement) => void;
}

const TOOLBAR_ACTIONS: (ToolbarAction | 'divider')[] = [
  { label: 'B', title: 'Bold', icon: 'B', action: (ta) => wrapSelection(ta, '**', '**') },
  { label: 'I', title: 'Italic', icon: 'I', action: (ta) => wrapSelection(ta, '_', '_') },
  { label: 'S', title: 'Strikethrough', icon: 'S', action: (ta) => wrapSelection(ta, '~~', '~~') },
  'divider',
  { label: 'Link', title: 'Link', icon: '🔗', action: (ta) => {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    const text = sel || 'text';
    ta.focus();
    document.execCommand('insertText', false, `[${text}](url)`);
  }},
  { label: 'Quote', title: 'Quote', icon: '❝', action: (ta) => prefixLines(ta, '> ') },
  { label: 'Code', title: 'Inline code', icon: '`', action: (ta) => wrapSelection(ta, '`', '`') },
  { label: 'Block', title: 'Code block', icon: '```', action: (ta) => wrapSelection(ta, '```\n', '\n```') },
  'divider',
  { label: 'UL', title: 'Bullet list', icon: '•', action: (ta) => prefixLines(ta, '- ') },
  { label: 'OL', title: 'Numbered list', icon: '1.', action: (ta) => prefixLines(ta, '1. ') },
  { label: 'Check', title: 'Checklist', icon: '☑', action: (ta) => prefixLines(ta, '- [ ] ') },
];

export default function FileEditor({ filePath, onClose }: FileEditorProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [lineHeights, setLineHeights] = useState<number[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDark();

  useEffect(() => {
    if (!filePath) return;

    let cancelled = false;
    currentPathRef.current = filePath;

    const load = async () => {
      setLoading(true);
      setSaveStatus('saved');
      setScrollTop(0);
      try {
        const text = await window.nudge.vault.readFile(filePath);
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setContent('');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Sync scroll position from the textarea to line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current) {
      setScrollTop(textareaRef.current.scrollTop);
    }
  }, []);

  // Measure rendered line heights when word wrap is on so gutter stays aligned.
  useEffect(() => {
    if (!wordWrap || !showLineNumbers || loading) {
      setLineHeights(null);
      return;
    }

    const ta = textareaRef.current;
    if (!ta) return;

    let cancelled = false;
    let rafId: number | null = null;
    let measurer: HTMLPreElement | null = null;

    const measure = () => {
      if (cancelled || !ta) return;

      if (!measurer) {
        measurer = document.createElement('pre');
        const styles = window.getComputedStyle(ta);
        measurer.style.cssText = `
          position: absolute; visibility: hidden; pointer-events: none;
          font-family: ${styles.fontFamily};
          font-size: ${styles.fontSize};
          line-height: ${styles.lineHeight};
          padding: ${styles.padding};
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          box-sizing: border-box;
        `;
        ta.parentElement?.appendChild(measurer);
      }

      measurer.style.width = `${ta.clientWidth}px`;

      const lines = content.split('\n');
      measurer.innerHTML = '';
      for (const line of lines) {
        const div = document.createElement('div');
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
        div.style.overflowWrap = 'break-word';
        div.textContent = line || '\u200b';
        measurer.appendChild(div);
      }

      const heights: number[] = [];
      for (let i = 0; i < measurer.children.length; i++) {
        heights.push((measurer.children[i] as HTMLElement).getBoundingClientRect().height);
      }

      if (!cancelled) setLineHeights(heights);
    };

    measure();

    const ro = new ResizeObserver(() => {
      if (!cancelled) {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(measure);
      }
    });
    ro.observe(ta);

    return () => {
      cancelled = true;
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (measurer) measurer.remove();
    };
  }, [wordWrap, showLineNumbers, loading, content, filePath]);

  const saveFile = useCallback(async (text: string) => {
    if (!currentPathRef.current) return;
    setSaveStatus('saving');
    try {
      await window.nudge.vault.writeFile(currentPathRef.current, text);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('unsaved');
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setSaveStatus('unsaved');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveFile(newContent);
    }, 1000);
  }, [saveFile]);

  // Handle Tab key for indentation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      insertAtCursor(e.currentTarget, '  ');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Listen for Cmd+S / Ctrl+S via the application menu
  useEffect(() => {
    if (!filePath) return;
    return window.nudge.app.onMenuSave(() => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveFile(contentRef.current);
    });
  }, [filePath, saveFile]);

  const handleToolbarAction = useCallback((action: (ta: HTMLTextAreaElement) => void) => {
    const ta = textareaRef.current;
    if (!ta) return;
    action(ta);
    // Sync content after toolbar action modifies the textarea
    setTimeout(() => {
      const newContent = ta.value;
      setContent(newContent);
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveFile(newContent), 1000);
    }, 0);
  }, [saveFile]);

  if (!filePath) return null;

  const fileName = filePath.split('/').pop() || filePath;

  const statusLabel: Record<SaveStatus, string> = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved changes',
  };

  return (
    <div className="file-editor" data-color-mode={isDark ? 'dark' : 'light'}>
      <div className="file-editor-header">
        <button className="file-editor-back" onClick={onClose} title="Close editor">
          &#8592;
        </button>
        <span className="file-editor-filename" title={filePath}>{fileName}</span>
        <button
          className={`file-editor-line-toggle ${showLineNumbers ? 'active' : ''}`}
          onClick={() => setShowLineNumbers(prev => !prev)}
          title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <text x="1" y="5" fontSize="4.5" fill="currentColor" fontFamily="monospace">1</text>
            <text x="1" y="9.5" fontSize="4.5" fill="currentColor" fontFamily="monospace">2</text>
            <text x="1" y="14" fontSize="4.5" fill="currentColor" fontFamily="monospace">3</text>
            <line x1="7" y1="1" x2="7" y2="15" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
            <line x1="9" y1="3.5" x2="15" y2="3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="9" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="9" y1="12.5" x2="15" y2="12.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span className="file-editor-line-toggle-label">Lines</span>
        </button>
        <button
          className={`file-editor-line-toggle ${wordWrap ? 'active' : ''}`}
          onClick={() => setWordWrap(prev => !prev)}
          title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="2" y1="7.5" x2="11" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M11 7.5 C14 7.5 14 12 11 12 L8 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
            <polyline points="9.5,10.5 8,12 9.5,13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="file-editor-line-toggle-label">Wrap</span>
        </button>
        <span className={`file-editor-status file-editor-status--${saveStatus}`}>
          {statusLabel[saveStatus]}
        </span>
      </div>
      {loading ? (
        <div className="file-editor-loading">Loading...</div>
      ) : (
        <>
          <div className="file-editor-toolbar">
            {TOOLBAR_ACTIONS.map((item, i) =>
              item === 'divider' ? (
                <span key={i} className="file-editor-toolbar-divider" />
              ) : (
                <button
                  key={item.title}
                  className="file-editor-toolbar-btn"
                  title={item.title}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleToolbarAction(item.action)}
                >
                  {item.icon}
                </button>
              )
            )}
          </div>
          <div
            ref={editorBodyRef}
            className={`file-editor-body ${showLineNumbers ? 'show-line-numbers' : ''} ${wordWrap ? 'word-wrap' : ''}`}
          >
            {showLineNumbers && (
              <div className="file-editor-gutter">
                <LineNumbers content={content} scrollTop={scrollTop} lineHeights={lineHeights} />
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="file-editor-textarea"
              value={content}
              onChange={handleChange}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              placeholder="Empty file"
              spellCheck={false}
            />
          </div>
        </>
      )}
    </div>
  );
}
