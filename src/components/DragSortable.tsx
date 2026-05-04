import { memo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NoteItem } from '../hooks/useNotes';
import { GripVertical, FileText, ChevronRight, ChevronDown } from 'lucide-react';

interface SortableItemProps {
  item: NoteItem;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: NoteItem) => void;
  selected?: boolean;
  editingId?: string | null;
  editingName?: string;
  onStartEdit?: (id: string, name: string) => void;
  onFinishEdit?: (id: string, name: string) => void;
  onCancelEdit?: () => void;
  onEditNameChange?: (name: string) => void;
  onToggle?: (id: string) => void;
  expanded?: boolean;
  children?: React.ReactNode;
}

function SortableItemImpl({
  item, onDelete, onSelect, onContextMenu, selected,
  editingId, editingName, onStartEdit, onFinishEdit, onCancelEdit, onEditNameChange,
  onToggle, expanded, children,
}: SortableItemProps) {
  // `parentId` is read in the top-level onDragEnd to constrain reorder to siblings.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { parentId: item.parent_id ?? null } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // opacity 0 makes both row AND children invisible — DragOverlay takes over visually
    opacity: isDragging ? 0 : 1,
  };

  return (
    // setNodeRef wraps the entire block (row + children) so the transform
    // moves folder children together with their parent row during drag
    <div ref={setNodeRef} style={style}>
      <div
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, item); }}
        className={`flex items-center gap-1 px-1 py-1 rounded-app-sm group transition-colors duration-150 cursor-pointer ${
          selected ? 'bg-accent/10 text-app-text' : 'text-app-text-secondary hover:bg-app-elevated'
        }`}
      >
        {/* Drag handle — zero width until hover */}
        <span
          {...attributes}
          {...listeners}
          className="text-app-text-muted/40 hover:text-app-text-muted cursor-grab active:cursor-grabbing flex-shrink-0 touch-none overflow-hidden w-0 group-hover:w-3 transition-[width] duration-150"
        >
          <GripVertical size={12} />
        </span>

        {/* Toggle button (folder) or type icon (note) */}
        {item.item_type === 'folder' ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggle?.(item.id)}
            className="flex-shrink-0 text-accent hover:text-accent-light transition-colors duration-150 p-0 cursor-pointer"
            tabIndex={-1}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <FileText size={13} className="text-app-text-muted flex-shrink-0" />
        )}

        {/* Name */}
        {editingId === item.id ? (
          <input
            autoFocus
            value={editingName ?? item.name}
            onChange={(e) => onEditNameChange?.(e.target.value)}
            onBlur={() => onFinishEdit?.(item.id, editingName ?? item.name)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') onFinishEdit?.(item.id, editingName ?? item.name);
              if (e.key === 'Escape') onCancelEdit?.();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 bg-app-surface text-sm text-app-text rounded-app-sm px-1 outline-none focus:ring-2 focus:ring-accent/40 min-w-0"
          />
        ) : (
          <button
            className="flex-1 text-sm text-left truncate text-app-text-secondary hover:text-app-text transition-colors duration-150"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (item.item_type === 'folder') onToggle?.(item.id);
              else onSelect?.(item.id);
            }}
            onDoubleClick={() => onStartEdit?.(item.id, item.name)}
          >
            {item.name}
          </button>
        )}

        {/* Delete */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="opacity-0 group-hover:opacity-100 text-app-text-muted hover:text-red-400 px-0.5 flex-shrink-0 transition-opacity text-base leading-none cursor-pointer"
          title="Delete"
        >
          ×
        </button>
      </div>

      {/* Expanded children — inside the same transformed wrapper so they move with the row */}
      {children}
    </div>
  );
}

// Leaf rows (no children) skip re-render on unrelated state changes.
// Folder rows still re-render whenever `children` is a fresh ReactNode tree,
// but the cost is amortised because grandchildren below them stay memoised too.
export const SortableItem = memo(SortableItemImpl);

function countDescendants(id: string, map: Map<string, NoteItem[]>): number {
  const kids = map.get(id) ?? [];
  return kids.reduce((n, k) => n + 1 + countDescendants(k.id, map), 0);
}

interface SortableFolderContentProps {
  items: NoteItem[];
  childrenByParent: Map<string, NoteItem[]>;
  expandedFolders: Set<string>;
  onReorder: (items: [string, number][]) => void;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: NoteItem) => void;
  selectedId?: string | null;
  editingId?: string | null;
  editingName?: string;
  onStartEdit?: (id: string, name: string) => void;
  onFinishEdit?: (id: string, name: string) => void;
  onCancelEdit?: () => void;
  onEditNameChange?: (name: string) => void;
  onToggle?: (id: string) => void;
}

interface NestedSortableProps extends Omit<SortableFolderContentProps, 'onReorder'> {
  activeId: string | null;
}

