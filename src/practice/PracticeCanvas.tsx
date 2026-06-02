// App.tsx — final integration.
// Ports the design-source/index.html <script type="text/babel"> block (lines 49-517)
// to a real ES-module React tree:
//   • Replaces window.* lookups with explicit imports.
//   • Replaces inline TimeFrame/MobilePreview/CoverBoard/LegendBoard/TokensBoard
//     with the same components, kept here so the design canvas reads top-to-bottom
//     in one file. (If they grow they get hoisted to src/canvas/intro-boards.tsx.)
//   • Keeps the EDITMODE-BEGIN/END marker block so the Tweaks host can rewrite
//     defaults on disk.

import React, { Suspense, lazy } from 'react';
import {
  DesignCanvas,
  DCSection,
  DCArtboard,
} from './canvas/design-canvas';
import {
  TweaksPanel,
  TweakSection,
  TweakRadio,
  useTweaks,
} from './canvas/tweaks-panel';
import { Bajla, BajlaMood } from './components/primitives';
import { IOSDevice } from './components/ios-frame';
import { ErrorBoundary, ShellSpinner } from './components/ErrorBoundary';
import { SkipToContent } from './lib/useAccessibility';

// ─── Lazy-loaded shells — each shell loads independently via code-splitting ───
// 2026-05-02 (Ricky): direct default-import form to avoid Rollup stub chunks
// (see StudentPractice.tsx's Shells map for the full reasoning).
const CrosswordShell  = lazy(() => import('./shells/Crossword'));
const WordsearchShell = lazy(() => import('./shells/Wordsearch'));
const GapFillShell    = lazy(() => import('./shells/GapFill'));
const HangmanShell    = lazy(() => import('./shells/Hangman'));
const MatchingShell   = lazy(() => import('./shells/Matching'));
const FlashcardsShell = lazy(() => import('./shells/Flashcards'));
const DragDropShell   = lazy(() => import('./shells/DragDrop'));
const GroupSortShell  = lazy(() => import('./shells/GroupSort'));
const TrueFalseShell  = lazy(() => import('./shells/TrueFalse'));
const AnagramShell    = lazy(() => import('./shells/Anagram'));

/** Wraps a shell in ErrorBoundary + Suspense for isolated code-split loading. */
const ShellGuard: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => (
  <ErrorBoundary shellName={name}>
    <Suspense fallback={<ShellSpinner shellName={name} />}>
      {children}
    </Suspense>
  </ErrorBoundary>
);

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────
type TimeOfDay = 'day' | 'dusk' | 'night';
type ForceState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete';
// `live` = run the shell as a real interactive game (no forced state).
type CrosswordTweakState = 'live' | ForceState;

// Common contract every shell satisfies. Every shell takes a `time` plus an
// optional `state` override; this type lets the mobile-preview row iterate
// over all ten without per-shell special cases.
type ShellComponent = React.ComponentType<{ time?: TimeOfDay; state?: ForceState | null }>;

// ─────────────────────────────────────────────────────────────────────────────
// TimeFrame — wraps a shell so its CSS can key off `[data-time]`. Optional
// `scale` lets a host shrink the shell to fit a smaller artboard while keeping
// the shell's own internal coordinates at full size.
// ─────────────────────────────────────────────────────────────────────────────
interface TimeFrameProps {
  time: TimeOfDay;
  children: React.ReactNode;
  scale?: number;
}

