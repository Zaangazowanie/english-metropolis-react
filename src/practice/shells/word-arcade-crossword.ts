export interface StreetCursor { r: number; c: number; dir: 'across' | 'down' }

type TimerHandle = ReturnType<typeof setTimeout>;
interface StreetTimers {
  set: (callback: () => void, delay: number) => TimerHandle;
  clear: (handle: TimerHandle) => void;
}

/** A celebratory pause must never override the learner's next deliberate action. */
export function createStreetAdvance(
  move: (cursor: StreetCursor) => void,
  timers: StreetTimers = { set: (callback, delay) => setTimeout(callback, delay), clear: handle => clearTimeout(handle) },
) {
  let pending: TimerHandle | null = null;
  let revision = 0;
  const cancel = () => {
    revision++;
    if (pending !== null) timers.clear(pending);
    pending = null;
  };
  return {
    cancel,
    schedule(cursor: StreetCursor) {
      cancel();
      const scheduledRevision = revision;
      pending = timers.set(() => {
        // A callback already queued by the browser can survive clearTimeout.
        if (scheduledRevision !== revision) return;
        pending = null;
        revision++;
        move(cursor);
      }, 550);
    },
  };
}
