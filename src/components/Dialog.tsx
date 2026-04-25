import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

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

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
            <X size={18} />
          </button>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#7c3aed]"
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
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="px-4 py-2 text-sm bg-[#7c3aed] text-white rounded hover:bg-[#6d28d9]"
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
