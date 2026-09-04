import { useCallback, useEffect, useRef } from 'react';
export function useActionTimers() {
  const timers = useRef(new Set<number>());
  const cancel = useCallback(() => { timers.current.forEach(window.clearTimeout); timers.current.clear(); }, []);
  const later = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(() => { timers.current.delete(id); callback(); }, delay);
    timers.current.add(id); return id;
  }, []);
  useEffect(() => cancel, [cancel]);
  return { later, cancel };
}
