import { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
  placeholder?: string;
  initialValue?: string;
}

export function Dialog({
  open,
  title,
  onClose,
  onConfirm,
  placeholder = '',
  initialValue = '',
}: DialogProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState(initialValue);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-app-overlay flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-app-elevated rounded-app-lg p-6 w-96 border border-app-border shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-app-text">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-app-surface rounded-app-sm text-app-text-muted hover:text-app-text transition-colors duration-150 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-app-surface rounded-app-sm px-3 py-2 text-sm text-app-text placeholder-app-text-placeholder outline-none focus:ring-2 focus:ring-accent/40 transition-shadow duration-200"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConfirm(value);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-app-text-muted hover:text-app-text transition-colors duration-150 cursor-pointer rounded-app-sm"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="px-4 py-2 text-sm bg-accent text-white rounded-app-md hover:bg-accent-hover transition-colors duration-200 cursor-pointer"
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
