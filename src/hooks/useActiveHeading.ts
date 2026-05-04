import { useEffect, useRef, useState } from 'react';
import type { Heading } from '../utils/headings';

export function useActiveHeading(headings: Heading[], active: boolean) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!active || !headings.length) { observerRef.current?.disconnect(); return; }
    const raf = requestAnimationFrame(() => {
      const editorEl = document.querySelector('.note-preview');
      if (!editorEl) return;
      const els = editorEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
      if (!els.length) return;
      observerRef.current?.disconnect();
      const visibleSet = new Set<string>();
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            const t = e.target.textContent?.trim() ?? '';
            if (e.isIntersecting) { visibleSet.add(t); } else { visibleSet.delete(t); }
          });
          for (const el of Array.from(els)) {
            const t = el.textContent?.trim() ?? '';
            if (visibleSet.has(t)) { setActiveId(t); return; }
          }
        },
        { root: editorEl, rootMargin: '-15% 0px -65% 0px', threshold: 0 }
      );
      els.forEach((el) => observer.observe(el));
      observerRef.current = observer;
    });
    return () => { cancelAnimationFrame(raf); observerRef.current?.disconnect(); };
  }, [headings, active]);

  return activeId;
}
