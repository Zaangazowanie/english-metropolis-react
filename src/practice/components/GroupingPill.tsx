// GroupingPill.tsx — in-shell context pill.
// ─────────────────────────────────────────────────────────────────────────────
// When a shell is launched FROM a topic-grouping (vs ad-hoc from the
// district atlas), this pill renders at the top of the shell host so the
// student knows what they're drilling and how to get back.
//
// Mike's spec line:
//   "each exercise must clearly show which language grouping is addressed"
//
// Two render modes:
//   1. Standalone — pass props directly. Useful for design canvases / tests.
//   2. Context-driven — wrap the shell in <GroupContextProvider value={...}>
//      and call <GroupingPill /> with no props. The pill reads from context
//      and renders nothing if context is absent (ad-hoc launch).
//
// The pill also exposes an optional "Switch view" dropdown listing OTHER
// compatible shells for the same group, so the student can keep drilling
// the same topic in a different district without bouncing back to the atlas.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import type { ShellKey } from '../lib/shell-selector';
import {
  CATEGORY_ACCENT,
  useGroupContext,
  type GroupCategory,
} from '../lib/groupContext';

// Mirror the SHELL_LABEL map in StudentPractice.tsx. Duplicated here so this
// component doesn't pull a 1100-line file into every shell's bundle. Keep in
// sync if shell labels change — flagged with a comment in StudentPractice
// pointing at this constant.
const SHELL_LABEL_LOCAL: Record<ShellKey, string> = {
  crossword: 'Crossword',
  wordsearch: 'Wordsearch',
  gapfill: 'Gap-fill',
  hangman: 'Hangman',
  matching: 'Matching',
  flashcards: 'Flashcards',
  dragdrop: 'Drag-drop',
  groupsort: 'Group sort',
  truefalse: 'True / False',
  anagram: 'Anagram',
  multiplechoice: 'Multiple choice',
  opencloze: 'Open cloze',
  sentencetransform: 'Sentence transformation',
  wordformation: 'Word formation',
  sentencecorrection: 'Sentence correction',
  spellingbee: 'Spelling bee',
  typingtest: 'Typing test',
  openthebox: 'Open the box',
  spinthewheel: 'Spin the wheel',
  whackamole: 'Whack-a-mole',
  balloonpop: 'Balloon pop',
  snake: 'Snake',
  mazechase: 'Maze chase',
  battleship: 'Battleship',
  readingcomp: 'Reading comprehension',
  listeningcomp: 'Listening comprehension',
  picturequiz: 'Picture quiz',
  speakingcards: 'Speaking cards',
  labelleddiagram: 'Labelled diagram',
  rankorder: 'Rank order',
  unjumble: 'Unjumble',
  quizshow: 'Quiz show',
  concentration: 'Concentration',
  findthematch: 'Find the match',
  randomcards: 'Random cards',
  randomwheel: 'Random wheel',
  airplane: 'Airplane',
  flyingfruit: 'Flying fruit',
};

export interface GroupingPillProps {
  // Optional overrides. When omitted, props are read from useGroupContext().
  groupId?: string;
  topicEn?: string;
  topicPl?: string;
  category?: GroupCategory;
  cefrLevel?: string;
  /** Compatible shells for THIS group — used by the Switch dropdown. */
  compatibleShells?: ShellKey[];
  /** Currently active shell — excluded from the Switch dropdown. */
  currentShell?: ShellKey;
  /** Tap → return to /practice/groups/:groupId. */
  onBack?: () => void;
  /** Tap a sibling shell in the dropdown. */
  onSwitchShell?: (next: ShellKey) => void;
  /** Compact mode for the mobile shell host. */
  compact?: boolean;
}

