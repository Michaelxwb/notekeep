import { useState } from 'react';
import { List, X } from 'lucide-react';
import { useLanguage } from '../contexts';

interface Heading {
  level: number;
  text: string;
  id: string;
}

interface TableOfContentsProps {
  headings: Heading[];
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  if (!headings.length) return null;

  const scrollTo = (text: string) => {
    const editorEl = document.querySelector('.note-preview');
    if (!editorEl) return;
    for (const node of editorEl.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      if (node.textContent?.trim() === text) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  };

  return (
    <>
      {/* Toggle button — always visible when headings exist */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed right-4 bottom-6 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs shadow-lg border transition-colors ${
          open
            ? 'bg-[#7c3aed] text-white border-[#7c3aed]'
            : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white hover:border-gray-500'
        }`}
        title={t('tocOnThisPage')}
      >
        <List size={13} />
        {t('tocTitle')}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed right-4 bottom-16 z-40 w-52 bg-gray-800 rounded-lg shadow-xl border border-gray-700 flex flex-col"
          style={{ maxHeight: '60vh' }}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">{t('tocOnThisPage')}</span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-200 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
          <nav className="overflow-y-auto px-3 pb-3 space-y-0.5">
            {headings.map((h, i) => {
              const lvl = Math.min(h.level, 4);
              const styleByLevel: Record<number, string> = {
                1: 'text-sm font-semibold text-gray-100',
                2: 'text-sm text-gray-300',
                3: 'text-xs text-gray-400',
                4: 'text-xs text-gray-500',
              };
              return (
                <button
                  key={i}
                  onClick={() => scrollTo(h.text)}
                  className={`relative block w-full text-left py-1 hover:text-[#a78bfa] truncate transition-colors rounded pr-1 hover:bg-gray-700/50 ${styleByLevel[lvl]}`}
                  style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                  title={h.text}
                >
                  {h.level > 1 && (
                    <span
                      aria-hidden
                      className="absolute top-0 bottom-0 w-px bg-gray-700/60"
                      style={{ left: `${(h.level - 1) * 12}px` }}
                    />
                  )}
                  {h.text}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
