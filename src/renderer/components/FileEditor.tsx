import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor';
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

  // Sync scroll position from the editor's scrollable area to line numbers
  useEffect(() => {
    if (!showLineNumbers || loading) return;
    const container = editorBodyRef.current;
    if (!container) return;

    let cancelled = false;
    let scrollArea: Element | null = null;

    const onScroll = () => {
      if (scrollArea) setScrollTop(scrollArea.scrollTop);
    };

    // The MDEditor may not have rendered .w-md-editor-area yet when this
    // effect first runs. Use a MutationObserver to detect when it appears.
    const attach = () => {
      scrollArea = container.querySelector('.w-md-editor-area');
      if (scrollArea) {
        scrollArea.addEventListener('scroll', onScroll, { passive: true });
        return true;
      }
      return false;
    };

    if (!attach()) {
      const observer = new MutationObserver(() => {
        if (!cancelled && attach()) {
          observer.disconnect();
        }
      });
      observer.observe(container, { childList: true, subtree: true });
      return () => {
        cancelled = true;
        observer.disconnect();
        if (scrollArea) scrollArea.removeEventListener('scroll', onScroll);
      };
    }

    return () => {
      cancelled = true;
      if (scrollArea) scrollArea.removeEventListener('scroll', onScroll);
    };
  }, [showLineNumbers, loading, filePath]);

  // Measure rendered line heights when word wrap is on so gutter stays aligned.
  // Uses an offscreen <pre> element styled identically to the editor to measure
  // how tall each logical line renders at the current editor width.
  useEffect(() => {
    if (!wordWrap || !showLineNumbers || loading) {
      setLineHeights(null);
      return;
    }

    const container = editorBodyRef.current;
    if (!container) return;

    let cancelled = false;
    let rafId: number | null = null;
    let measurer: HTMLPreElement | null = null;

    const measure = () => {
      if (cancelled) return;
      const editorArea = container.querySelector('.w-md-editor-area');
      const preEl = container.querySelector('.w-md-editor-text-pre');
      if (!editorArea || !preEl) return;

      // Create or reuse the offscreen measurer
      if (!measurer) {
        measurer = document.createElement('pre');
        const styles = window.getComputedStyle(preEl);
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
        container.appendChild(measurer);
      }

      // Match the editor's content width
      measurer.style.width = `${editorArea.clientWidth}px`;

      const lines = content.split('\n');
      const heights: number[] = [];

      // Batch: set all lines at once, measure via a wrapper per line
      measurer.innerHTML = '';
      for (const line of lines) {
        const div = document.createElement('div');
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
        div.style.overflowWrap = 'break-word';
        // Use a zero-width space for empty lines so they still have height
        div.textContent = line || '\u200b';
        measurer.appendChild(div);
      }

      for (let i = 0; i < measurer.children.length; i++) {
        heights.push((measurer.children[i] as HTMLElement).getBoundingClientRect().height);
      }

      if (!cancelled) setLineHeights(heights);
    };

    const startMeasuring = () => {
      const editorArea = container.querySelector('.w-md-editor-area');
      if (!editorArea) return false;

      measure();

      // Re-measure when the editor area resizes (e.g. window resize)
      const ro = new ResizeObserver(() => {
        if (!cancelled) {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(measure);
        }
      });
      ro.observe(editorArea);

      return () => {
        ro.disconnect();
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (measurer) {
          measurer.remove();
          measurer = null;
        }
      };
    };

    const cleanup = startMeasuring();
    if (cleanup) {
      return () => {
        cancelled = true;
        cleanup();
      };
    }

    // Editor might not be ready yet — wait for it
    let cleanupRef: (() => void) | null = null;
    const observer = new MutationObserver(() => {
      if (cancelled) return;
      const result = startMeasuring();
      if (result) {
        observer.disconnect();
        cleanupRef = result;
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
      cleanupRef?.();
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

  const handleChange = useCallback((value?: string) => {
    const newContent = value ?? '';
    setContent(newContent);
    setSaveStatus('unsaved');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveFile(newContent);
    }, 1000);
  }, [saveFile]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const toolbarCommands = useMemo(() => [
    commands.bold, commands.italic, commands.strikethrough, commands.divider,
    commands.link, commands.quote, commands.code, commands.codeBlock, commands.image, commands.divider,
    commands.unorderedListCommand, commands.orderedListCommand, commands.checkedListCommand,
  ], []);

  const extraToolbarCommands = useMemo(() => [
    commands.codeEdit, commands.codeLive, commands.codePreview,
  ], []);

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
        <div
          ref={editorBodyRef}
          className={`file-editor-body ${showLineNumbers ? 'show-line-numbers' : ''} ${wordWrap ? 'word-wrap' : ''}`}
        >
          {showLineNumbers && (
            <div className="file-editor-gutter">
              <LineNumbers content={content} scrollTop={scrollTop} lineHeights={lineHeights} />
            </div>
          )}
          <MDEditor
            value={content}
            onChange={handleChange}
            preview="edit"
            height="100%"
            visibleDragbar={false}
            tabSize={2}
            defaultTabEnable={false}
            commands={toolbarCommands}
            extraCommands={extraToolbarCommands}
            data-color-mode={isDark ? 'dark' : 'light'}
            textareaProps={{
              placeholder: 'Empty file',
              spellCheck: false,
            }}
          />
        </div>
      )}
    </div>
  );
}