export const GroupingPill: React.FC<GroupingPillProps> = (props) => {
  const ctx = useGroupContext();

  // Merge: explicit props win over context, context fills the rest.
  const groupId          = props.groupId          ?? ctx?.groupId;
  const topicEn          = props.topicEn          ?? ctx?.topicEn;
  const topicPl          = props.topicPl          ?? ctx?.topicPl;
  const category         = props.category         ?? ctx?.category ?? 'grammar';
  const cefrLevel        = props.cefrLevel        ?? ctx?.cefrLevel;
  const compatibleShells = props.compatibleShells ?? ctx?.compatibleShells ?? [];
  const currentShell     = props.currentShell;
  const onBack           = props.onBack           ?? ctx?.onBackToGroup;
  const onSwitchShell    = props.onSwitchShell    ?? ctx?.onSwitchShell;
  const { compact = false } = props;

  const accent = CATEGORY_ACCENT[category].accent;
  const glow = CATEGORY_ACCENT[category].glow;

  // Render NOTHING when there's no group — ad-hoc shell launches stay clean.
  if (!groupId || !topicEn) return null;

  const others = compatibleShells.filter((s) => s !== currentShell);

  // Switch-shell dropdown state.
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (ev: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div
      className={`em-grouping-pill${compact ? ' is-compact' : ''}`}
      style={{
        ['--pill-accent' as string]: accent,
        ['--pill-glow' as string]: glow,
      } as React.CSSProperties}
      data-group-id={groupId}
    >
      {/* Pin icon + bilingual topic line + back button. */}
      <button
        type="button"
        className="em-grouping-pill-back"
        onClick={onBack}
        disabled={!onBack}
        aria-label={`Back to topic: ${topicEn}`}
      >
        <span className="em-grouping-pill-pin" aria-hidden>📌</span>
        <span className="em-grouping-pill-text">
          <span className="em-grouping-pill-eyebrow">FROM TOPIC · Z TEMATU</span>
          <span className="em-grouping-pill-topic">{topicEn}</span>
          {topicPl && !compact && (
            <span className="em-grouping-pill-topic-pl">{topicPl}</span>
          )}
        </span>
        {cefrLevel && (
          <span className="em-grouping-pill-level">{cefrLevel}</span>
        )}
        <span className="em-grouping-pill-arrow" aria-hidden>↩</span>
      </button>

      {/* Switch-view dropdown — only renders if there are alternatives. */}
      {others.length > 0 && onSwitchShell && (
        <div className="em-grouping-pill-switch" ref={dropdownRef}>
          <button
            type="button"
            className="em-grouping-pill-switch-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="listbox"
          >
            <span>Switch view</span>
            <span className="em-grouping-pill-switch-count">{others.length}</span>
            <span className={`em-grouping-pill-switch-chev${open ? ' is-open' : ''}`} aria-hidden>▾</span>
          </button>
          {open && (
            <div className="em-grouping-pill-switch-menu" role="listbox" aria-label="Other compatible districts">
              <div className="em-grouping-pill-switch-eyebrow">
                Same topic · inna dzielnica
              </div>
              {others.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="em-grouping-pill-switch-item"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setOpen(false);
                    onSwitchShell(s);
                  }}
                >
                  <span>{SHELL_LABEL_LOCAL[s] ?? s}</span>
                  <span className="em-grouping-pill-switch-arrow" aria-hidden>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Self-contained styles — see PracticeGroups.tsx for the rationale */}
      <GroupingPillStyles />
    </div>
  );
};

export default GroupingPill;

const GP_CSS = `
.em-practice-root .em-grouping-pill {
  --pill-accent: #E879F9;
  --pill-glow: rgba(232, 121, 249, 0.4);
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 14px;
  padding: 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--pill-accent) 36%, transparent);
  background:
    radial-gradient(ellipse 60% 80% at 0% 50%, color-mix(in srgb, var(--pill-accent) 14%, transparent), transparent 70%),
    rgba(14, 10, 26, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px -10px var(--pill-glow);
  animation: em-rise 480ms var(--em-ease) both;
}
.em-practice-root .em-grouping-pill-back {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 6px 14px 6px 8px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--em-text, #EDE6FF);
  text-align: left;
  cursor: pointer;
  transition: background 180ms var(--em-ease);
  font-family: var(--em-body, 'Inter', system-ui, sans-serif);
}
.em-practice-root .em-grouping-pill-back:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pill-accent) 12%, transparent);
}
.em-practice-root .em-grouping-pill-back:disabled {
  cursor: default;
  opacity: 0.85;
}
.em-practice-root .em-grouping-pill-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pill-accent) 22%, transparent);
  font-size: 16px;
  flex-shrink: 0;
}
.em-practice-root .em-grouping-pill-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.em-practice-root .em-grouping-pill-eyebrow {
  font-family: var(--em-mono, 'IBM Plex Mono', monospace);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pill-accent);
  opacity: 0.85;
}
.em-practice-root .em-grouping-pill-topic {
  font-family: var(--em-decor, 'Caprasimo', Georgia, serif);
  font-size: 15px;
  line-height: 1.15;
  color: var(--em-text, #EDE6FF);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
}
.em-practice-root .em-grouping-pill-topic-pl {
  font-size: 13px;
  font-style: italic;
  color: var(--em-text-muted, #9A8FB8);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
}
.em-practice-root .em-grouping-pill-level {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--pill-accent) 40%, transparent);
  background: color-mix(in srgb, var(--pill-accent) 14%, transparent);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--pill-accent);
}
.em-practice-root .em-grouping-pill-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pill-accent) 18%, transparent);
  font-size: 13px;
  color: var(--pill-accent);
  flex-shrink: 0;
  margin-left: auto;
}

/* Switch-view dropdown */
.em-practice-root .em-grouping-pill-switch {
  position: relative;
  flex-shrink: 0;
}
.em-practice-root .em-grouping-pill-switch-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(245, 239, 255, 0.16);
  background: rgba(245, 239, 255, 0.05);
  color: var(--em-text);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 180ms var(--em-ease), border-color 180ms var(--em-ease);
}
.em-practice-root .em-grouping-pill-switch-btn:hover {
  background: rgba(245, 239, 255, 0.1);
  border-color: rgba(245, 239, 255, 0.28);
}
.em-practice-root .em-grouping-pill-switch-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--pill-accent);
  color: #14102A;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}
.em-practice-root .em-grouping-pill-switch-chev {
  display: inline-block;
  transition: transform 200ms var(--em-ease);
  font-size: 13px;
}
.em-practice-root .em-grouping-pill-switch-chev.is-open { transform: rotate(180deg); }

.em-practice-root .em-grouping-pill-switch-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 240px;
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--pill-accent) 30%, rgba(245, 239, 255, 0.12));
  background: rgba(14, 10, 26, 0.94);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--pill-glow);
  animation: em-rise 220ms var(--em-ease) both;
}
.em-practice-root .em-grouping-pill-switch-eyebrow {
  padding: 6px 10px 8px;
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--em-text-muted, #9A8FB8);
}
.em-practice-root .em-grouping-pill-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--em-text);
  font-family: var(--em-body);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 140ms var(--em-ease);
}
.em-practice-root .em-grouping-pill-switch-item:hover {
  background: color-mix(in srgb, var(--pill-accent) 14%, transparent);
}
.em-practice-root .em-grouping-pill-switch-arrow {
  font-size: 14px;
  color: var(--pill-accent);
  opacity: 0.7;
}

/* Compact: drop the Polish line + tighten padding for narrow shell hosts */
.em-practice-root .em-grouping-pill.is-compact .em-grouping-pill-topic { font-size: 13px; }
.em-practice-root .em-grouping-pill.is-compact .em-grouping-pill-eyebrow { display: none; }
.em-practice-root .em-grouping-pill.is-compact { padding: 6px; margin-bottom: 10px; }

@media (max-width: 640px) {
  .em-practice-root .em-grouping-pill { flex-wrap: wrap; }
  .em-practice-root .em-grouping-pill-switch { width: 100%; }
  .em-practice-root .em-grouping-pill-switch-btn { width: 100%; justify-content: center; }
  .em-practice-root .em-grouping-pill-topic,
  .em-practice-root .em-grouping-pill-topic-pl { max-width: 200px; }
}
`;

const GroupingPillStyles: React.FC = () => <style>{GP_CSS}</style>;
