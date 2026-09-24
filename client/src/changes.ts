import { useEffect, useRef } from 'react';

export function emitChanges(topics: string[]) {
  window.dispatchEvent(new CustomEvent('aegitasks-change', { detail: topics }));
}

// Only mounted views listen. Batch bursts and defer background-tab reads until visible.
export function useChanges(topics: string[], refresh: () => void) {
  const callback = useRef(refresh);
  callback.current = refresh;
  const key = topics.join(',');
  useEffect(() => {
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (!dirty || document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        dirty = false;
        callback.current();
      }, 120);
    };
    const changed = (event: Event) => {
      const incoming = (event as CustomEvent<string[]>).detail;
      if (incoming.includes('all') || key.split(',').some((t) => incoming.includes(t))) {
        dirty = true;
        flush();
      }
    };
    window.addEventListener('aegitasks-change', changed);
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('aegitasks-change', changed);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [key]);
}
