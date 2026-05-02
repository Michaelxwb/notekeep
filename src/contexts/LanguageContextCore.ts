import { createContext } from 'react';
import type { Lang, TranslationKey } from '../i18n';

export interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
  isFirstRun: boolean;
  completeFirstRun: (lang: Lang) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