const TimeFrame: React.FC<TimeFrameProps> = ({ time, children, scale = 1 }) => (
  <div
    data-time={time}
    style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      background: 'var(--em-ink)',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    >
      {children}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MobilePreview — desktop shell scaled inside an iPhone bezel.
// NOT a real mobile reflow — this scales the desktop layout to fit a phone
// viewport so the eng team can see which districts compress gracefully and
// which need a native mobile redesign.
// ─────────────────────────────────────────────────────────────────────────────
interface MobilePreviewProps {
  time: TimeOfDay;
  children: React.ReactNode;
  designW?: number;
  designH?: number;
}

const MobilePreview: React.FC<MobilePreviewProps> = ({
  time,
  children,
  designW = 1200,
  designH = 780,
}) => {
  // Phone screen content area inside the iOS bezel.
  const screenW = 362;
  const screenH = 720;
  const scale = Math.min(screenW / designW, screenH / designH);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      }}
    >
      <IOSDevice width={375} height={812} dark>
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            background: 'var(--em-ink)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: designW,
              height: designH,
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: 'center',
            }}
          >
            <div
              data-time={time}
              style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
            >
              {children}
            </div>
          </div>
          {/* Tiny corner label so it's clear this is preview-at-scale, not native mobile. */}
          <div
            style={{
              position: 'absolute',
              bottom: 36,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(237,230,255,0.4)',
              pointerEvents: 'none',
            }}
          >
            preview · scaled desktop layout
          </div>
        </div>
      </IOSDevice>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CoverBoard — project intro / pitch card.
// ─────────────────────────────────────────────────────────────────────────────
interface CoverBoardProps {
  time: TimeOfDay;
}

