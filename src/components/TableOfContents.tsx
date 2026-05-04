import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts';
import { useActiveHeading } from '../hooks/useActiveHeading';
import type { Heading } from '../utils/headings';

/* ─── Scroll helper ──────────────────────────────────────────── */

function scrollToHeading(text: string) {
  const editorEl = document.querySelector('.note-preview');
  if (!editorEl) return;
  for (const node of editorEl.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (node.textContent?.trim() === text) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
  }
}

/* ─── Shared heading list ────────────────────────────────────── */

function HeadingList({ headings, activeId, onClick }: {
  headings: Heading[];
  activeId: string | null;
  onClick: (text: string) => void;
}) {
  return (
    <nav className="space-y-0.5">
      {headings.map((h, i) => {
        const lvl = Math.min(h.level, 4);
        const isActive = h.text === activeId;
        const base = 'relative block w-full text-left py-1 truncate transition-colors duration-150 rounded-app-sm pr-1 cursor-pointer';
        const style = isActive
          ? 'text-accent-light bg-accent/10 font-medium'
          : lvl === 1 ? 'text-sm font-semibold text-app-text hover:text-accent-light hover:bg-accent/5'
          : lvl === 2 ? 'text-sm text-app-text-secondary hover:text-accent-light hover:bg-accent/5'
          : lvl === 3 ? 'text-xs text-app-text-muted hover:text-accent-light hover:bg-accent/5'
          : 'text-xs text-app-text-muted/70 hover:text-accent-light hover:bg-accent/5';
        return (
          <button
            key={i}
            onClick={() => onClick(h.text)}
            className={`${base} ${style}`}
            style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
            title={h.text}
          >
            {h.level > 1 && (
              <span aria-hidden
                className={`absolute top-0 bottom-0 w-px ${isActive ? 'bg-accent/50' : 'bg-app-border-subtle'}`}
                style={{ left: `${(h.level - 1) * 12}px` }}
              />
            )}
            {h.text}
          </button>
        );
      })}
    </nav>
  );
}

/* ─── TocContent — for embedding in sidebar etc. ────────────── */

interface TocContentProps {
  headings: Heading[];
  active: boolean;
}

export function TocContent({ headings, active }: TocContentProps) {
  const activeId = useActiveHeading(headings, active);

  if (!headings.length) {
    return <p className="text-xs text-app-text-muted/60 px-3 py-4">{/* empty */}</p>;
  }

  return (
    <div className="p-2">
      <HeadingList headings={headings} activeId={activeId} onClick={scrollToHeading} />
    </div>
  );
}

/* ─── TocOverlay — floating panel via portal ────────────────── */

interface TocOverlayProps {
  headings: Heading[];
  open: boolean;
  onClose: () => void;
}

export function TocOverlay({ headings, open, onClose }: TocOverlayProps) {
  const { t } = useLanguage();
  const activeId = useActiveHeading(headings, open);

  if (!open || !headings.length) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed right-4 top-12 z-[9999] w-56 bg-app-elevated rounded-app-lg shadow-xl border border-app-border flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(60vh, 480px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-app-border-subtle">
          <span className="text-[10px] text-app-text-muted uppercase tracking-widest font-medium select-none">{t('tocTitle')}</span>
          <button
            onClick={onClose}
            className="text-app-text-muted hover:text-app-text transition-colors duration-150 cursor-pointer p-0.5 rounded-app-sm"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <HeadingList headings={headings} activeId={activeId} onClick={(text) => { scrollToHeading(text); }} />
        </div>
      </div>
    </>,
    document.body
  );
}
