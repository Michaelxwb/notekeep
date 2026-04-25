import { useState, useEffect, useCallback, useRef } from 'react';
import { useNotes } from './hooks/useNotes';
import type { NoteItem } from './hooks/useNotes';
import { Editor, getHeadings } from './components/Editor';
import type { EditorHandle, ViewMode } from './components/Editor';
import { Sidebar } from './components/Sidebar';
import { TableOfContents } from './components/TableOfContents';
import { Settings } from './components/Settings';
import { useLanguage } from './contexts/LanguageContext';
import { format } from 'date-fns';
import { FileText, Search, Pencil, Columns2, Eye, Settings2 } from 'lucide-react';

function App() {
  const { t, isFirstRun, completeFirstRun } = useLanguage();
  const {
    listAllItems, createItem, deleteItem, updateItem, searchItems,
    reorderItems, getItem,
  } = useNotes();

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
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentContentRef = useRef('');
  const selectedNoteIdRef = useRef<string | null>(null);
  const editorRef = useRef<EditorHandle>(null);

  const loadItems = useCallback(async () => {
    try {
      const result = await listAllItems();
      setItems(result);
      const dates = new Set(
        result.filter((i) => i.item_type === 'note' && i.date).map((i) => i.date as string)
      );
      setDiariesWithNotes(dates);
    } catch (e) {
      console.error('Failed to load items:', e);
    }
  }, [listAllItems]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try { setSearchResults(await searchItems(searchQuery)); }
      catch (e) { console.error('Search failed:', e); }
    }, 300);
    return () => clearTimeout(timer);
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
      if (note) { setCurrentContent(note.content); currentContentRef.current = note.content; setHeadings(getHeadings(note.content)); }
    } catch (e) {
      console.error('Failed to fetch note:', e);
      const fallback = items.find((n) => n.id === noteId);
      if (fallback) { setCurrentContent(fallback.content); currentContentRef.current = fallback.content; setHeadings(getHeadings(fallback.content)); }
    }
  }, [items, getItem, updateItem]);

  const handleCreateNote = async (parentId?: string) => {
    try {
      const newId = await createItem(parentId ?? null, 'New Note', 'note', undefined);
      await loadItems();
      setSelectedNoteId(newId); selectedNoteIdRef.current = newId;
      setCurrentContent(''); currentContentRef.current = ''; setHeadings([]);
    } catch (e) { console.error('Failed to create note:', e); }
  };

  const handleCreateDiary = async () => {
    try {
      const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
      const existing = items.find((i) => i.item_type === 'note' && i.date === dateStr);
      if (existing) { handleSelectNote(existing.id); return; }
      const newId = await createItem(null, `Diary ${dateStr}`, 'note', dateStr);
      await loadItems();
      setSelectedNoteId(newId); selectedNoteIdRef.current = newId;
      setCurrentContent(''); currentContentRef.current = ''; setHeadings([]);
    } catch (e) { console.error('Failed to create diary:', e); }
  };

  const handleCreateFolder = async (parentId?: string) => {
    try { await createItem(parentId ?? null, 'New Folder', 'folder'); await loadItems(); }
    catch (e) { console.error('Failed to create folder:', e); }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteItem(id);
      if (selectedNoteId === id) {
        setSelectedNoteId(null); selectedNoteIdRef.current = null;
        setCurrentContent(''); currentContentRef.current = ''; setHeadings([]);
      }
      await loadItems();
    } catch (e) { console.error('Failed to delete item:', e); }
  };

  const handleRenameItem = async (id: string, newName: string) => {
    try { await updateItem(id, newName, undefined, undefined); await loadItems(); }
    catch (e) { console.error('Failed to rename item:', e); }
  };

  const handleReorderItems = async (updates: [string, number][]) => {
    try { await reorderItems(updates); await loadItems(); }
    catch (e) { console.error('Failed to reorder items:', e); }
  };

  const handleContentUpdate = useCallback((content: string) => {
    setCurrentContent(content);
    currentContentRef.current = content;
    setHeadings(getHeadings(content));
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
    `p-1.5 rounded transition-colors ${
      viewMode === mode
        ? 'text-[#a78bfa]'
        : 'text-gray-600 hover:text-gray-300'
    }`;

  const handleImportSuccess = useCallback(async () => {
    setSelectedNoteId(null);
    selectedNoteIdRef.current = null;
    setCurrentContent('');
    currentContentRef.current = '';
    setHeadings([]);
    await loadItems();
  }, [loadItems]);

  return (
    <div className="flex h-full bg-[#1a1a2e] text-[#eaeaea]">
      {/* First-run language picker */}
      {isFirstRun && (
        <div className="fixed inset-0 bg-[#1a1a2e] flex items-center justify-center z-[100]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-100 mb-2">{t('welcomeTitle')}</h1>
            <p className="text-gray-500 mb-8 text-sm">{t('welcomeDesc')}</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => completeFirstRun('zh')}
                className="px-8 py-3 bg-[#7c3aed] text-white rounded-xl text-base font-medium hover:bg-[#6d28d9] transition-colors"
              >
                中文
              </button>
              <button
                onClick={() => completeFirstRun('en')}
                className="px-8 py-3 bg-white/[0.06] text-gray-200 rounded-xl text-base font-medium hover:bg-white/[0.10] transition-colors"
              >
                English
              </button>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        items={items}
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
        <header className="h-12 border-b border-gray-700/50 px-4 flex items-center gap-3 flex-shrink-0">
          {/* Left: current note title */}
          <div className="flex-1 min-w-0">
            {selectedNote ? (
              <span className="text-sm font-medium text-gray-300 truncate">{selectedNote.name}</span>
            ) : (
              <span className="text-sm text-gray-700 select-none">{t('appName')}</span>
            )}
          </div>

          {/* Center-right: search */}
          <div className="relative w-56">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
              <Search size={13} className="text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full text-gray-300 placeholder-gray-600"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-gray-500 hover:text-white text-xs leading-none">×</button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-72 bg-[#1e1e32] rounded-xl shadow-2xl border border-gray-700/60 max-h-72 overflow-y-auto z-50">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => { handleSelectNote(result.id); setSearchQuery(''); setSearchResults([]); }}
                    className="p-3 hover:bg-white/[0.04] cursor-pointer border-b border-gray-700/40 last:border-b-0"
                  >
                    <div className="font-medium text-sm text-gray-200">{result.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5 search-snippet" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: view mode + settings */}
          <div className="flex items-center gap-0.5">
            {selectedNote && (
              <>
                <button className={modeBtnCls('edit')} onClick={() => setViewMode('edit')} title="Edit"><Pencil size={15} /></button>
                <button className={modeBtnCls('split')} onClick={() => setViewMode('split')} title="Split"><Columns2 size={15} /></button>
                <button className={modeBtnCls('preview')} onClick={() => setViewMode('preview')} title="Preview"><Eye size={15} /></button>
                <span className="w-px h-4 bg-gray-700 mx-1" />
              </>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded transition-colors text-gray-600 hover:text-gray-300"
              title={t('settings')}
            >
              <Settings2 size={15} />
            </button>
          </div>
        </header>

        {selectedNote ? (
          <Editor
            ref={editorRef}
            content={currentContent}
            noteId={selectedNoteId}
            noteName={selectedNote.name}
            viewMode={viewMode}
            onUpdate={handleContentUpdate}
            onSave={handleManualSave}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText size={56} className="mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400 mb-4">{t('noNoteSelected')}</p>
              <button onClick={() => handleCreateNote()} className="px-4 py-2 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] transition-colors">
                {t('createNote')}
              </button>
            </div>
          </div>
        )}

        <TableOfContents headings={headings} />
      </main>

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} onImportSuccess={handleImportSuccess} />
      )}
    </div>
  );
}

export default App;
