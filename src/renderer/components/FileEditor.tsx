import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/FileEditor.css';

interface FileEditorProps {
  filePath: string | null;
  onClose: () => void;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

export default function FileEditor({ filePath, onClose }: FileEditorProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filePath) return;

    let cancelled = false;
    currentPathRef.current = filePath;

    const load = async () => {
      setLoading(true);
      setSaveStatus('saved');
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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setSaveStatus('unsaved');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveFile(newContent);
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  if (!filePath) return null;

  const fileName = filePath.split('/').pop() || filePath;

  const statusLabel: Record<SaveStatus, string> = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved changes',
  };

  return (
    <div className="file-editor">
      <div className="file-editor-header">
        <button className="file-editor-back" onClick={onClose} title="Close editor">
          &#8592;
        </button>
        <span className="file-editor-filename" title={filePath}>{fileName}</span>
        <span className={`file-editor-status file-editor-status--${saveStatus}`}>
          {statusLabel[saveStatus]}
        </span>
      </div>
      {loading ? (
        <div className="file-editor-loading">Loading...</div>
      ) : (
        <textarea
          className="file-editor-textarea"
          value={content}
          onChange={handleChange}
          placeholder="Empty file"
          spellCheck={false}
        />
      )}
    </div>
  );
}
