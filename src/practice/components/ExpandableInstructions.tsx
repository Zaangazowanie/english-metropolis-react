// ExpandableInstructions — Bajla speech-bubble tutorial.
//
// REDESIGN 2026-05-02 (Mike's punch list):
//   "Tutorial guides look ugly and only take up an irregular segment of the
//    screen. They must appear like speech bubble from Bajla and be easy to
//    remove and they shouldn't mess up the layout already existing on the
//    shells. on some of the shells the layout has been completely fucked up
//    because of the tutorials."
//
// New shape:
//   • The component renders an inline "📖 Show full instructions" trigger
//     (and the optional pulsing 🎓 badge) — these are tiny and laid out
//     inside the existing shell column, so they don't displace anything.
//   • The big tutorial panel is no longer a flex sibling that pushes the
//     play area around. Instead it renders via React portal as a
//     position:fixed speech-bubble anchored to the bottom corner of the
//     viewport (so it visually emanates from Bajla, who lives in the lower
//     hint card on every shell). Tail points down toward Bajla.
//   • Tap-to-dismiss anywhere via close ✕ in the bubble's top-right.
//   • Auto-expand once per session (sessionStorage flag preserved).
//   • Bubble is scrollable, max-width 360px desktop / 280px mobile, capped
//     to 70vh so it never overflows the screen.
//
// A11y:
//   • trigger gets aria-expanded + aria-controls
//   • bubble is role="dialog" + aria-modal="false" + aria-label
//   • on auto-expand, focus shifts to the bubble's close button
//   • ESC closes when open + restores focus to the trigger
//   • all string content is bilingual EN+PL

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────
// Public types (unchanged — every shell already populates these)
// ─────────────────────────────────────────────────────────────
export interface BilingualString {
  en: string;
  pl: string;
}

export interface BilingualBullets {
  en: string[];
  pl: string[];
}

export interface FullInstructions {
  /** 3–5 bullets — the mechanic walkthrough. */
  whatYouDo: BilingualBullets;
  /** Every visible element labeled (slots, keyboard, lives, hint, skip…). */
  controls: BilingualBullets;
  /** Explicit consequence rules for right / wrong / skip actions. */
  rightWrongSkip: BilingualBullets;
  /** Hint button budget + when to use. */
  hintMechanic: BilingualString;
  /** Does Skip count? Does completing all unlock anything? */
  scoring: BilingualString;
  /** Optional Polish-transfer footnote. Renders the small PATTERN chip. */
  l1Pattern?: BilingualString;
}

export interface ExpandableInstructionsProps {
  /** e.g. 'crossword' — kept for analytics/debug parity. */
  shellKey: string;
  /** The existing 1–2 sentence Bajla card text (recap header inside the bubble). */
  bajlaCard: BilingualString;
  fullInstructions: FullInstructions;
  /** Default true; suppressed for any shell whose tutorial flag has been set. */
  autoExpandOnFirstEntry?: boolean;
}

// ─────────────────────────────────────────────────────────────
// sessionStorage helpers — wrapped in try/catch because the bubble must work
// in SSR / private-mode / quota-exhausted browsers (Aleksandra reported quota
// errors on her school iPad).
//
// Per Mike + CD 2026-05-02: this is a SESSION flag, not a per-shell flag.
// sessionStorage auto-clears on tab close, and we treat page reload as a new
// session by reading on each mount.
// ─────────────────────────────────────────────────────────────
const SESSION_KEY = 'em.tutorialShownThisSession';

const hasShownThisSession = (): boolean => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
};

const markShownThisSession = (): void => {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* swallow — worst case the bubble auto-pops on the next shell too */
  }
};

// ─────────────────────────────────────────────────────────────
// Bilingual section block — EN top / PL bottom, single column inside the
// narrow bubble (no two-column grid: bubble is too narrow at 360px to split).
// ─────────────────────────────────────────────────────────────
interface SectionProps {
  titleEn: string;
  titlePl: string;
  bullets?: BilingualBullets;
  body?: BilingualString;
}

