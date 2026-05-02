import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts';
import type { Lang } from '../i18n';

interface SettingsProps {
  onClose: () => void;
  onImportSuccess: () => void;
}

export function Settings({ onClose, onImportSuccess }: SettingsProps) {
  const { lang, setLang, t } = useLanguage();

  const handleExport = async () => {
    try {
      const defaultName = `notekeep-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`;
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      await invoke('export_data_to_file', { path });
    } catch (e) {
      alert(`${t('exportFailed')}: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      if (!confirm(t('confirmImport'))) return;
      await invoke('import_data_from_file', { path: selected });
      alert(t('importSuccess'));
      onImportSuccess();
      onClose();
    } catch (err) {
      alert(`${t('importFailed')}: ${err}`);
    }
  };

  const handleBackup = async () => {
    try {
      const defaultName = `notekeep-backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.zip`;
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: 'NoteKeep Backup', extensions: ['zip'] }],
      });
      if (!path) return;
      await invoke('backup_database', { path });
      alert(t('backupSuccess'));
    } catch (e) {
      alert(`${t('backupFailed')}: ${e}`);
    }
  };

  const handleRestore = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'NoteKeep Backup', extensions: ['zip'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      if (!confirm(t('confirmRestore'))) return;
      await invoke('restore_database', { path: selected });
      // 进程会被 Rust 端 restart，理论上代码不会执行到这里
    } catch (err) {
      alert(`${t('restoreFailed')}: ${err}`);
    }
  };

  const buttonCls =
    'flex-1 py-1.5 rounded-lg text-sm bg-white/[0.04] text-gray-400 hover:text-gray-200 hover:bg-white/[0.07] transition-colors';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1e1e32] rounded-xl w-80 border border-gray-700/60 shadow-2xl overflow-hidden"
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

          {/* Full backup (zip) */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{t('fullBackup')}</p>
            <div className="flex gap-2">
              <button onClick={handleBackup} className={buttonCls}>
                {t('backupDatabase')}
              </button>
              <button onClick={handleRestore} className={buttonCls}>
                {t('restoreDatabase')}
              </button>
            </div>
          </div>

          {/* Incremental note sync (JSON merge) */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{t('incrementalSync')}</p>
            <div className="flex gap-2">
              <button onClick={handleExport} className={buttonCls}>
                {t('exportData')}
              </button>
              <button onClick={handleImport} className={buttonCls}>
                {t('importData')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
