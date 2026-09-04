import { useEffect, useRef } from 'react';
import type { ArcadeEvent } from '../lib/arcade-events';
import { advanceCompletionLatch } from './action-arcade-logic.mjs';

/** The shell's all-rounds boundary, independent of persistence and review callbacks. */
export function useActionCompletion(
  completed: boolean,
  preview: boolean,
  emit: (event: ArcadeEvent) => void,
) {
  const announced = useRef(false);
  useEffect(() => {
    const next = advanceCompletionLatch(announced.current, completed, preview);
    announced.current = next.announced;
    if (next.emit) emit({ type: 'complete' });
  }, [completed, preview, emit]);
}
