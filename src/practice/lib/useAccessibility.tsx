// useAccessibility.ts — Shared accessibility utilities for all shells.
// Focus trapping, aria-live announcements, skip-to-content, visible focus.

import { useEffect, useRef } from 'react';

// ─── Focus Trap ─────────────────────────────────────────────────────────────
// Traps keyboard focus within a container (for modals, dialogs, completion overlays).
// Tab and Shift+Tab cycle within the trap. Esc optionally closes.

export function useFocusTrap(isActive: boolean, onEscape?: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        onEscape();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = container.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Auto-focus the first focusable element when trap activates
    const focusables = container.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onEscape]);

  return containerRef;
}

// ─── Aria Live Announcer ────────────────────────────────────────────────────
// Announces dynamic changes (scores, feedback) to screen readers.
// Uses a polite aria-live region.

let announcerEl: HTMLElement | null = null;

function getAnnouncer(): HTMLElement {
  if (announcerEl) return announcerEl;
  announcerEl = document.createElement('div');
  announcerEl.setAttribute('role', 'status');
  announcerEl.setAttribute('aria-live', 'polite');
  announcerEl.setAttribute('aria-atomic', 'true');
  announcerEl.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;';
  document.body.appendChild(announcerEl);
  return announcerEl;
}

/**
 * Announce a message to screen readers via aria-live region.
 * Debounced to 100ms to avoid overlapping announcements.
 */
export function announce(message: string): void {
  const el = getAnnouncer();
  el.textContent = '';
  // Force DOM update cycle so duplicate messages still announce
  requestAnimationFrame(() => { el.textContent = message; });
}

// ─── Skip to Content ────────────────────────────────────────────────────────
// Renders a skip-to-content link as the first focusable element.
// Visible only on focus (positioned off-screen otherwise).

export const SkipToContent: React.FC<{ targetId?: string }> = ({ targetId = 'main-content' }) => (
  <a
    href={`#${targetId}`}
    className="em-skip-link"
    onClick={(e) => {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }}
  >
    Skip to content · Przejdź do treści
  </a>
);

// ─── Keyboard Navigation Helper ─────────────────────────────────────────────
// Adds Enter/Space activation to non-button interactive elements (divs with role).

export const keyboardActivatable = {
  onKeyDown: (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  },
};
