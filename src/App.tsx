import { useState, useEffect, useCallback, useRef } from 'react';
import { useNotes } from './hooks/useNotes';
import type { NoteItem } from './hooks/useNotes';
import { Editor } from './components/Editor';
import type { EditorHandle, ViewMode } from './components/Editor';
import { getHeadings } from './utils/headings';
import { Sidebar } from './components/Sidebar';
import { TocOverlay } from './components/TableOfContents';
import { Settings } from './components/Settings';
import { useLanguage, useTheme } from './contexts';
import { format } from 'date-fns';
import {
  FileText, Search, Pencil, Columns2, Eye, Settings2, Loader2, Sun, Moon,
  Bold, Italic, Strikethrough, Heading2, Link2, Quote, Code, List, ListOrdered,
} from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
const nowStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function App() {
  const { t, isFirstRun, completeFirstRun } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const {
    listAllItemsMeta, createItem, deleteItem, updateItem, searchItems,
    reorderItems, getItem, loading, error: hookError,
  } = useNotes();

  const error = hookError && hookError !== dismissedError ? hookError : null;

  const [items, setItems] = useState<NoteItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [diariesWithNotes, setDiariesWithNotes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; date: string | null; snippet: string }[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState('');
  const [headings, setHeadings] = useState<{ level: number; text: string; id: string }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [tocOpen, setTocOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentContentRef = useRef('');
  const selectedNoteIdRef = useRef<string | null>(null);
  const editorRef = useRef<EditorHandle>(null);

  const loadItems = useCallback(async () => {
    try {
      const result = await listAllItemsMeta();
      setItems(result);
      const dates = new Set(
        result.filter((i) => i.item_type === 'note' && i.date).map((i) => i.date as string)
      );
      setDiariesWithNotes(dates);
    } catch (e) {
      console.error('Failed to load items:', e);
    }
  }, [listAllItemsMeta]);

  useEffect(() => {
    let ignore = false;
    listAllItemsMeta().then((result) => {
      if (ignore) return;
      setItems(result);
      setDiariesWithNotes(new Set(
        result.filter((i) => i.item_type === 'note' && i.date).map((i) => i.date as string)
      ));
    }).catch(console.error);
    return () => { ignore = true; };
  }, [listAllItemsMeta]);

  // Auto-dismiss error toast
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setDismissedError(error), 4000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (searchQuery.length < 2) return;
    let ignore = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchItems(searchQuery);
        if (!ignore) setSearchResults(results);
      } catch (e) { console.error('Search failed:', e); }
    }, 300);
    return () => { ignore = true; clearTimeout(timer); };
  }, [searchQuery, searchItems]);

  const handleSelectNote = useCallback(async (noteId: string) => {
    // Await the flush so getItem sees the committed write
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      const id = selectedNoteIdRef.current;
      if (id) await updateItem(id, undefined, currentContentRef.current, undefined);
    }
    setSelectedNoteId(noteId);
    selectedNoteIdRef.current = noteId;
    try {
      const note = await getItem(noteId);
      const body = note?.content ?? '';
      setCurrentContent(body);
      currentContentRef.current = body;
      setHeadings(getHeadings(body));
    } catch (e) {
      console.error('Failed to fetch note:', e);
      // Meta listing has no body; clear and let the user retry.
      setCurrentContent('');
      currentContentRef.current = '';
      setHeadings([]);
    }
  }, [getItem, updateItem]);

  const handleCreateNote = async (parentId?: string): Promise<string | undefined> => {
    try {
      const newId = await createItem(parentId ?? null, 'New Note', 'note', undefined);
      const now = nowStr();
      // Compute sort_order: after last sibling
      const siblings = items.filter(i => i.parent_id === (parentId ?? null));
      const maxOrder = siblings.reduce((max, i) => Math.max(max, i.sort_order), -1);
      const newItem: NoteItem = {
        id: newId, parent_id: parentId ?? null, name: 'New Note',
        item_type: 'note', date: null, content: '',
        sort_order: maxOrder + 1, created_at: now, updated_at: now,
      };
      setItems(prev => [...prev, newItem]);
      setSelectedNoteId(newId); selectedNoteIdRef.current = newId;
      setCurrentContent(''); currentContentRef.current = ''; setHeadings([]);
      return newId;
    } catch (e) {
      console.error('Failed to create note:', e);
      await loadItems();
    }
  };

  const handleCreateDiary = async () => {
    try {
      const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const existing = items.find((i) => i.item_type === 'note' && i.date === dateStr);
      if (existing) { handleSelectNote(existing.id); return; }
      const newId = await createItem(null, `Diary ${dateStr}`, 'note', dateStr);
      const now = nowStr();
      const newItem: NoteItem = {
        id: newId, parent_id: null, name: `Diary ${dateStr}`,
        item_type: 'note', date: dateStr, content: '',
        sort_order: 0, created_at: now, updated_at: now,
      };
      setItems(prev => {
        const updated = [...prev, newItem];
        if (dateStr) setDiariesWithNotes(prev => { const s = new Set(prev); s.add(dateStr); return s; });
        return updated;
      });
      setSelectedNoteId(newId); selectedNoteIdRef.current = newId;
      setCurrentContent(''); currentContentRef.current = ''; setHeadings([]);
    } catch (e) {
      console.error('Failed to create diary:', e);
      await loadItems();
    }
  };

  const handleCreateFolder = async (parentId?: string): Promise<string | undefined> => {
    try {
      const newId = await createItem(parentId ?? null, 'New Folder', 'folder');
      const now = nowStr();
      const siblings = items.filter(i => i.parent_id === (parentId ?? null));
      const maxOrder = siblings.reduce((max, i) => Math.max(max, i.sort_order), -1);
      const newItem: NoteItem = {
        id: newId, parent_id: parentId ?? null, name: 'New Folder',
        item_type: 'folder', date: null, content: '',
        sort_order: maxOrder + 1, created_at: now, updated_at: now,
      };
      setItems(prev => [...prev, newItem]);
      return newId;
    } catch (e) {
      console.error('Failed to create folder:', e);
      await loadItems();
    }
  };

  const handleDeleteItem = async (id: string) => {
    // Build a parent→children index once so collecting descendants is O(n) total
    // rather than O(n²) on a deep tree.
    const childrenByParent = new Map<string, string[]>();
    items.forEach(i => {
      if (!i.parent_id) return;
      const arr = childrenByParent.get(i.parent_id);
      if (arr) arr.push(i.id);
      else childrenByParent.set(i.parent_id, [i.id]);
    });
    const descendantIds = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      descendantIds.add(current);
      const kids = childrenByParent.get(current);
      if (kids) queue.push(...kids);
    }

    setItems(prev => prev.filter(i => !descendantIds.has(i.id)));
    if (descendantIds.has(selectedNoteId || '')) {
      setSelectedNoteId(null); selectedNoteIdRef.current = null;
      setCurrentContent(''); currentContentRef.current = ''; setHeadings([]);
    }

    try {
      await deleteItem(id);
    } catch (e) {
      console.error('Failed to delete item:', e);
      await loadItems();
    }
  };

  const handleRenameItem = async (id: string, newName: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, name: newName } : i));
    try {
      await updateItem(id, newName, undefined, undefined);
    } catch (e) {
      console.error('Failed to rename item:', e);
      await loadItems();
    }
  };

  const handleReorderItems = async (updates: [string, number][]) => {
    const updateMap = new Map(updates);
    setItems(prev => {
      const updated = prev.map(i => {
        const newOrder = updateMap.get(i.id);
        return newOrder !== undefined ? { ...i, sort_order: newOrder } : i;
      });
      return updated.sort((a, b) => a.sort_order - b.sort_order);
    });
    try {
      await reorderItems(updates);
    } catch (e) {
      console.error('Failed to reorder items:', e);
      await loadItems();
    }
  };

  // Keystrokes only mutate refs + schedule a save. Avoid setState here so the
  // App tree does not re-render on every character; headings refresh via
  // `onHeadingsChange` from the Editor's debounced render path.
  const handleContentUpdate = useCallback((content: string) => {
    currentContentRef.current = content;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const id = selectedNoteIdRef.current;
      if (id) updateItem(id, undefined, content, undefined);
    }, 1000);
  }, [updateItem]);

  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    const id = selectedNoteIdRef.current;
    if (id) updateItem(id, undefined, currentContentRef.current, undefined);
  }, [updateItem]);

  const selectedNote = selectedNoteId ? items.find((n) => n.id === selectedNoteId) : null;

  const modeBtnCls = (mode: ViewMode) =>
    `p-1.5 rounded-app-sm transition-colors duration-200 cursor-pointer ${
      viewMode === mode
        ? 'text-accent-light bg-accent/10'
        : 'text-app-text-muted hover:text-app-text-secondary hover:bg-app-elevated'
    }`;

  const tbBtnCls = 'p-1.5 rounded-app-sm transition-colors duration-200 text-app-text-muted hover:text-app-text hover:bg-accent/10 cursor-pointer';

  const handleImportSuccess = useCallback(async () => {
    setSelectedNoteId(null);
    selectedNoteIdRef.current = null;
    setCurrentContent('');
    currentContentRef.current = '';
    setHeadings([]);
    await loadItems();
  }, [loadItems]);

  return (
    <div className="flex h-full bg-app-bg text-app-text">
      {/* First-run language picker */}
      {isFirstRun && (
        <div className="fixed inset-0 bg-app-bg flex items-center justify-center z-[100]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-app-text mb-2">{t('welcomeTitle')}</h1>
            <p className="text-app-text-muted mb-8 text-sm">{t('welcomeDesc')}</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => completeFirstRun('zh')}
                className="px-8 py-3 bg-accent text-white rounded-app-md text-sm font-medium hover:bg-accent-hover transition-colors duration-200 cursor-pointer"
              >
                中文
              </button>
              <button
                onClick={() => completeFirstRun('en')}
                className="px-8 py-3 bg-app-elevated text-app-text-secondary rounded-app-md text-sm font-medium hover:bg-app-border hover:text-app-text transition-colors duration-200 cursor-pointer border border-app-border-subtle"
              >
                English
              </button>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        items={items}
        headings={headings}
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        onCreateNote={handleCreateNote}
        onCreateFolder={handleCreateFolder}
        onCreateDiary={handleCreateDiary}
        onDeleteItem={handleDeleteItem}
        onRenameItem={handleRenameItem}
        onSelectNote={handleSelectNote}
        onReorderItems={handleReorderItems}
        diariesWithNotes={diariesWithNotes}
        selectedNoteId={selectedNoteId}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-11 border-b border-app-border-subtle bg-app-sidebar/60 backdrop-blur-sm px-4 flex items-center gap-3 flex-shrink-0">
          {/* Left: current note title + markdown toolbar */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {selectedNote ? (
              <span className="flex items-center gap-2 text-sm font-medium text-app-text truncate max-w-[220px] flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                <span className="truncate">{selectedNote.name}</span>
              </span>
            ) : (
              <span className="text-sm text-app-text-muted select-none">{t('appName')}</span>
            )}
            {selectedNote && viewMode !== 'preview' && (
              <>
                <span className="w-px h-5 bg-app-border mx-1 flex-shrink-0" />
                <div className="flex items-center gap-0.5 min-w-0">
                <button type="button" title="Heading" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.prefixLine('## ')}><Heading2 size={14} /></button>
                <button type="button" title="Bold" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.wrapSelection('**', '**', 'bold')}><Bold size={14} /></button>
                <button type="button" title="Italic" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.wrapSelection('*', '*', 'italic')}><Italic size={14} /></button>
                <button type="button" title="Strikethrough" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.wrapSelection('~~', '~~', 'text')}><Strikethrough size={14} /></button>
                <span className="w-px h-4 bg-app-border mx-1" />
                <button type="button" title="Link" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.wrapSelection('[', '](url)', 'text')}><Link2 size={14} /></button>
                <button type="button" title="Quote" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.prefixLine('> ')}><Quote size={14} /></button>
                <button type="button" title="Code" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.wrapSelection('`', '`', 'code')}><Code size={14} /></button>
                <span className="w-px h-4 bg-app-border mx-1" />
                <button type="button" title="Bulleted list" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.prefixLine('- ')}><List size={14} /></button>
                <button type="button" title="Numbered list" className={tbBtnCls}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editorRef.current?.prefixLine('1. ')}><ListOrdered size={14} /></button>
                </div>
              </>
            )}
          </div>

          {/* Center-right: search */}
          <div className="relative w-56">
            <div className="flex items-center gap-2 bg-app-elevated border border-app-border-subtle focus-within:border-accent/40 rounded-app-md px-3 py-1.5 transition-colors duration-200">
              <Search size={13} className="text-app-text-muted flex-shrink-0" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (e.target.value.length < 2) setSearchResults([]); }}
                className="bg-transparent border-none outline-none text-sm w-full text-app-text-secondary placeholder-app-text-placeholder"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-app-text-muted hover:text-app-text text-xs leading-none cursor-pointer transition-colors">×</button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full right-0 mt-1.5 w-72 bg-app-elevated rounded-app-lg shadow-2xl border border-app-border max-h-72 overflow-y-auto z-50 backdrop-blur-xl">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => { handleSelectNote(result.id); setSearchQuery(''); setSearchResults([]); }}
                    className="p-3 hover:bg-accent/10 cursor-pointer border-b border-app-border-subtle last:border-b-0 transition-colors duration-150"
                  >
                    <div className="font-medium text-sm text-app-text">{result.name}</div>
                    <div className="text-xs text-app-text-muted mt-0.5 search-snippet" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: view mode + TOC + settings */}
          <div className="flex items-center gap-0.5">
            {selectedNote && (
              <>
                <button className={modeBtnCls('edit')} onClick={() => setViewMode('edit')} title="Edit"><Pencil size={15} /></button>
                <button className={modeBtnCls('split')} onClick={() => setViewMode('split')} title="Split"><Columns2 size={15} /></button>
                <button className={modeBtnCls('preview')} onClick={() => setViewMode('preview')} title="Preview"><Eye size={15} /></button>
                <span className="w-px h-4 bg-app-border mx-1" />
                {headings.length > 0 && (
                  <>
                    <button
                      onClick={() => setTocOpen((v) => !v)}
                      className={`p-1.5 rounded-app-sm transition-colors duration-200 cursor-pointer ${
                        tocOpen
                          ? 'text-accent-light bg-accent/10'
                          : 'text-app-text-muted hover:text-app-text-secondary hover:bg-app-elevated'
                      }`}
                      title={t('tocTitle')}
                    >
                      <List size={15} />
                    </button>
                    <span className="w-px h-4 bg-app-border mx-1" />
                  </>
                )}
              </>
            )}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-app-sm transition-colors duration-200 text-app-text-muted hover:text-app-text-secondary hover:bg-app-elevated cursor-pointer"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-app-sm transition-colors duration-200 text-app-text-muted hover:text-app-text-secondary hover:bg-app-elevated cursor-pointer"
              title={t('settings')}
            >
              <Settings2 size={15} />
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {selectedNote ? (
            <Editor
              ref={editorRef}
              content={currentContent}
              noteId={selectedNoteId}
              noteName={selectedNote.name}
              viewMode={viewMode}
              onUpdate={handleContentUpdate}
              onHeadingsChange={setHeadings}
              onSave={handleManualSave}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileText size={48} className="mx-auto text-app-text-muted/50 mb-4" />
                <p className="text-app-text-muted mb-5 text-sm">{t('noNoteSelected')}</p>
                <button onClick={() => handleCreateNote()} className="px-5 py-2 bg-accent text-white rounded-app-md text-sm font-medium hover:bg-accent-hover transition-colors duration-200 cursor-pointer">
                  {t('createNote')}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <TocOverlay
        headings={headings}
        open={tocOpen}
        onClose={() => setTocOpen(false)}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="fixed top-3 right-16 z-50 flex items-center gap-2 bg-app-elevated/95 backdrop-blur-sm rounded-full px-3 py-1.5 border border-app-border-subtle shadow-lg">
          <Loader2 size={14} className="text-accent animate-spin" />
          <span className="text-xs text-app-text-muted">Saving…</span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-950/95 backdrop-blur-sm text-red-200 text-sm px-4 py-2.5 rounded-app-md border border-red-800/40 shadow-xl max-w-md truncate">
          {error}
        </div>
      )}

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} onImportSuccess={handleImportSuccess} />
      )}
    </div>
  );
}

export default App;
