import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import { GripVertical, FileText } from 'lucide-react';

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
}

function SortableItem({ item, onDelete, onSelect, onContextMenu, selected, editingId, editingName, onStartEdit, onFinishEdit, onCancelEdit, onEditNameChange }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, item); }}
      className={`flex items-center gap-1.5 px-1 py-1 rounded group transition-colors ${
        selected ? 'bg-[#7c3aed]/20 text-white' : 'hover:bg-gray-700/60'
      }`}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical size={12} />
      </span>

      {/* Icon */}
      <FileText size={13} className="text-gray-400 flex-shrink-0" />

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
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-gray-600 text-sm text-white rounded px-1 outline-none min-w-0"
        />
      ) : (
        <button
          className="flex-1 text-sm text-left truncate text-gray-200 hover:text-white transition-colors"
          onClick={() => item.item_type === 'note' && onSelect?.(item.id)}
          onDoubleClick={() => onStartEdit?.(item.id, item.name)}
        >
          {item.name}
        </button>
      )}

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-0.5 flex-shrink-0 transition-opacity text-base leading-none"
        title="Delete"
      >
        ×
      </button>
    </div>
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
}

export function DragSortable({ items, onReorder, onDelete, onSelect, onContextMenu, selectedId, editingId, editingName, onStartEdit, onFinishEdit, onCancelEdit, onEditNameChange }: DragSortableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(items, oldIdx, newIdx);
    onReorder(reordered.map((item, idx) => [item.id, idx]));
  };

  if (!items.length) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
