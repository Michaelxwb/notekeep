import { createContext, useContext, useState, type ReactNode } from 'react';
import { translations, type Lang, type TranslationKey } from '../i18n';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
  isFirstRun: boolean;
  completeFirstRun: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

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

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