// Recursive renderer: only carries SortableContext per sibling list.
// The single DndContext lives at the top in SortableFolderContent.
function NestedSortable({
  items, childrenByParent, expandedFolders, onDelete, onSelect, onContextMenu,
  selectedId, editingId, editingName, onStartEdit, onFinishEdit, onCancelEdit,
  onEditNameChange, onToggle, activeId,
}: NestedSortableProps) {
  if (!items.length) return null;
  return (
    <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isExpanded = expandedFolders.has(item.id);
          const isDraggingThis = item.id === activeId;
          const kids = isExpanded && !isDraggingThis && item.item_type === 'folder'
            ? (childrenByParent.get(item.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
            : [];

          return (
            <SortableItem
              key={item.id}
              item={item}
              onDelete={onDelete}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              selected={selectedId === item.id}
              editingId={editingId}
              editingName={editingName}
              onStartEdit={onStartEdit}
              onFinishEdit={onFinishEdit}
              onCancelEdit={onCancelEdit}
              onEditNameChange={onEditNameChange}
              onToggle={onToggle}
              expanded={isExpanded}
            >
              {kids.length > 0 && (
                <div className="ml-4 mt-0.5 border-l border-app-border-subtle pl-2">
                  <NestedSortable
                    items={kids}
                    childrenByParent={childrenByParent}
                    expandedFolders={expandedFolders}
                    onDelete={onDelete}
                    onSelect={onSelect}
                    onContextMenu={onContextMenu}
                    selectedId={selectedId}
                    editingId={editingId}
                    editingName={editingName}
                    onStartEdit={onStartEdit}
                    onFinishEdit={onFinishEdit}
                    onCancelEdit={onCancelEdit}
                    onEditNameChange={onEditNameChange}
                    onToggle={onToggle}
                    activeId={activeId}
                  />
                </div>
              )}
            </SortableItem>
          );
        })}
      </div>
    </SortableContext>
  );
}

export function SortableFolderContent({
  items, childrenByParent, expandedFolders, onReorder, onDelete, onSelect,
  onContextMenu, selectedId, editingId, editingName, onStartEdit, onFinishEdit,
  onCancelEdit, onEditNameChange, onToggle,
}: SortableFolderContentProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  // Reorder is constrained to a single sibling list (same parent_id).
  // We attached parentId via useSortable({ data }) on each row, so we can
  // recover the sibling list from `childrenByParent` (or `items` for root).
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeParent = (active.data.current as { parentId: string | null } | undefined)?.parentId ?? null;
    const overParent = (over.data.current as { parentId: string | null } | undefined)?.parentId ?? null;
    if (activeParent !== overParent) return;

    const siblings = activeParent === null
      ? items
      : (childrenByParent.get(activeParent) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const oldIdx = siblings.findIndex((i) => i.id === active.id);
    const newIdx = siblings.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(siblings, oldIdx, newIdx);
    onReorder(reordered.map((item, idx) => [item.id, idx]));
  };

  const findActive = (id: string): NoteItem | null => {
    if (!id) return null;
    const root = items.find((i) => i.id === id);
    if (root) return root;
    for (const arr of childrenByParent.values()) {
      const hit = arr.find((i) => i.id === id);
      if (hit) return hit;
    }
    return null;
  };
  const activeItem = activeId ? findActive(activeId) : null;

  if (!items.length) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <NestedSortable
        items={items}
        childrenByParent={childrenByParent}
        expandedFolders={expandedFolders}
        onDelete={onDelete}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
        selectedId={selectedId}
        editingId={editingId}
        editingName={editingName}
        onStartEdit={onStartEdit}
        onFinishEdit={onFinishEdit}
        onCancelEdit={onCancelEdit}
        onEditNameChange={onEditNameChange}
        onToggle={onToggle}
        activeId={activeId}
      />

      <DragOverlay>
        {activeItem ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-app-sm bg-app-elevated border border-accent/30 shadow-xl text-app-text text-sm backdrop-blur-xl">
            {activeItem.item_type === 'folder'
              ? <ChevronRight size={13} className="text-accent" />
              : <FileText size={13} className="text-app-text-muted" />}
            <span className="truncate max-w-[140px]">{activeItem.name}</span>
            {activeItem.item_type === 'folder' && (() => {
              const n = countDescendants(activeItem.id, childrenByParent);
              return n > 0 ? <span className="text-xs text-app-text-muted ml-1">+{n}</span> : null;
            })()}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface DragSortableProps {
  items: NoteItem[];
  onReorder: (items: [string, number][]) => void;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: NoteItem) => void;
  selectedId?: string | null;
  editingId?: string | null;
  editingName?: string;
  onStartEdit?: (id: string, name: string) => void;
  onFinishEdit?: (id: string, name: string) => void;
  onCancelEdit?: () => void;
  onEditNameChange?: (name: string) => void;
  onToggle?: (id: string) => void;
  expandedFolders?: Set<string>;
}

export function DragSortable({
  items, onReorder, onDelete, onSelect, onContextMenu, selectedId,
  editingId, editingName, onStartEdit, onFinishEdit, onCancelEdit, onEditNameChange,
  onToggle, expandedFolders,
}: DragSortableProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    onReorder(reordered.map((item, idx) => [item.id, idx]));
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  if (!items.length) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              onDelete={onDelete}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              selected={selectedId === item.id}
              editingId={editingId}
              editingName={editingName}
              onStartEdit={onStartEdit}
              onFinishEdit={onFinishEdit}
              onCancelEdit={onCancelEdit}
              onEditNameChange={onEditNameChange}
              onToggle={onToggle}
              expanded={expandedFolders?.has(item.id)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeItem ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-app-sm bg-app-elevated border border-accent/30 shadow-xl text-app-text text-sm backdrop-blur-xl">
            {activeItem.item_type === 'folder'
              ? <ChevronRight size={13} className="text-accent" />
              : <FileText size={13} className="text-app-text-muted" />}
            <span className="truncate max-w-[140px]">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