const CoverBoard: React.FC<CoverBoardProps> = ({ time }) => {
  const grad =
    time === 'day'
      ? 'linear-gradient(160deg, #4C2F7E 0%, #C58BD9 100%)'
      : time === 'night'
        ? 'linear-gradient(160deg, #02010C 0%, #2A1450 70%, #4B1E78 100%)'
        : 'linear-gradient(160deg, #1F1240 0%, #6A2A8C 60%, #C5598E 100%)';
  return (
    <div
      data-time={time}
      className="em-grain"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: grad,
        color: '#F5EFFF',
        fontFamily: 'var(--em-body)',
      }}
    >
      {/* Faux skyline silhouette */}
      <svg
        viewBox="0 0 1200 700"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.85 }}
      >
        <defs>
          <linearGradient id="cover-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <path
          d="M0 700 L0 480 L60 480 L60 420 L120 420 L120 380 L180 380 L180 440 L240 440 L240 360 L260 360 L260 280 L320 280 L320 360 L380 360 L380 400 L440 400 L440 320 L500 320 L500 260 L520 260 L520 180 L560 180 L560 260 L600 260 L600 340 L660 340 L660 280 L720 280 L720 380 L780 380 L780 320 L840 320 L840 420 L900 420 L900 360 L960 360 L960 440 L1020 440 L1020 400 L1080 400 L1080 460 L1140 460 L1140 480 L1200 480 L1200 700 Z"
          fill="url(#cover-sky)"
        />
        {/* Window dots */}
        {Array.from({ length: 80 }).map((_, i) => {
          const x = (i * 73 + 17) % 1200;
          const y = 460 + ((i * 41) % 200);
          return (
            <rect key={i} x={x} y={y} width="3" height="4" fill="#FBBF24" opacity={0.4 + (i % 3) * 0.2} />
          );
        })}
      </svg>

      {/* Decorative pigeon removed 2026-05-04 per Mike — chat-widget Bajla
          is the canonical mascot presence on every page. */}

      <div style={{ position: 'relative', padding: '64px 72px', maxWidth: 800 }}>
        <div
          className="em-eyebrow"
          style={{ fontSize: 12, letterSpacing: '0.32em', color: 'rgba(245,239,255,0.7)' }}
        >
          ENGLISH&nbsp;·&nbsp;METROPOLIS&nbsp;·&nbsp;ANGIELSKI
        </div>
        <h1
          style={{
            fontFamily: 'var(--em-decor)',
            fontSize: 96,
            lineHeight: 0.95,
            margin: '24px 0 8px',
            color: '#F5EFFF',
            textShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          Ten practice
          <br />
          districts.
        </h1>
        <h2
          style={{
            fontFamily: 'var(--em-display)',
            fontSize: 28,
            fontWeight: 400,
            margin: '0 0 36px',
            color: 'rgba(245,239,255,0.85)',
            maxWidth: 560,
          }}
        >
          A city-shaped study app for adult Polish learners — where every game is a neighborhood and
          Bajla the pigeon is your guide.
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
          {[
            'Crossword',
            'Wordsearch',
            'Gap-fill',
            'Hangman',
            'Matching',
            'Flashcards',
            'Drag-drop',
            'Group sort',
            'True/False',
            'Anagram',
          ].map((n) => (
            <span
              key={n}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontFamily: 'var(--em-mono)',
                background: 'rgba(0,0,0,0.32)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#F5EFFF',
              }}
            >
              {n}
            </span>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 32,
            alignItems: 'center',
            fontFamily: 'var(--em-mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(245,239,255,0.6)',
          }}
        >
          <div>
            <div style={{ color: '#FBBF24' }}>38 DISTRICTS</div>
            <div>trzydzieści osiem dystryktów</div>
          </div>
          <div>
            <div style={{ color: '#E879F9' }}>3 HI-FI</div>
            <div>interactive prototypes</div>
          </div>
          <div>
            <div style={{ color: '#7DD3FC' }}>1 CITY</div>
            <div>jedno miasto</div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 32,
          right: 48,
          fontFamily: 'var(--em-mono)',
          fontSize: 10,
          letterSpacing: '0.24em',
          color: 'rgba(245,239,255,0.4)',
          textAlign: 'right',
        }}
      >
        EXPLORATION v1 · ARCHITECTURE: SHENZHEN × WARSAW × VIENNA × LONDON
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LegendBoard — Bajla the recurring guide.
// ─────────────────────────────────────────────────────────────────────────────
const LegendBoard: React.FC = () => {
  const moods: { mood: BajlaMood; label: string; pl: string; desc: string }[] = [
    { mood: 'idle', label: 'Idle', pl: 'spokojna', desc: 'Watching from a sign post.' },
    { mood: 'think', label: 'Thinking', pl: 'myśli', desc: 'When you tap "hint".' },
    { mood: 'cheer', label: 'Cheering', pl: 'cieszy się', desc: 'A correct answer arrives.' },
    { mood: 'wave', label: 'Greeting', pl: 'wita', desc: 'New district unlocked.' },
  ];
  return (
    <div
      data-time="dusk"
      className="em-grain"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #14102A 0%, #0E0A1A 100%)',
        padding: '40px 44px',
        color: '#EDE6FF',
        fontFamily: 'var(--em-body)',
        boxSizing: 'border-box',
      }}
    >
      <div className="em-eyebrow" style={{ marginBottom: 16, color: '#E879F9' }}>
        VISITORS' GUIDE · PRZEWODNIK
      </div>
      <h3 className="em-decor" style={{ fontSize: 44, margin: '0 0 8px' }}>
        Meet Bajla.
      </h3>
      <p style={{ fontSize: 16, color: '#9A8FB8', maxWidth: 540, lineHeight: 1.5 }}>
        A city pigeon who knows every district. She bobs, she cheers, she gives bilingual hints when
        you ask — and only when you ask. She is the only constant across all ten shells.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 32 }}>
        {moods.map((p) => (
          <div
            key={p.mood}
            style={{
              padding: 20,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Bajla size={64} mood={p.mood} />
            </div>
            <div style={{ fontFamily: 'var(--em-display)', fontWeight: 600, fontSize: 14 }}>{p.label}</div>
            <div className="em-eyebrow" style={{ marginTop: 2, fontSize: 9 }}>
              {p.pl}
            </div>
            <div style={{ fontSize: 12, color: '#9A8FB8', marginTop: 8, lineHeight: 1.4 }}>{p.desc}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 32,
          padding: 20,
          borderRadius: 16,
          background: 'linear-gradient(120deg, rgba(232,121,249,0.08), rgba(125,211,252,0.04))',
          border: '1px solid rgba(232,121,249,0.18)',
        }}
      >
        <div className="em-eyebrow" style={{ color: '#FBBF24', marginBottom: 8 }}>
          BILINGUAL CARD · KARTA
        </div>
        <div style={{ fontSize: 18, lineHeight: 1.4, color: '#EDE6FF' }}>
          Every shell whispers Polish in the margins — the help is always there, but it never shouts
          over the English.
        </div>
        <div style={{ fontSize: 13, color: '#A78BFA', marginTop: 6, fontStyle: 'italic' }}>
          🇵🇱 Każda gra ma polskie podpowiedzi — pomoc, która nie krzyczy.
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TokensBoard — system swatches.
// ─────────────────────────────────────────────────────────────────────────────
const TokensBoard: React.FC = () => {
  const colors: [string, string, string][] = [
    ['Magenta', '#E879F9', 'Primary action, focus'],
    ['Violet', '#A78BFA', 'Hover, secondary brand'],
    ['Sky', '#7DD3FC', 'Day / metro / blueprint'],
    ['Amber', '#FBBF24', 'Bajla, warm accents'],
    ['Mint', '#34D399', 'Correct, success'],
    ['Coral', '#FB7185', 'Wrong, warning'],
    ['Rose', '#F472B6', 'Romance, evening'],
    ['Lime', '#BEF264', 'Graffiti, novelty'],
  ];
  const fonts: { fam: string; label: string; sample: string; use: string }[] = [
    { fam: 'var(--em-decor)', label: 'Caprasimo', sample: 'The City', use: 'Headlines, district names' },
    { fam: 'var(--em-display)', label: 'Space Grotesk', sample: 'Section title', use: 'UI titles, big text' },
    { fam: 'var(--em-body)', label: 'Inter', sample: 'Reading text & clues', use: 'Body, instructions' },
    { fam: 'var(--em-mono)', label: 'JetBrains Mono', sample: 'STREET 03', use: 'Eyebrows, signage' },
  ];
  return (
    <div
      data-time="dusk"
      style={{
        width: '100%',
        height: '100%',
        padding: '40px 44px',
        boxSizing: 'border-box',
        background: '#0E0A1A',
        color: '#EDE6FF',
        fontFamily: 'var(--em-body)',
        overflow: 'hidden',
      }}
    >
      <div className="em-eyebrow" style={{ color: '#7DD3FC', marginBottom: 12 }}>
        TOKEN SHEET · TOKENY
      </div>
      <h3 className="em-decor" style={{ fontSize: 38, margin: '0 0 28px' }}>
        The system, in eight colors and four typefaces.
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {colors.map(([name, hex, role]) => (
          <div
            key={name}
            style={{
              padding: 14,
              borderRadius: 12,
              background: '#181128',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div style={{ width: '100%', height: 56, borderRadius: 8, background: hex, marginBottom: 10 }} />
            <div style={{ fontFamily: 'var(--em-display)', fontWeight: 600, fontSize: 13 }}>{name}</div>
            <div style={{ fontFamily: 'var(--em-mono)', fontSize: 10, color: '#9A8FB8', marginTop: 1 }}>
              {hex}
            </div>
            <div style={{ fontSize: 11, color: '#9A8FB8', marginTop: 6, lineHeight: 1.3 }}>{role}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
        {fonts.map((t) => (
          <div
            key={t.label}
            style={{
              padding: 14,
              borderRadius: 12,
              background: '#181128',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div className="em-eyebrow" style={{ marginBottom: 10 }}>
              {t.label}
            </div>
            <div style={{ fontFamily: t.fam, fontSize: 26, color: '#EDE6FF', lineHeight: 1.1 }}>
              {t.sample}
            </div>
            <div style={{ fontSize: 11, color: '#9A8FB8', marginTop: 10 }}>{t.use}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// State sequence + mobile-preview registries (data, not JSX) so the App's
// render block reads short and deterministic.
// ─────────────────────────────────────────────────────────────────────────────
const FORCE_STATES: ForceState[] = ['empty', 'active', 'wrong', 'correct', 'complete'];

interface StateSeqEntry {
  sectionId: string;
  artboardPrefix: string;
  title: string;
  Shell: ShellComponent;
  label: string; // Per-artboard label prefix.
}

const STATE_SEQUENCES: StateSeqEntry[] = [
  // The first one is Crossword and sits in section "states" (no -states suffix)
  // to match the original design canvas.
  { sectionId: 'states', artboardPrefix: 'cw', title: 'Crossword · State sequence (empty → complete)', Shell: CrosswordShell, label: 'Crossword' },
  { sectionId: 'hangman-states', artboardPrefix: 'hm', title: 'Hangman · State sequence (empty → complete)', Shell: HangmanShell, label: 'Hangman' },
  { sectionId: 'flashcards-states', artboardPrefix: 'fc', title: 'Flashcards · State sequence (empty → complete)', Shell: FlashcardsShell, label: 'Flashcards' },
  { sectionId: 'wordsearch-states', artboardPrefix: 'ws', title: 'Wordsearch · State sequence (empty → complete)', Shell: WordsearchShell, label: 'Wordsearch' },
  { sectionId: 'gapfill-states', artboardPrefix: 'gf', title: 'Gap-fill · State sequence (empty → complete)', Shell: GapFillShell, label: 'Gap-fill' },
  { sectionId: 'matching-states', artboardPrefix: 'mp', title: 'Matching pairs · State sequence (empty → complete)', Shell: MatchingShell, label: 'Matching' },
  { sectionId: 'dragdrop-states', artboardPrefix: 'dd', title: 'Drag & drop · State sequence (empty → complete)', Shell: DragDropShell, label: 'Drag & drop' },
  { sectionId: 'groupsort-states', artboardPrefix: 'gs', title: 'Group sort · State sequence (empty → complete)', Shell: GroupSortShell, label: 'Group sort' },
  { sectionId: 'truefalse-states', artboardPrefix: 'tf', title: 'True / False · State sequence (empty → complete)', Shell: TrueFalseShell, label: 'True / False' },
  { sectionId: 'anagram-states', artboardPrefix: 'ag', title: 'Anagram · State sequence (empty → complete)', Shell: AnagramShell, label: 'Anagram' },
];

interface MobileRegistryEntry {
  id: string;
  label: string;
  Shell: ShellComponent;
}

const MOBILE_SHELLS: MobileRegistryEntry[] = [
  { id: 'cw', label: 'Crossword', Shell: CrosswordShell },
  { id: 'hm', label: 'Hangman', Shell: HangmanShell },
  { id: 'fc', label: 'Flashcards', Shell: FlashcardsShell },
  { id: 'ws', label: 'Wordsearch', Shell: WordsearchShell },
  { id: 'gf', label: 'Gap-fill', Shell: GapFillShell },
  { id: 'mp', label: 'Matching', Shell: MatchingShell },
  { id: 'dd', label: 'Drag & drop', Shell: DragDropShell },
  { id: 'gs', label: 'Group sort', Shell: GroupSortShell },
  { id: 'tf', label: 'True / False', Shell: TrueFalseShell },
  { id: 'ag', label: 'Anagram', Shell: AnagramShell },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tweaks defaults — kept inside the EDITMODE-BEGIN/END markers so the host's
// "save tweaks to disk" toolbar can rewrite them.
// ─────────────────────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  time: 'dusk' as TimeOfDay,
  crosswordState: 'live' as CrosswordTweakState,
} /*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────────────────────
// App — full design canvas with intro boards, hi-fi shells, every shell's
// state sequence, and a mobile-preview row per shell. Tweaks panel mirrors the
// design-source: time-of-day + crossword state.
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const time = tweaks.time;
  // 'live' means run the shell unforced; anything else is a state pin.
  const crosswordOverride: ForceState | null =
    tweaks.crosswordState === 'live' ? null : tweaks.crosswordState;

  return (
    // .em-practice-root scopes global.css so the dark practice theme stays
    // inside this route and doesn't bleed into Dashboard/Calendar/etc.
    <div className="em-practice-root">
      {/* Skip-to-content link for keyboard/screen reader users */}
      <SkipToContent />
      {/* Global aria-live region for dynamic announcements */}
      <div id="aria-live-region" role="status" aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }} />
      <DesignCanvas>
        {/* ─── Cover · Okładka ─────────────────────────────────────────── */}
        <DCSection id="cover" title="Cover · Okładka">
          <DCArtboard id="cover" label="The pitch — title card" width={1200} height={700}>
            <CoverBoard time={time} />
          </DCArtboard>
          <DCArtboard id="legend" label="Bajla — the recurring guide" width={780} height={700}>
            <LegendBoard />
          </DCArtboard>
          <DCArtboard id="tokens" label="System tokens — color & type" width={1100} height={700}>
            <TokensBoard />
          </DCArtboard>
        </DCSection>

        {/* ─── Hi-fi interactive shells (first three districts) ─────────── */}
        <DCSection id="hifi" title="Hi-fi interactive shells · The first three districts">
          <DCArtboard
            id="crossword"
            label="01 · The Grid District — Crossword (interactive)"
            width={1280}
            height={820}
          >
            <TimeFrame time={time}>
              <ShellGuard name="Crossword">
                <CrosswordShell time={time} state={crosswordOverride} />
              </ShellGuard>
            </TimeFrame>
          </DCArtboard>
          <DCArtboard
            id="wordsearch"
            label="02 · The Neon Market — Wordsearch (interactive)"
            width={1280}
            height={820}
          >
            <TimeFrame time={time}>
              <ShellGuard name="Wordsearch">
                <WordsearchShell time={time} />
              </ShellGuard>
            </TimeFrame>
          </DCArtboard>
          <DCArtboard
            id="gapfill"
            label="03 · The Construction Quarter — Gap-fill (interactive)"
            width={1280}
            height={820}
          >
            <TimeFrame time={time}>
              <ShellGuard name="Gap-fill">
                <GapFillShell time={time} />
              </ShellGuard>
            </TimeFrame>
          </DCArtboard>
        </DCSection>

        {/* ─── State sequences, one section per shell ─────────────────── */}
        {STATE_SEQUENCES.map(({ sectionId, artboardPrefix, title, Shell, label }) => (
          <DCSection key={sectionId} id={sectionId} title={title}>
            {FORCE_STATES.map((s) => (
              <DCArtboard
                key={s}
                id={`${artboardPrefix}-${s}`}
                label={`${label} · ${s}`}
                width={1100}
                height={720}
              >
                <TimeFrame time={time}>
                  <ShellGuard name={label}>
                    <Shell time={time} state={s} />
                  </ShellGuard>
                </TimeFrame>
              </DCArtboard>
            ))}
          </DCSection>
        ))}

        {/* ─── Mobile preview rows · ten shells, five states each ──────────
             NOT native mobile reflow — scaled desktop-layout inside iPhone
             bezels so eng can see which districts compress well and which
             need a real redesign for phone. */}
        {MOBILE_SHELLS.map(({ id, label, Shell }) => (
          <DCSection
            key={`m-${id}`}
            id={`${id}-mobile`}
            title={`${label} · Mobile preview (scaled · iPhone)`}
          >
            {FORCE_STATES.map((s) => (
              <DCArtboard
                key={s}
                id={`m-${id}-${s}`}
                label={`${label} · ${s} · 📱`}
                width={430}
                height={900}
              >
                <MobilePreview time={time}>
                  <ShellGuard name={label}>
                    <Shell time={time} state={s} />
                  </ShellGuard>
                </MobilePreview>
              </DCArtboard>
            ))}
          </DCSection>
        ))}
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Time of day · Pora dnia">
          <TweakRadio<TimeOfDay>
            label="Time"
            value={tweaks.time}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'dusk', label: 'Dusk' },
              { value: 'night', label: 'Night' },
            ]}
            onChange={(v) => setTweak('time', v)}
          />
        </TweakSection>

        <TweakSection label="Crossword · State">
          <TweakRadio<CrosswordTweakState>
            label="Show"
            value={tweaks.crosswordState}
            options={[
              { value: 'live', label: 'Live' },
              { value: 'empty', label: 'Empty' },
              { value: 'active', label: 'Active' },
              { value: 'correct', label: 'Correct' },
              { value: 'wrong', label: 'Wrong' },
              { value: 'complete', label: 'Complete' },
            ]}
            onChange={(v) => setTweak('crosswordState', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
