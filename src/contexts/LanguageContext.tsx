import { useState, type ReactNode } from 'react';
import { translations, type Lang, type TranslationKey } from '../i18n';
import { LanguageContext } from './LanguageContextCore';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const stored = localStorage.getItem('notekeep:language') as Lang | null;
  const [lang, setLangState] = useState<Lang>(stored ?? 'zh');
  const [isFirstRun, setIsFirstRun] = useState(!stored);

  const setLang = (l: Lang) => {
    localStorage.setItem('notekeep:language', l);
    setLangState(l);
  };

  const completeFirstRun = (l: Lang) => {
    setLang(l);
    setIsFirstRun(false);
  };

  const t = (key: TranslationKey): string => translations[lang][key];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isFirstRun, completeFirstRun }}>
      {children}
    </LanguageContext.Provider>
  );
}

LanguageContext.displayName = 'LanguageContext';