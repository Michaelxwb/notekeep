import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { marked } from 'marked';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

export type ViewMode = 'edit' | 'split' | 'preview';

interface EditorProps {
  content: string;
  noteId: string | null;
  noteName?: string;
  viewMode: ViewMode;
  onUpdate: (content: string) => void;
  onSave?: () => void;
}

export interface EditorHandle {
  insertContent: (content: string) => void;
  getContent: () => string;
}

marked.setOptions({ gfm: true, breaks: true });

async function resolveImages(html: string): Promise<string> {
  const matches = [...html.matchAll(/src="(\/[^"]+)"/g)];
  if (!matches.length) return html;
  let resolved = html;
  await Promise.all(
    matches.map(async ([full, path]) => {
      try {
        const dataUrl = await invoke<string>('get_image_base64', { path });
        resolved = resolved.replace(full, `src="${dataUrl}"`);
      } catch { /* leave as-is */ }
    })
  );
  return resolved;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(
  ({ content, noteId, noteName, viewMode, onUpdate, onSave }, ref) => {
    const [markdown, setMarkdown] = useState(content);
    const [previewHtml, setPreviewHtml] = useState('');
    const [splitPct, setSplitPct] = useState(50);
    const isDragging = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lastContentRef = useRef(content);

    useEffect(() => {
      if (content !== lastContentRef.current) {
        setMarkdown(content);
        lastContentRef.current = content;
      }
    }, [content]);

    useEffect(() => {
      let cancelled = false;
      const run = async () => {
        try {
          const raw = String(marked.parse(markdown));
          const html = await resolveImages(raw);
          if (!cancelled) setPreviewHtml(html);
        } catch { /* ignore */ }
      };
      run();
      return () => { cancelled = true; };
    }, [markdown]);

    useImperativeHandle(ref, () => ({
      insertContent: (text: string) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const newVal = markdown.slice(0, start) + text + markdown.slice(ta.selectionEnd);
        setMarkdown(newVal);
        lastContentRef.current = newVal;
        onUpdate(newVal);
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + text.length; }, 0);
      },
      getContent: () => markdown,
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
      lastContentRef.current = val;
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
        const newVal = markdown.slice(0, start) + ins + markdown.slice(start);
        setMarkdown(newVal);
        lastContentRef.current = newVal;
        onUpdate(newVal);
      };
      reader.readAsDataURL(file);
    }, [markdown, noteId, onUpdate]);

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
        className="flex-1 w-full resize-none bg-transparent text-[#d4d4d4] font-mono text-sm leading-7 outline-none"
        placeholder="# Start writing markdown..."
        spellCheck={false}
      />
    );

    const previewEl = (
      <div className="note-preview text-[#eaeaea] leading-7" dangerouslySetInnerHTML={{ __html: previewHtml }} />
    );

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {viewMode === 'edit' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto h-full flex flex-col">
              {noteName && <h1 className="text-2xl font-bold mb-4 text-[#eaeaea]">{noteName}</h1>}
              {textareaEl}
            </div>
          </div>
        )}

        {viewMode === 'split' && (
          <div ref={containerRef} className="flex-1 flex overflow-hidden">
            <div className="overflow-y-auto p-5 flex flex-col flex-shrink-0" style={{ width: `${splitPct}%` }}>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 flex-shrink-0">Markdown</div>
              {textareaEl}
            </div>
            <div onMouseDown={onDividerMouseDown} className="w-1 flex-shrink-0 bg-gray-700/70 hover:bg-[#7c3aed]/70 cursor-col-resize transition-colors" />
            <div className="flex-1 overflow-y-auto p-5 min-w-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Preview</div>
              {previewEl}
            </div>
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto">
              {noteName && <h1 className="text-2xl font-bold mb-4 text-[#eaeaea]">{noteName}</h1>}
              {previewEl}
            </div>
          </div>
        )}
      </div>
    );
  }
);

Editor.displayName = 'Editor';

export function getHeadings(content: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      headings.push({ level, text, id: text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') });
    }
  }
  return headings;
}
