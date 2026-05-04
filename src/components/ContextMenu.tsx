import { useEffect, useRef } from 'react';
import { useLanguage } from '../contexts';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  onRename?: () => void;
}

export function ContextMenu({ x, y, onClose, onAction, onRename }: ContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const items = [
    { label: t('newNoteMenu'), action: 'newNote' },
    { label: t('newFolderMenu'), action: 'newFolder' },
    { label: t('rename'), action: 'rename' },
    { label: t('delete'), action: 'delete', danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed bg-app-elevated rounded-app-md shadow-xl border border-app-border py-1 min-w-[160px] z-50 backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          onClick={() => {
            if (item.action === 'rename' && onRename) {
              onRename();
            } else {
              onAction(item.action);
            }
            onClose();
          }}
          className={`w-full px-4 py-2 text-left text-sm rounded-app-sm hover:bg-accent/10 transition-colors duration-150 cursor-pointer ${
            item.danger ? 'text-red-400 hover:bg-red-400/10' : 'text-app-text-secondary'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
