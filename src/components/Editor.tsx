import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { marked } from 'marked';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import DOMPurify from 'dompurify';

import { getHeadings } from '../utils/headings';

export type ViewMode = 'edit' | 'split' | 'preview';

interface EditorProps {
  content: string;
  noteId: string | null;
  noteName?: string;
  viewMode: ViewMode;
  onUpdate: (content: string) => void;
  onHeadingsChange?: (headings: { level: number; text: string; id: string }[]) => void;
  onSave?: () => void;
}

export type EditorHandle = {
  insertContent: (content: string) => void;
  wrapSelection: (prefix: string, suffix?: string, placeholder?: string) => void;
  prefixLine: (prefix: string) => void;
  getContent: () => string;
};

marked.setOptions({ gfm: true, breaks: true });

// Module-level cache: image paths are content-addressed (uuid filename), so a
// path resolves to the same bytes for the lifetime of the app. Avoids re-IPC +
// re-base64 on every keystroke-triggered preview render.
const imageDataUrlCache = new Map<string, string>();

async function resolveImages(html: string): Promise<string> {
  const matches = [...html.matchAll(/src="(\/[^"]+)"/g)];
  if (!matches.length) return html;
  const replacements = await Promise.all(
    matches.map(async ([full, path]) => {
      let dataUrl = imageDataUrlCache.get(path);
      if (!dataUrl) {
        try {
          dataUrl = await invoke<string>('get_image_base64', { path });
          imageDataUrlCache.set(path, dataUrl);
        } catch {
          return null;
        }
      }
      return { from: full, to: `src="${dataUrl}"` };
    })
  );
  let resolved = html;
  replacements.forEach((r) => {
    if (r) resolved = resolved.replace(r.from, r.to);
  });
  return resolved;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(
  ({ content, noteId, viewMode, onUpdate, onHeadingsChange, onSave }, ref) => {
    const [markdown, setMarkdown] = useState(content);
    const [previewHtml, setPreviewHtml] = useState('');
    const [splitPct, setSplitPct] = useState(50);
    const isDragging = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const markdownRef = useRef(content);

    // Sync markdown state when content prop changes
    useEffect(() => {
      if (content !== markdownRef.current) {
        setMarkdown(content);
        markdownRef.current = content;
      }
    }, [content]);

    // Debounced preview: render after 120ms of no typing.
    // Also pushes the latest headings up to the parent on the same cadence so
    // the App tree never re-renders per keystroke.
    useEffect(() => {
      let cancelled = false;
      const timer = setTimeout(async () => {
        try {
          const raw = String(marked.parse(markdown));
          const html = await resolveImages(raw);
          const sanitized = DOMPurify.sanitize(html);
          if (!cancelled) {
            setPreviewHtml(sanitized);
            onHeadingsChange?.(getHeadings(markdown));
          }
        } catch { /* ignore parse errors */ }
      }, 120);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [markdown, onHeadingsChange]);

    useImperativeHandle(ref, () => ({
      insertContent: (text: string) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const currentMd = markdownRef.current;
        const newVal = currentMd.slice(0, start) + text + currentMd.slice(ta.selectionEnd);
        setMarkdown(newVal);
        markdownRef.current = newVal;
        onUpdate(newVal);
        setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length; }, 0);
      },
      wrapSelection: (prefix: string, suffix: string = prefix, placeholder: string = '') => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const currentMd = markdownRef.current;
        const selected = currentMd.slice(start, end);
        const middle = selected || placeholder;
        const newVal = currentMd.slice(0, start) + prefix + middle + suffix + currentMd.slice(end);
        setMarkdown(newVal);
        markdownRef.current = newVal;
        onUpdate(newVal);
        setTimeout(() => {
          ta.focus();
          if (selected) {
            ta.selectionStart = start + prefix.length;
            ta.selectionEnd = start + prefix.length + selected.length;
          } else {
            ta.selectionStart = ta.selectionEnd = start + prefix.length + middle.length;
          }
        }, 0);
      },
      prefixLine: (prefix: string) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const currentMd = markdownRef.current;
        const lineStart = currentMd.lastIndexOf('\n', start - 1) + 1;
        const newVal = currentMd.slice(0, lineStart) + prefix + currentMd.slice(lineStart);
        setMarkdown(newVal);
        markdownRef.current = newVal;
        onUpdate(newVal);
        setTimeout(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + prefix.length;
        }, 0);
      },
      getContent: () => markdownRef.current,
    }));

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave?.(); }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onSave]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setMarkdown(val);
      markdownRef.current = val;
      onUpdate(val);
    }, [onUpdate]);

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((i) => i.type.startsWith('image/'));
      if (!imgItem) return;
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { alert('Image must be < 10MB'); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        let imgRef = dataUrl;
        if (noteId) {
          try {
            imgRef = await invoke<string>('save_image', { noteId, filename: file.name || 'image.png', dataBase64: dataUrl });
          } catch (err) { console.error('save_image failed', err); }
        }
        const ta = textareaRef.current;
        if (!ta) return;
        const ins = `![image](${imgRef})`;
        const start = ta.selectionStart;
        const currentMd = markdownRef.current;
        const newVal = currentMd.slice(0, start) + ins + currentMd.slice(start);
        setMarkdown(newVal);
        markdownRef.current = newVal;
        onUpdate(newVal);
      };
      reader.readAsDataURL(file);
    }, [noteId, onUpdate]);

    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setSplitPct(Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100)));
      };
      const onUp = () => {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }, []);

    const textareaEl = (
      <textarea
        ref={textareaRef}
        value={markdown}
        onChange={handleChange}
        onPaste={handlePaste}
        className="flex-1 w-full resize-none bg-transparent text-[#d4d4d4] font-mono text-[13.5px] leading-[1.85] tracking-[0.01em] outline-none caret-[#a78bfa]"
        placeholder="# Start writing markdown..."
        spellCheck={false}
      />
    );

    const previewEl = (
      <div className="note-preview text-[#eaeaea] leading-[1.85]" dangerouslySetInnerHTML={{ __html: previewHtml }} />
    );

    return (
      <div className="flex-1 flex flex-col overflow-hidden editor-bg">
        {viewMode === 'edit' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              <div className="note-editor-card flex-1 flex flex-col p-6">
                {textareaEl}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'split' && (
          <div ref={containerRef} className="flex-1 flex overflow-hidden p-3 gap-2">
            <div className="overflow-hidden flex flex-col flex-shrink-0" style={{ width: `calc(${splitPct}% - 6px)` }}>
              <div className="note-editor-card flex-1 flex flex-col p-5 overflow-hidden">
                <div className="editor-pane-label mb-3 flex-shrink-0">Markdown</div>
                <div className="flex-1 overflow-y-auto flex flex-col">{textareaEl}</div>
              </div>
            </div>
            <div onMouseDown={onDividerMouseDown} className="w-1 flex-shrink-0 self-stretch rounded-full bg-gray-700/40 hover:bg-[#7c3aed]/70 cursor-col-resize transition-colors" />
            <div className="flex-1 overflow-hidden min-w-0 flex flex-col">
              <div className="note-editor-card flex-1 flex flex-col p-5 overflow-hidden">
                <div className="editor-pane-label mb-3">Preview</div>
                <div className="flex-1 overflow-y-auto">{previewEl}</div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="note-editor-card p-6">
                {previewEl}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

Editor.displayName = 'Editor';
