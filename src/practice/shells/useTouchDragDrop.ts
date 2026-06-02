// Touch fallback for HTML5 drag-and-drop.
// HTML5 DnD does NOT fire dragstart/dragover/drop reliably on iOS Safari and many
// touch browsers. This hook simulates the same lifecycle by listening for
// touchstart/touchmove/touchend on the source element and using
// document.elementFromPoint() to discover which drop target (if any) is under
// the finger at touchend.
//
// Drop zones must declare themselves with a `data-dnd-drop-id` attribute. The
// source element passes its own id and an `onDrop(zoneId, sourceId)` callback.
// Visual hover feedback during the touch drag is delivered via the optional
// onHoverChange callback so the parent can highlight the active zone the same
// way it would for `onDragEnter`/`onDragLeave`.
//
// This module also exports `dropZoneProps` — a tiny helper to attach the
// data-dnd-drop-id attribute consistently across both shells.

import { useCallback, useEffect, useRef } from 'react';

export interface UseTouchDragDropOptions {
  /** Called when the user lifts their finger over a registered drop zone. */
  onDrop: (zoneId: string, sourceId: string) => void;
  /** Called when the finger enters or leaves any registered drop zone. */
  onHoverChange?: (zoneId: string | null, sourceId: string) => void;
  /** Called when the touch interaction starts. */
  onDragStart?: (sourceId: string) => void;
  /** Called when the touch interaction ends regardless of drop success. */
  onDragEnd?: (sourceId: string) => void;
}

export interface TouchDragHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
}

const findDropZone = (x: number, y: number): string | null => {
  // Walk up from the topmost element under the finger looking for a drop id.
  let el: Element | null = document.elementFromPoint(x, y);
  while (el) {
    const id = (el as HTMLElement).getAttribute?.('data-dnd-drop-id');
    if (id) return id;
    el = el.parentElement;
  }
  return null;
};

export const useTouchDragDrop = (opts: UseTouchDragDropOptions) => {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const activeRef = useRef<{ sourceId: string | null; lastZone: string | null }>({
    sourceId: null,
    lastZone: null,
  });

  // Bind handlers so we don't recreate them per render.
  const getHandlers = useCallback((sourceId: string): TouchDragHandlers => ({
    onTouchStart: (e) => {
      activeRef.current.sourceId = sourceId;
      activeRef.current.lastZone = null;
      optsRef.current.onDragStart?.(sourceId);
      // Don't preventDefault here — letting the browser keep the touch alive
      // so the move/end events still fire.
      e.stopPropagation();
    },
    onTouchMove: (e) => {
      if (activeRef.current.sourceId !== sourceId) return;
      const t = e.touches[0];
      if (!t) return;
      // Prevent the page from scrolling while dragging a tile.
      e.preventDefault();
      const zone = findDropZone(t.clientX, t.clientY);
      if (zone !== activeRef.current.lastZone) {
        activeRef.current.lastZone = zone;
        optsRef.current.onHoverChange?.(zone, sourceId);
      }
    },
    onTouchEnd: (e) => {
      if (activeRef.current.sourceId !== sourceId) return;
      const t = e.changedTouches[0];
      const zone = t ? findDropZone(t.clientX, t.clientY) : null;
      if (zone) optsRef.current.onDrop(zone, sourceId);
      optsRef.current.onHoverChange?.(null, sourceId);
      optsRef.current.onDragEnd?.(sourceId);
      activeRef.current.sourceId = null;
      activeRef.current.lastZone = null;
    },
    onTouchCancel: () => {
      if (activeRef.current.sourceId !== sourceId) return;
      optsRef.current.onHoverChange?.(null, sourceId);
      optsRef.current.onDragEnd?.(sourceId);
      activeRef.current.sourceId = null;
      activeRef.current.lastZone = null;
    },
  }), []);

  // Cleanup on unmount.
  useEffect(() => () => {
    activeRef.current.sourceId = null;
    activeRef.current.lastZone = null;
  }, []);

  return getHandlers;
};

/** Helper to mark a JSX element as a drop zone discoverable by useTouchDragDrop. */
export const dropZoneProps = (zoneId: string) => ({ 'data-dnd-drop-id': zoneId });
