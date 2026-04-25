import { useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Lang } from '../i18n';

interface SettingsProps {
  onClose: () => void;
  onImportSuccess: () => void;
}

export function Settings({ onClose, onImportSuccess }: SettingsProps) {
  const { lang, setLang, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const json = await invoke<string>('export_data');
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notekeep-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`${t('exportFailed')}: ${e}`);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(t('confirmImport'))) { e.target.value = ''; return; }
    try {
      const text = await file.text();
      await invoke('import_data', { data: text });
      alert(t('importSuccess'));
      onImportSuccess();
      onClose();
    } catch (err) {
      alert(`${t('importFailed')}: ${err}`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1e1e32] rounded-xl w-76 border border-gray-700/60 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/40">
          <span className="text-sm font-semibold text-gray-200">{t('settings')}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-0.5 rounded">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Language */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{t('language')}</p>
            <div className="flex gap-2">
              {(['zh', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`flex-1 py-1.5 rounded-lg text-sm transition-colors ${
                    lang === l
                      ? 'bg-[#7c3aed] text-white'
                      : 'bg-white/[0.04] text-gray-400 hover:text-gray-200 hover:bg-white/[0.07]'
                  }`}
                >
                  {l === 'zh' ? t('chinese') : t('english')}
                </button>
              ))}
            </div>
          </div>

          {/* Data */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{t('data')}</p>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex-1 py-1.5 rounded-lg text-sm bg-white/[0.04] text-gray-400 hover:text-gray-200 hover:bg-white/[0.07] transition-colors"
              >
                {t('exportData')}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-1.5 rounded-lg text-sm bg-white/[0.04] text-gray-400 hover:text-gray-200 hover:bg-white/[0.07] transition-colors"
              >
                {t('importData')}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
