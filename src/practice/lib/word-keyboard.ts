type ShortcutEvent = {
  defaultPrevented: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
  target: EventTarget | null;
};

/** Letter shortcuts belong to the game, never an editor or a browser command. */
export function acceptsWordShortcut(event: ShortcutEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.nativeEvent?.isComposing) return false;
  const target = event.target as HTMLElement | null;
  return !target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

/** Enter on an existing control must retain that control's native activation. */
export function hasNativeActivation(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('button, a[href], summary, [role="button"], [role="gridcell"]');
}
