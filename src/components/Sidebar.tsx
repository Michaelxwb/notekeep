import { useState, useMemo } from 'react';
import { DayPicker, useDayPicker, type MonthCaptionProps } from 'react-day-picker';
import { format } from 'date-fns';
import type { NoteItem } from '../hooks/useNotes';
import { ContextMenu } from './ContextMenu';
import { Dialog } from './Dialog';
import { SortableFolderContent } from './DragSortable';
import { useLanguage } from '../contexts';
import { Plus, Trash2, BookOpen, FolderPlus, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { TocContent } from './TableOfContents';
import type { Heading } from '../utils/headings';

function CalendarCaption({ calendarMonth }: MonthCaptionProps) {
  const { goToMonth, previousMonth, nextMonth } = useDayPicker();
  return (
    <div className="flex items-center justify-between px-1 mb-1">
      <button
        onClick={() => previousMonth && goToMonth(previousMonth)}
        disabled={!previousMonth}
        className="p-1 text-app-text-secondary hover:bg-app-elevated rounded-app-sm transition-colors duration-200 cursor-pointer disabled:opacity-30"
      >
        <ChevronLeft size={13} />
      </button>
      <span className="text-sm font-semibold text-app-text">
        {format(calendarMonth.date, 'MMMM yyyy')}
      </span>
      <button
        onClick={() => nextMonth && goToMonth(nextMonth)}
        disabled={!nextMonth}
        className="p-1 text-app-text-secondary hover:bg-app-elevated rounded-app-sm transition-colors duration-200 cursor-pointer disabled:opacity-30"
      >
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

interface SidebarProps {
  items: NoteItem[];
  headings: Heading[];
  selectedDate: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
  onCreateNote: (parentId?: string) => Promise<string | undefined>;
  onCreateFolder: (parentId?: string) => Promise<string | undefined>;
  onCreateDiary: () => void;
  onDeleteItem: (id: string) => void;
  onRenameItem: (id: string, newName: string) => void;
  onSelectNote: (id: string) => void;
  onReorderItems: (items: [string, number][]) => void;
  diariesWithNotes: Set<string>;
  selectedNoteId: string | null;
}

function loadExpandedFolders(): Set<string> {
  try {
    const saved = localStorage.getItem('notekeep:expandedFolders');
    return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpandedFolders(ids: Set<string>) {
  localStorage.setItem('notekeep:expandedFolders', JSON.stringify([...ids]));
}

export function Sidebar({
  items,
  headings,
  selectedDate,
  onDateSelect,
  onCreateNote,
  onCreateFolder,
  onCreateDiary,
  onDeleteItem,
  onRenameItem,
  onSelectNote,
  onReorderItems,
  diariesWithNotes,
  selectedNoteId,
}: SidebarProps) {
  const { t } = useLanguage();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(loadExpandedFolders);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: NoteItem } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'notes' | 'diary' | 'outline'>('notes');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const startEdit = (id: string, name: string) => { setEditingId(id); setEditingName(name); };
  const cancelEdit = () => setEditingId(null);
  const finishEdit = (id: string, name: string) => {
    if (name.trim()) onRenameItem(id, name.trim());
    setEditingId(null);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveExpandedFolders(next);
      return next;
    });
  };

  const openContextMenu = (e: React.MouseEvent, item?: NoteItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (item) setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const hasNotesDates = useMemo(
    () => Array.from(diariesWithNotes).map((d) => new Date(d + 'T00:00:00')),
    [diariesWithNotes]
  );

  // Pre-compute child map: single O(n) pass instead of per-folder .filter() calls
  const childrenByParent = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    for (const item of items) {
      if (item.parent_id) {
        const siblings = map.get(item.parent_id);
        if (siblings) siblings.push(item);
        else map.set(item.parent_id, [item]);
      }
    }
    return map;
  }, [items]);

  const rootFolders = useMemo(() => items.filter((i) => i.item_type === 'folder' && !i.parent_id), [items]);
  const rootNotes = useMemo(
    () => items.filter((i) => i.item_type === 'note' && !i.parent_id && !i.date),
    [items]
  );

  const allRootItems = useMemo(() => {
    const all = [...rootNotes, ...rootFolders];
    all.sort((a, b) => a.sort_order - b.sort_order);
    return all;
  }, [rootNotes, rootFolders]);

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Single pass: collect entries, group by date, group by month.
  // Sort entries once; per-month/date arrays inherit that order.
  const { allDiaryByDate, diaryMonthGroups } = useMemo(() => {
    const entries: NoteItem[] = [];
    items.forEach((i) => {
      if (i.item_type === 'note' && i.date) entries.push(i);
    });
    entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    const byDate = new Map<string, NoteItem[]>();
    const byMonth = new Map<string, NoteItem[]>();
    entries.forEach((e) => {
      const date = e.date!;
      const dateBucket = byDate.get(date);
      if (dateBucket) dateBucket.push(e);
      else byDate.set(date, [e]);

      const month = date.slice(0, 7);
      const monthBucket = byMonth.get(month);
      if (monthBucket) monthBucket.push(e);
      else byMonth.set(month, [e]);
    });
    return { allDiaryByDate: byDate, diaryMonthGroups: byMonth };
  }, [items]);

  return (
    <aside className="w-64 border-r border-app-border-subtle flex flex-col h-full bg-app-sidebar select-none">

      {/* ── Tab header ──────────────────────────────────── */}
      <div className="h-11 border-b border-app-border-subtle flex items-center px-3 gap-1 flex-shrink-0">
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-app-sm text-xs font-medium transition-colors duration-200 cursor-pointer ${
            activeTab === 'notes' ? 'bg-accent/10 text-app-text' : 'text-app-text-muted hover:text-app-text-secondary'
          }`}
        >
          {t('notes')}
        </button>
        <button
          onClick={() => setActiveTab('diary')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-app-sm text-xs font-medium transition-colors duration-200 cursor-pointer ${
            activeTab === 'diary' ? 'bg-accent/10 text-app-text' : 'text-app-text-muted hover:text-app-text-secondary'
          }`}
        >
          <BookOpen size={11} />
          {t('diary')}
        </button>
        {headings.length > 0 && (
          <button
            onClick={() => setActiveTab('outline')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-app-sm text-xs font-medium transition-colors duration-200 cursor-pointer ${
              activeTab === 'outline' ? 'bg-accent/10 text-app-text' : 'text-app-text-muted hover:text-app-text-secondary'
            }`}
          >
            <List size={11} />
            {t('tocTitle')}
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {activeTab === 'notes' && <>
            <button onClick={() => onCreateFolder()} className="p-1 text-app-text-muted hover:text-app-text hover:bg-app-elevated rounded-app-sm transition-colors duration-200 cursor-pointer" title="New Folder"><FolderPlus size={12} /></button>
            <button onClick={() => onCreateNote()} className="p-1 text-app-text-muted hover:text-app-text hover:bg-app-elevated rounded-app-sm transition-colors duration-200 cursor-pointer" title="New Note"><Plus size={12} /></button>
          </>}
          {activeTab === 'diary' && (() => {
            const targetDate = selectedDateStr ?? format(new Date(), 'yyyy-MM-dd');
            const alreadyExists = allDiaryByDate.has(targetDate);
            const label = targetDate === format(new Date(), 'yyyy-MM-dd') ? t('today') : targetDate;
            return (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-app-text-muted tabular-nums">{label}</span>
                <button
                  onClick={onCreateDiary}
                  disabled={alreadyExists}
                  className={`p-1 rounded-app-sm transition-colors duration-200 ${alreadyExists ? 'text-app-text-muted/40 cursor-not-allowed' : 'text-app-text-muted hover:text-app-text hover:bg-app-elevated cursor-pointer'}`}
                  title={alreadyExists ? t('entryExists') : t('newDiary')}
                >
                  <Plus size={12} />
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Notes tab ───────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div className="flex-1 overflow-auto">
          <div className="px-2 py-2 min-w-max">
            <SortableFolderContent
              items={allRootItems}
              childrenByParent={childrenByParent}
              expandedFolders={expandedFolders}
              onReorder={onReorderItems}
              onDelete={(id) => setDeleteConfirm(id)}
              onContextMenu={openContextMenu}
              onSelect={onSelectNote}
              selectedId={selectedNoteId}
              editingId={editingId}
              editingName={editingName}
              onStartEdit={startEdit}
              onFinishEdit={finishEdit}
              onCancelEdit={cancelEdit}
              onEditNameChange={setEditingName}
              onToggle={toggleFolder}
            />
            {allRootItems.length === 0 && (
              <p className="text-xs text-app-text-muted/60 px-1 py-2">{t('noNotes')}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Diary tab ───────────────────────────────────── */}
      {activeTab === 'diary' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <button
            onClick={() => setCalendarOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-app-text-muted hover:text-app-text-secondary uppercase tracking-wider transition-colors duration-200 flex-shrink-0 border-b border-app-border-subtle cursor-pointer"
          >
            <BookOpen size={10} />
            {t('calendar')}
            <span className="ml-auto">{calendarOpen ? '▾' : '▸'}</span>
          </button>

          {calendarOpen && (
            <div className="px-2 pb-1 flex-shrink-0 border-b border-app-border-subtle">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={onDateSelect}
                className="calendar-center"
                modifiers={{ hasNotes: hasNotesDates }}
                modifiersClassNames={{ hasNotes: 'day-has-notes' }}
                components={{ MonthCaption: CalendarCaption }}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            {diaryMonthGroups.size === 0 && (
              <p className="text-xs text-app-text-muted/60 px-1 py-1">{t('noDiary')}</p>
            )}
            {Array.from(diaryMonthGroups.entries()).map(([month, entries]) => (
              <div key={month}>
                <div className="text-[10px] text-app-text-muted uppercase tracking-wider font-medium px-1 mb-1">
                  {format(new Date(month + '-01'), 'MMMM yyyy')}
                </div>
                <div className="space-y-0.5">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-app-sm transition-colors duration-150 group cursor-pointer ${
                        selectedNoteId === entry.id ? 'bg-accent/10 text-app-text' : 'text-app-text-secondary hover:bg-app-elevated hover:text-app-text'
                      }`}
                      onClick={() => editingId !== entry.id && onSelectNote(entry.id)}
                      onContextMenu={(e) => openContextMenu(e, entry)}
                    >
                      <span className="text-[11px] text-app-text-muted w-5 text-center flex-shrink-0 tabular-nums">
                        {entry.date?.slice(8)}
                      </span>
                      {editingId === entry.id ? (
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => finishEdit(entry.id, editingName)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') finishEdit(entry.id, editingName);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-app-surface text-sm text-app-text rounded-app-sm px-1 outline-none focus:ring-2 focus:ring-accent/40 min-w-0"
                        />
                      ) : (
                        <span
                          className="flex-1 text-sm truncate"
                          onDoubleClick={(e) => { e.stopPropagation(); startEdit(entry.id, entry.name); }}
                        >
                          {entry.name}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(entry.id); }}
                        className="opacity-0 group-hover:opacity-100 text-app-text-muted hover:text-red-400 transition-opacity flex-shrink-0 cursor-pointer"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Outline tab ──────────────────────────────────── */}
      {activeTab === 'outline' && (
        <div className="flex-1 overflow-y-auto">
          <TocContent headings={headings} active={activeTab === 'outline'} />
        </div>
      )}

      {/* ── Context menu ─────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAction={async (action) => {
            if (action === 'newNote') {
              const ctx = contextMenu.item;
              const parentId = ctx.item_type === 'folder' ? ctx.id : ctx.parent_id;
              if (parentId) {
                setExpandedFolders(prev => { const next = new Set(prev); next.add(parentId); saveExpandedFolders(next); return next; });
              }
              const newId = await onCreateNote(parentId ?? undefined);
              if (newId) startEdit(newId, 'New Note');
            } else if (action === 'newFolder') {
              const ctx = contextMenu.item;
              const parentId = ctx.item_type === 'folder' ? ctx.id : ctx.parent_id;
              if (parentId) {
                setExpandedFolders(prev => { const next = new Set(prev); next.add(parentId); saveExpandedFolders(next); return next; });
              }
              const newId = await onCreateFolder(parentId ?? undefined);
              if (newId) startEdit(newId, 'New Folder');
            } else if (action === 'delete') setDeleteConfirm(contextMenu.item.id);
          }}
          onRename={() => setRenameDialog({ id: contextMenu.item.id, name: contextMenu.item.name })}
        />
      )}

      {/* ── Rename dialog ─────────────────────────────────── */}
      <Dialog
        key={renameDialog?.id ?? 'closed'}
        open={!!renameDialog}
        title={t('rename')}
        initialValue={renameDialog?.name ?? ''}
        onClose={() => setRenameDialog(null)}
        onConfirm={(value) => {
          if (renameDialog) { onRenameItem(renameDialog.id, value); setRenameDialog(null); }
        }}
        placeholder={t('rename')}
      />

      {/* ── Delete confirmation ──────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-app-elevated rounded-app-lg p-5 w-72 border border-app-border shadow-2xl">
            <h3 className="text-sm font-semibold text-app-text mb-2">{t('deleteTitle')}</h3>
            <p className="text-app-text-muted text-xs mb-5">{t('deleteDesc')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-xs text-app-text-muted hover:text-app-text transition-colors duration-150 cursor-pointer rounded-app-sm">
                {t('cancel')}
              </button>
              <button
                onClick={() => { onDeleteItem(deleteConfirm); setDeleteConfirm(null); }}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-app-md hover:bg-red-700 transition-colors duration-150 cursor-pointer"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