const Section: React.FC<SectionProps> = ({ titleEn, titlePl, bullets, body }) => (
  <section
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '10px 12px',
      background: 'rgba(167,139,250,0.08)',
      border: '1px solid rgba(167,139,250,0.20)',
      borderRadius: 10,
    }}
  >
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'baseline',
        fontFamily: 'var(--em-mono, monospace)',
        fontSize: 13,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ color: 'var(--em-amber, #FBBF24)' }}>{titleEn}</span>
      <span aria-hidden style={{ color: 'var(--em-text-muted, #9A8FB8)' }}>·</span>
      <span style={{ color: 'var(--em-text-muted, #9A8FB8)' }}>{titlePl}</span>
    </header>

    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 14,
        lineHeight: 1.45,
        color: 'var(--em-text, #EDE6FF)',
      }}
    >
      {bullets ? (
        <>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {bullets.en.map((b, i) => (
              <li key={`en-${i}`} style={{ marginBottom: 3 }}>{b}</li>
            ))}
          </ul>
          <ul
            lang="pl"
            style={{
              margin: 0,
              paddingLeft: 16,
              color: 'var(--em-text-muted, #C8BDE8)',
              borderTop: '1px dashed rgba(167,139,250,0.18)',
              paddingTop: 6,
            }}
          >
            {bullets.pl.map((b, i) => (
              <li key={`pl-${i}`} style={{ marginBottom: 3 }}>{b}</li>
            ))}
          </ul>
        </>
      ) : body ? (
        <>
          <p style={{ margin: 0 }}>{body.en}</p>
          <p
            lang="pl"
            style={{
              margin: 0,
              color: 'var(--em-text-muted, #C8BDE8)',
              borderTop: '1px dashed rgba(167,139,250,0.18)',
              paddingTop: 6,
            }}
          >
            {body.pl}
          </p>
        </>
      ) : null}
    </div>
  </section>
);

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const ExpandableInstructions: React.FC<ExpandableInstructionsProps> = ({
  shellKey,
  bajlaCard,
  fullInstructions,
  autoExpandOnFirstEntry = true,
}) => {
  const reactId = useId();
  const bubbleId = `em-instr-${reactId.replace(/[:]/g, '')}`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // shellKey kept in props for analytics/debug parity; reference once so
  // noUnusedParameters lint stays happy.
  void shellKey;

  // Per-session gate — sessionStorage auto-clears on tab close, so a fresh
  // session always sees the bubble auto-expand on its first shell.
  // Captured ONCE at mount so this shell's behaviour doesn't flip mid-render
  // when we mark the flag below.
  const sessionAlreadyShownRef = useRef<boolean>(
    typeof window === 'undefined' ? false : hasShownThisSession()
  );
  const sessionAlreadyShown = sessionAlreadyShownRef.current;

  const [autoOpened, setAutoOpened] = useState<boolean>(() => {
    if (!autoExpandOnFirstEntry) return false;
    if (typeof window === 'undefined') return false;
    return !sessionAlreadyShown;
  });
  const [open, setOpen] = useState<boolean>(() => {
    if (!autoExpandOnFirstEntry) return false;
    if (typeof window === 'undefined') return false;
    return !sessionAlreadyShown;
  });
  const [patternOpen, setPatternOpen] = useState(false);

  // Mark the session flag the moment we render the bubble open, so the NEXT
  // shell entry within this tab knows not to auto-expand again.
  useEffect(() => {
    if (open) markShownThisSession();
  }, [open]);

  // Pulsing-badge fade timer — only on shells where the session has already
  // seen the bubble (i.e. this is shell #2+). Hidden entirely if the bubble
  // is open or autoExpand is disabled.
  const showBadge = autoExpandOnFirstEntry && !open && sessionAlreadyShown;
  const [badgeFadingOut, setBadgeFadingOut] = useState(false);
  const [badgeMounted, setBadgeMounted] = useState(showBadge);
  useEffect(() => {
    if (!showBadge) return;
    setBadgeMounted(true);
    setBadgeFadingOut(false);
    const fadeAt = window.setTimeout(() => setBadgeFadingOut(true), 5000);
    const unmountAt = window.setTimeout(() => setBadgeMounted(false), 5400);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(unmountAt);
    };
  }, [showBadge]);

  // Focus management for auto-expand: shift to the bubble's close button so
  // screen readers announce the tutorial AND the user can dismiss with one tap.
  useEffect(() => {
    if (open && autoOpened) {
      // Wait one frame for the portal to mount.
      const id = requestAnimationFrame(() => closeBtnRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, autoOpened]);

  // ESC handler — dismiss for the rest of the session and restore focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markShownThisSession();
        setOpen(false);
        setAutoOpened(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      markShownThisSession();
      if (!next) setAutoOpened(false);
      return next;
    });
  }, []);

  const close = useCallback(() => {
    markShownThisSession();
    setOpen(false);
    setAutoOpened(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const { whatYouDo, controls, rightWrongSkip, hintMechanic, scoring, l1Pattern } =
    fullInstructions;

  // ───────────────────────────────────────────────────────────
  // Inline trigger — tiny, lives where the component is mounted. Pushes
  // nothing around; just a link + optional badge.
  // ───────────────────────────────────────────────────────────
  const inlineTrigger = (
    <div
      className="em-instr-wrap"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bubbleId}
        className="em-instr-toggle"
        style={{
          alignSelf: 'flex-start',
          background: 'none',
          border: 'none',
          padding: '4px 6px',
          margin: 0,
          cursor: 'pointer',
          fontFamily: 'var(--em-mono, monospace)',
          fontSize: 13,
          letterSpacing: '0.08em',
          color: 'var(--em-violet, #A78BFA)',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(167,139,250,0.4)',
          textUnderlineOffset: 3,
        }}
      >
        <span aria-hidden style={{ marginRight: 6 }}>📖</span>
        {open ? 'Hide tutorial · Ukryj' : 'Show tutorial · Samouczek'}
      </button>

      {badgeMounted && (
        <button
          type="button"
          onClick={toggle}
          className="em-instr-badge-pulse"
          aria-label="Open tutorial · Otwórz samouczek"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.45)',
            color: 'var(--em-amber, #FBBF24)',
            fontFamily: 'var(--em-mono, monospace)',
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            opacity: badgeFadingOut ? 0 : 1,
            transform: badgeFadingOut ? 'translateY(-2px)' : 'translateY(0)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
            animation: badgeFadingOut
              ? 'none'
              : 'em-instr-badge-pulse 1.5s ease-in-out infinite',
          }}
        >
          <span aria-hidden>🎓</span>
          <span>Tutorial</span>
        </button>
      )}
    </div>
  );

  // ───────────────────────────────────────────────────────────
  // Speech-bubble overlay — portal'd to <body>, position:fixed bottom-right
  // so it visually emanates from Bajla (who lives in the bottom hint card on
  // every shell). The CSS tail (em-instr-bubble::after) points down-right.
  // ───────────────────────────────────────────────────────────
  const bubble = (open && typeof document !== 'undefined') ? createPortal(
    <>
      {/* Click-outside scrim — transparent, just catches taps. Gameplay
          stays visible behind so the user can read context while the
          bubble is up; tap anywhere to dismiss. */}
      <div
        onClick={close}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'transparent',
          zIndex: 9998,
        }}
      />

      <div
        id={bubbleId}
        role="dialog"
        aria-modal="false"
        aria-label="Tutorial · Samouczek od Bajli"
        className="em-instr-bubble em-practice-root"
        style={{
          position: 'fixed',
          // Pin to right with 16px viewport buffer; explicit left:auto so no
          // ancestor "left" leak can stretch the box across the screen.
          right: 16,
          left: 'auto',
          bottom: 24,
          // F4 FIX 2026-05-03 — viewport-clamping max-width so the drawer
          // never spills past 100vw. CD captured mid-word truncation
          // ("Dotrz", "lantern-beare", "CYA") on every shell because the
          // box-sizing cascade from the em-practice-root scope was forcing
          // a wider box than the inline `width` clamp expected. Switching
          // to max-width with min() makes the cap apply universally,
          // honouring the right:16 anchor + 16px left gutter on every
          // viewport. Width is intrinsic now; minWidth:0 keeps flex
          // descendants from blowing it back out.
          maxWidth: 'min(420px, calc(100vw - 32px))',
          width: 'min(420px, calc(100vw - 32px))',
          minWidth: 0,
          maxHeight: 'min(70vh, 560px)',
          // Padding must NOT add to the width — otherwise content area
          // overflows and clips at the bubble's right edge mid-word.
          boxSizing: 'border-box',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          background:
            'linear-gradient(180deg, #FFF8E7 0%, #F5E9C8 100%)',
          color: '#2A1B4F',
          border: '2px solid #2A1B4F',
          borderRadius: 18,
          boxShadow:
            '0 18px 48px -12px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.35)',
          animation: 'em-instr-bubble-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
          // Force every text descendant to wrap — covers long URLs, hyphenated
          // compounds (e.g. "lantern-bearer"), Polish words ("Dotrzyj"), and
          // any element that defaulted to white-space:nowrap upstream.
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          whiteSpace: 'normal',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Bajla badge + close button */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: 'rgba(42,27,79,0.06)',
            borderBottom: '1px solid rgba(42,27,79,0.18)',
          }}
        >
          <span
            aria-hidden
            style={{
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            🦉
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
            <strong
              style={{
                fontFamily: 'var(--em-mono, monospace)',
                fontSize: 13,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#2A1B4F',
              }}
            >
              Bajla mówi
            </strong>
            <span
              style={{
                fontSize: 13,
                color: '#6B5A8E',
                letterSpacing: '0.04em',
              }}
            >
              Tutorial · Samouczek
            </span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label="Close tutorial · Zamknij samouczek"
            style={{
              flex: '0 0 auto',
              width: 32,
              height: 32,
              borderRadius: 999,
              background: '#2A1B4F',
              color: '#FFF8E7',
              border: 'none',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              boxShadow: '0 2px 6px rgba(42,27,79,0.4)',
            }}
          >
            ✕
          </button>
        </header>

        {/* Scrollable content area — light cream background, dark text */}
        <div
          className="em-instr-bubble-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            // Re-skin the dark token defaults so Section blocks read on cream.
            // Each Section uses the violet/amber tokens — those still work on
            // cream via the alpha backgrounds below.
            ['--em-text' as string]: '#2A1B4F',
            ['--em-text-muted' as string]: '#5A4880',
            ['--em-amber' as string]: '#B47A00',
            ['--em-violet' as string]: '#5B3FAE',
          }}
        >
          {/* Recap of the Bajla 1-line card — the bubble reads as a
              self-contained tutorial without forcing the eye back to the
              shell card. */}
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(91,63,174,0.08)',
              border: '1px solid rgba(91,63,174,0.25)',
              borderRadius: 10,
              fontSize: 14,
              lineHeight: 1.45,
              color: '#2A1B4F',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              // F4 FIX 2026-05-03 — explicit wrap on the bajlaCard recap
              // container; flex children with no minWidth:0 default to
              // min-content (their longest unbreakable word), which on
              // Polish compounds like "Dotrzyj" was overshooting the
              // bubble's clamped width and getting hard-clipped.
              minWidth: 0,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            <p style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{bajlaCard.en}</p>
            <p
              lang="pl"
              style={{
                margin: 0,
                color: '#5A4880',
                borderTop: '1px dashed rgba(91,63,174,0.25)',
                paddingTop: 6,
                minWidth: 0,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {bajlaCard.pl}
            </p>
          </div>

          <Section titleEn="What you do" titlePl="Co robisz" bullets={whatYouDo} />
          <Section titleEn="Controls" titlePl="Elementy ekranu" bullets={controls} />
          <Section
            titleEn="Right · Wrong · Skip"
            titlePl="Trafione · Błędne · Pomiń"
            bullets={rightWrongSkip}
          />
          <Section titleEn="Hint button" titlePl="Podpowiedź" body={hintMechanic} />
          <Section
            titleEn="Scoring & progression"
            titlePl="Punktacja i postęp"
            body={scoring}
          />

          {l1Pattern && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <button
                type="button"
                onClick={() => setPatternOpen((p) => !p)}
                aria-expanded={patternOpen}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(180,122,0,0.12)',
                  border: '1px solid rgba(180,122,0,0.5)',
                  color: '#7A4F00',
                  fontFamily: 'var(--em-mono, monospace)',
                  fontSize: 13,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                <span aria-hidden>🇵🇱</span>
                <span>PATTERN · WZORZEC</span>
                <span aria-hidden style={{ opacity: 0.7 }}>{patternOpen ? '▴' : '▾'}</span>
              </button>
              {patternOpen && (
                <div
                  role="tooltip"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(180,122,0,0.10)',
                    border: '1px solid rgba(180,122,0,0.4)',
                    color: '#2A1B4F',
                    fontSize: 14,
                    lineHeight: 1.45,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <p style={{ margin: 0 }}>{l1Pattern.en}</p>
                  <p
                    lang="pl"
                    style={{
                      margin: 0,
                      color: '#5A4880',
                      borderTop: '1px dashed rgba(91,63,174,0.25)',
                      paddingTop: 6,
                    }}
                  >
                    {l1Pattern.pl}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Got-it dismiss only when auto-popped */}
          {autoOpened && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                paddingTop: 4,
              }}
            >
              <button
                type="button"
                onClick={close}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  background: '#2A1B4F',
                  color: '#FFF8E7',
                  border: 'none',
                  fontFamily: 'var(--em-mono, monospace)',
                  fontSize: 13,
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px -4px rgba(42,27,79,0.5)',
                }}
              >
                Got it · Rozumiem
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <>
      {inlineTrigger}
      {bubble}

      {/* Keyframes + speech-bubble tail. Tail is rendered with a CSS
          pseudo-element on .em-instr-bubble — solid-color triangle pointing
          down toward where Bajla sits in the bottom-right hint card. */}
      <style>{`
        @keyframes em-instr-badge-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(251,191,36,0.35);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 0 6px rgba(251,191,36,0);
          }
        }
        @keyframes em-instr-bubble-in {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        /* TRUNCATION FIX 2026-05-02, hardened 2026-05-03 (F4) — force every
           descendant of the bubble to wrap text, regardless of upstream
           defaults. CD captured mid-word cuts ("lantern-beare", "Dotrz",
           "CYA") that proved (a) some text element was inheriting nowrap
           from the em-practice-root cascade, and (b) the bubble's effective
           width was wider than the inline clamp because flex descendants
           default to min-content (= longest unbreakable word). The
           !important guards on min-width/word-break below stop both leaks
           — combined with the inline maxWidth: min(420px, calc(100vw - 32px))
           on the bubble container, every text node now wraps inside the
           viewport-clamped box. */
        .em-instr-bubble,
        .em-instr-bubble * {
          box-sizing: border-box !important;
          min-width: 0 !important;
          white-space: normal !important;
          word-wrap: break-word !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }
        /* Belt-and-braces: enforce the viewport clamp on the bubble itself
           so no class cascade (e.g. .em-practice-root { width: 100% }) can
           push it past 100vw. Inline styles already win on specificity, but
           this rule defends against any future width-injecting wrapper. */
        .em-instr-bubble {
          max-width: min(420px, calc(100vw - 32px)) !important;
        }
        /* But keep the speech-bubble tail pseudo-elements as-is (they need
           width:0 + content-box to render the triangle's borders correctly). */
        .em-instr-bubble::before,
        .em-instr-bubble::after {
          word-break: normal !important;
          box-sizing: content-box !important;
          min-width: 0 !important;
        }
        /* Speech-bubble tail: outer (border) + inner (fill) triangles
           anchored to the bottom-right corner so the bubble visually
           emanates from Bajla's typical lower-corner position. */
        .em-instr-bubble::before,
        .em-instr-bubble::after {
          content: '';
          position: absolute;
          right: 28px;
          width: 0;
          height: 0;
          border-style: solid;
        }
        .em-instr-bubble::before {
          bottom: -16px;
          border-width: 16px 14px 0 14px;
          border-color: #2A1B4F transparent transparent transparent;
        }
        .em-instr-bubble::after {
          bottom: -12px;
          border-width: 14px 11px 0 11px;
          border-color: #F5E9C8 transparent transparent transparent;
        }
        /* Scrollbar inside the bubble body — slim, parchment-tinted */
        .em-instr-bubble-body::-webkit-scrollbar {
          width: 8px;
        }
        .em-instr-bubble-body::-webkit-scrollbar-track {
          background: rgba(42,27,79,0.06);
          border-radius: 8px;
        }
        .em-instr-bubble-body::-webkit-scrollbar-thumb {
          background: rgba(91,63,174,0.45);
          border-radius: 8px;
        }
        .em-instr-bubble-body::-webkit-scrollbar-thumb:hover {
          background: rgba(91,63,174,0.65);
        }
        .em-instr-bubble-body {
          scrollbar-width: thin;
          scrollbar-color: rgba(91,63,174,0.45) rgba(42,27,79,0.06);
        }
        @media (max-width: 720px) {
          .em-instr-bubble {
            right: 16px !important;
            left: auto !important;
            bottom: 16px !important;
            width: min(320px, calc(100vw - 32px)) !important;
            max-width: calc(100vw - 32px) !important;
            max-height: 65vh !important;
          }
          .em-instr-bubble::before,
          .em-instr-bubble::after {
            right: 22px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .em-practice-root .em-instr-badge-pulse {
            animation: none !important;
          }
          .em-instr-bubble {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// Starter content — Hangman canonical example. Other shells supply their own
// content objects in their respective files.
// ─────────────────────────────────────────────────────────────
export const HANGMAN_INSTRUCTIONS: FullInstructions = {
  whatYouDo: {
    en: [
      'A word is hidden behind 6 letter slots. Tap letters from the A–Z keyboard.',
      'Correct letters appear in the slots; wrong letters extinguish a lantern.',
      'Read the clue first — it usually tells you the verb root (e.g. "choose → ?") so you can derive the past participle.',
      'Solve the word before all six lanterns go out.',
    ],
    pl: [
      'Słowo jest ukryte za 6 kratkami na litery. Stukaj litery z klawiatury A–Z.',
      'Prawidłowe litery pojawiają się w kratkach; błędne gaszą jedną z latarni.',
      'Najpierw przeczytaj wskazówkę — zwykle podaje rdzeń czasownika (np. „choose → ?"), z którego masz wyprowadzić formę.',
      'Odgadnij słowo, zanim zgasną wszystkie sześć latarni.',
    ],
  },
  controls: {
    en: [
      'Letter slots: the empty plates above show how many letters the word has.',
      'A–Z keypad: each letter is tappable once. Greens = correct, reds = wrong, locked grey = already tried.',
      'Six lanterns: your remaining lives. Each wrong letter blows one out.',
      'Clue card (Bajla mówi): bilingual hint — read it before tapping.',
      'Hint button: reveals one letter from the answer. Skip button: jumps to the next word.',
    ],
    pl: [
      'Kratki na litery: puste plansze nad klawiaturą pokazują, ile liter ma słowo.',
      'Klawiatura A–Z: każda litera jest klikalna tylko raz. Zielone = poprawne, czerwone = błędne, szare zablokowane = już użyte.',
      'Sześć latarni: pozostałe życia. Każda błędna litera gasi jedną.',
      'Karta wskazówki (Bajla mówi): podpowiedź dwujęzyczna — przeczytaj ją przed klikaniem.',
      'Przycisk podpowiedzi: odkrywa jedną literę z odpowiedzi. Przycisk pomiń: przeskakuje do następnego słowa.',
    ],
  },
  rightWrongSkip: {
    en: [
      'Right pick: the letter slides into every matching slot and the keypad key turns green and locks.',
      'Wrong pick: one lantern dims, the keypad key turns red and locks so you don\'t pick it again.',
      'Skip: moves to the next word and counts as a wrong attempt for this round.',
      'All six lanterns dark = you lose this word and Bajla reveals the answer.',
    ],
    pl: [
      'Trafienie: litera wskakuje we wszystkie pasujące kratki, a klawisz robi się zielony i blokuje.',
      'Błąd: jedna latarnia gaśnie, klawisz robi się czerwony i blokuje, żebyś nie klikał go ponownie.',
      'Pomiń: przeskakuje do następnego słowa i liczy się jako błędna próba w tej rundzie.',
      'Wszystkie sześć latarni zgaszone = przegrywasz to słowo, a Bajla pokazuje odpowiedź.',
    ],
  },
  hintMechanic: {
    en:
      'You have 2 hints per session. Tapping the hint button reveals one letter from the answer in the slots. Save them for tricky letters — silent ones (e.g. "k" in "knee") or doubled consonants you can\'t hear.',
    pl:
      'Masz 2 podpowiedzi na sesję. Kliknięcie przycisku podpowiedzi odkrywa jedną literę odpowiedzi w kratkach. Zachowaj je na trudne litery — nieme (np. „k" w „knee") albo podwojone spółgłoski, których nie słychać.',
  },
  scoring: {
    en:
      'Skip counts as a wrong attempt. Each completed word adds to your session streak. Finishing all words in the deck unlocks Bajla\'s celebration screen and posts your score back to your practice timeline.',
    pl:
      'Pomiń liczy się jako błędna próba. Każde ukończone słowo zwiększa Twoją serię w sesji. Ukończenie wszystkich słów w talii odblokowuje ekran gratulacyjny od Bajli i zapisuje wynik na Twojej osi czasu.',
  },
  l1Pattern: {
    en:
      'Polish learners often over-regularize irregular past participles ("choosed" instead of "chosen", "writed" instead of "written"). This shell builds your memory of the irregular forms.',
    pl:
      'Polscy uczniowie często „regularyzują" nieregularne imiesłowy bierne („choosed" zamiast „chosen", „writed" zamiast „written"). Ten poziom utrwala formy nieregularne w pamięci.',
  },
};

export default ExpandableInstructions;
