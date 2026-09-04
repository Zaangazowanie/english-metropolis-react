// GroupDetail.tsx — /practice/groups/:groupId page.
// ─────────────────────────────────────────────────────────────────────────────
// Lands when a student taps a card in PracticeGroups. Shows:
//   1. The topic name (Caprasimo display) + bilingual subtitle
//   2. A bilingual description card explaining the topic
//   3. A horizontal tab strip of compatible districts — each is a button
//      that launches a session in that shell, filtered to the group
//   4. An expandable "Why these shells?" section
//   5. A right-rail "Related topics" list (desktop only)
//
// Mike's spec lines:
//   "all shells compatible should be able to practice each of these
//    language groupings"
//   "easy navigating to and fro different shells and different groupings"
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Bajla } from './components/primitives';
import type { ShellKey } from './lib/shell-selector';
import { useQueryConvex } from './lib/convex-stubs';
import {
  CATEGORY_ACCENT,
  CATEGORY_LABEL,
  type GroupCategory,
} from './lib/groupContext';
import type { ExerciseGroup } from './PracticeGroups';

// District meta — duplicated from StudentPractice.tsx to avoid pulling that
// 1100-line file's full lazy-shell dependency graph into this page's bundle.
// Ships only the fields this page actually needs (name, accent, emoji).
//
// MAINTENANCE NOTE: when StudentPractice.DISTRICTS changes, mirror the diff
// here. Light coupling — no import — keeps GroupDetail snappy. Same trade-off
// taken in components/GroupingPill.tsx for SHELL_LABEL_LOCAL.
interface MiniDistrictMeta {
  name: string;
  emoji: string;
  accent: string;
}
const DISTRICTS_LITE: Record<ShellKey, MiniDistrictMeta> = {
  multiplechoice:     { name: 'The Bulletin Board',       emoji: '📌', accent: '#FB7185' },
  crossword:          { name: 'The Grid District',        emoji: '🔲', accent: '#7DD3FC' },
  wordsearch:         { name: 'The Neon Market',          emoji: '🔍', accent: '#FBBF24' },
  gapfill:            { name: 'The Construction Quarter', emoji: '🏗️', accent: '#FB7185' },
  hangman:            { name: 'The Lantern Alley',        emoji: '🏮', accent: '#FBBF24' },
  matching:           { name: 'The Bridge District',      emoji: '🌉', accent: '#A78BFA' },
  flashcards:         { name: 'The Library Tower',        emoji: '📚', accent: '#34D399' },
  dragdrop:           { name: 'The Sorting Station',      emoji: '📦', accent: '#7DD3FC' },
  groupsort:          { name: 'The Roundabout',           emoji: '🔄', accent: '#BEF264' },
  truefalse:          { name: 'The Courthouse',           emoji: '⚖️', accent: '#FB7185' },
  anagram:            { name: 'The Letter Workshop',      emoji: '🔤', accent: '#E879F9' },
  opencloze:          { name: 'The Vellum Atelier',       emoji: '🕯️', accent: '#7DD3FC' },
  sentencetransform:  { name: "The Translator's Booth",   emoji: '🎙️', accent: '#A78BFA' },
  wordformation:      { name: "The Mason's Yard",         emoji: '⛏️', accent: '#FBBF24' },
  sentencecorrection: { name: "The Editor's Office",      emoji: '✏️', accent: '#FB7185' },
  spellingbee:        { name: 'The Concert Hall',         emoji: '🎤', accent: '#FBBF24' },
  typingtest:         { name: 'The Telegraph Office',     emoji: '⚡', accent: '#7DD3FC' },
  openthebox:         { name: 'The Vault Room',           emoji: '🗄️', accent: '#FBBF24' },
  spinthewheel:       { name: 'The Carnival Wheel',       emoji: '🎡', accent: '#E879F9' },
  whackamole:         { name: 'The Subway Mole',          emoji: '🔨', accent: '#BEF264' },
  balloonpop:         { name: 'The Rooftop Garden',       emoji: '🎈', accent: '#FB7185' },
  snake:              { name: 'The Park Path',            emoji: '🐍', accent: '#34D399' },
  mazechase:          { name: 'The Backstreets',          emoji: '🗺️', accent: '#7DD3FC' },
  battleship:         { name: 'The Harbour Grid',         emoji: '⚓', accent: '#7DD3FC' },
  readingcomp:        { name: 'The Reading Room',         emoji: '📖', accent: '#34D399' },
  listeningcomp:      { name: 'The Listening Booth',      emoji: '🎧', accent: '#A78BFA' },
  picturequiz:        { name: 'The Photography Salon',    emoji: '🖼️', accent: '#E879F9' },
  speakingcards:      { name: 'The Speakeasy',            emoji: '🗣️', accent: '#FBBF24' },
  labelleddiagram:    { name: 'The Atrium Schematic',     emoji: '📐', accent: '#7DD3FC' },
  rankorder:          { name: 'The Election Hall',        emoji: '🗳️', accent: '#BEF264' },
  unjumble:           { name: 'The Puzzle Workshop',      emoji: '🧩', accent: '#E879F9' },
  quizshow:           { name: 'The Auditorium',           emoji: '🎭', accent: '#FBBF24' },
  concentration:      { name: 'The Memory Cellar',        emoji: '🃏', accent: '#A78BFA' },
  findthematch:       { name: 'The Lost & Found',         emoji: '🔎', accent: '#7DD3FC' },
  randomcards:        { name: "The Dealer's Table",       emoji: '🎴', accent: '#FB7185' },
  randomwheel:        { name: 'The Spinner Stand',        emoji: '🎯', accent: '#FBBF24' },
  airplane:           { name: 'The Aerodrome',            emoji: '✈️', accent: '#7DD3FC' },
  flyingfruit:        { name: 'The Orchard Square',       emoji: '🍎', accent: '#34D399' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public types — Agent A's getGroup query returns { group, exercises }.
// We only really need `group` in this view; the exercise list is opaque (the
// shell handles it). Keep the type loose to absorb future fields.
// ─────────────────────────────────────────────────────────────────────────────
export interface GroupDetailExtended extends ExerciseGroup {
  descriptionEn?: string;
  descriptionPl?: string;
  /** Optional per-shell exercise count — used in the tab strip. */
  shellCounts?: Partial<Record<ShellKey, number>>;
}

export interface GroupDetailProps {
  groupId: string;
  /** Tap "← back to topics" — returns to PracticeGroups. */
  onBack: () => void;
  /**
   * Tap a district tab → launch shell with this group as the filter.
   * Receives the full GroupDetailExtended (topic title, category, level,
   * compatible-shells set) so the launcher can populate the in-shell
   * GroupingPill context without a second Convex round-trip.
   */
  onLaunchShell: (shell: ShellKey, group: GroupDetailExtended) => void;
  /** Tap a related-topic card → open another GroupDetail. */
  onOpenGroup?: (groupId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub data — replace with `queryConvex('exerciseGroups:getGroup', { groupId })`
// when Agent A lands. The `relatedGroups` lookup currently filters MOCK_GROUPS
// by overlapping errorCategories; main session keeps that logic but feeds
// it a real `listGroups` result.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_DETAILS: Record<string, GroupDetailExtended> = {
  'mock-modals-spec': {
    groupId: 'mock-modals-spec',
    topicEn: 'Modal verbs of speculation',
    topicPl: 'Czasowniki modalne wyrażające przypuszczenie',
    cefrLevel: 'B2',
    category: 'grammar',
    exerciseCount: 24,
    compatibleShells: ['multiplechoice', 'gapfill', 'truefalse', 'sentencetransform', 'sentencecorrection'],
    errorCategories: ['grammar-modal'],
    descriptionEn: 'Use must, might, could, may, can\'t to talk about how certain you are about a present or past event. "She must be tired" vs "She might be at home" vs "He can\'t have left already".',
    descriptionPl: 'Użyj must, might, could, may, can\'t, by wyrazić, jak bardzo jesteś pewien zdarzenia teraźniejszego lub przeszłego. "Musi być zmęczona" / "Może być w domu" / "Nie mógł już wyjść".',
    shellCounts: { multiplechoice: 8, gapfill: 6, truefalse: 4, sentencetransform: 4, sentencecorrection: 2 },
  },
};

// All other mock groups get a generic auto-generated detail page so the rest
// of the atlas links to working pages even without explicit fixtures. Used as
// a fallback: when a real Convex query lands, only the explicit branch fires.
function fallbackDetail(groupId: string): GroupDetailExtended | null {
  // Lazy-import the MOCK_GROUPS list from PracticeGroups to avoid a circular
  // import. Instead reconstruct minimal info from the groupId so the page
  // is never blank in dev. Real prod path always has Convex data.
  return {
    groupId,
    topicEn: 'Topic loading…',
    topicPl: 'Wczytywanie tematu…',
    cefrLevel: 'B1',
    category: 'grammar',
    exerciseCount: 0,
    compatibleShells: ['multiplechoice', 'gapfill', 'matching', 'flashcards'],
    errorCategories: [],
    descriptionEn: 'This topic is being prepared. Tap any district below to start practising — Bajla will fall back to a sample exercise until the live data lands.',
    descriptionPl: 'Ten temat jest przygotowywany. Stuknij dowolną dzielnicę poniżej, by zacząć ćwiczyć — Bajla pokaże ćwiczenie demonstracyjne, dopóki dane nie zostaną podpięte.',
  };
}

interface UseGroupDetailResult {
  group: GroupDetailExtended | null;
  related: ExerciseGroup[];
  status: 'loading' | 'ready' | 'error';
}

function useGroupDetail(groupId: string): UseGroupDetailResult {
  // 2026-05-02: wired to real Convex queries from Agent A's exerciseGroups schema.
  // Two parallel reads: getGroup gives us {group, exercises}; listGroups gives
  // us the full pool we filter client-side for related (overlap on errorCategories).
  const groupResult = useQueryConvex<{
    group: ExerciseGroup & { description?: string; descriptionPl?: string };
    exercises: Array<{ exerciseId: string; questions: Array<{ type: string }> }>;
  } | null>('exerciseGroups:getGroup', { groupId });
  const allGroups = useQueryConvex<ExerciseGroup[]>('exerciseGroups:listGroups', {});
  const shellCounts = useQueryConvex<Array<{ shellKey: string; exerciseCount: number }>>(
    'exerciseGroups:getCompatibleShellsForGroup',
    { groupId },
  );

  if (groupResult === undefined || allGroups === undefined) {
    return { group: null, related: [], status: 'loading' };
  }
  if (groupResult === null || !groupResult.group) {
    // Convex returned no hit — show fallback so the page isn't blank
    return {
      group: fallbackDetail(groupId),
      related: [],
      status: 'error',
    };
  }

  const g = groupResult.group;
  const counts: Record<string, number> = {};
  for (const c of shellCounts ?? []) counts[c.shellKey] = c.exerciseCount;

  const detail: GroupDetailExtended = {
    groupId: g.groupId,
    topicEn: g.topicEn,
    topicPl: g.topicPl,
    cefrLevel: g.cefrLevel,
    category: g.category as GroupCategory,
    exerciseCount: g.exerciseCount ?? 0,
    compatibleShells: (g.compatibleShells ?? []) as ShellKey[],
    errorCategories: g.errorCategories ?? [],
    descriptionEn: g.description ?? `Practice ${g.topicEn.toLowerCase()} — pick any compatible district below to start.`,
    descriptionPl: g.descriptionPl ?? `Ćwicz: ${g.topicPl.toLowerCase()} — wybierz dowolną dzielnicę poniżej.`,
    shellCounts: counts,
  };

  const myCats = new Set(detail.errorCategories);
  const related = (allGroups ?? [])
    .filter((cand) => cand.groupId !== groupId)
    .map((cand) => ({
      ...cand,
      _overlap: (cand.errorCategories ?? []).filter((c) => myCats.has(c)).length,
    }))
    .filter((cand) => cand._overlap > 0)
    .sort((a, b) => (b._overlap ?? 0) - (a._overlap ?? 0))
    .slice(0, 3);

  return { group: detail, related, status: 'ready' };
}

// ─────────────────────────────────────────────────────────────────────────────
// ShellTab — one tab in the "practice this in:" strip. Each tab is a button.
// Tap → launch the shell with the group as the filter.
// ─────────────────────────────────────────────────────────────────────────────
interface ShellTabProps {
  shell: ShellKey;
  count?: number;
  index: number;
  onLaunch: () => void;
}

const ShellTab: React.FC<ShellTabProps> = ({ shell, count, index, onLaunch }) => {
  const meta = DISTRICTS_LITE[shell] ?? { name: shell, emoji: '🎯', accent: '#E879F9' };
  return (
    <button
      type="button"
      className="em-gd-tab"
      onClick={onLaunch}
      style={{
        ['--tab-accent' as string]: meta.accent,
        ['--stagger' as string]: `${index * 50}ms`,
      } as React.CSSProperties}
      aria-label={`Practice in ${meta.name}${count != null ? `, ${count} exercises` : ''}`}
    >
      <span className="em-gd-tab-emoji" aria-hidden>{meta.emoji}</span>
      <span className="em-gd-tab-meta">
        <span className="em-gd-tab-name">{meta.name}</span>
        {count != null && (
          <span className="em-gd-tab-count">
            <strong>{count}</strong> exercises · ćwiczeń
          </span>
        )}
      </span>
      <span className="em-gd-tab-arrow" aria-hidden>↗</span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RelatedCard — minimal preview of a sibling group, in the right rail.
// ─────────────────────────────────────────────────────────────────────────────
interface RelatedCardProps {
  group: ExerciseGroup;
  onOpen: () => void;
}

const RelatedCard: React.FC<RelatedCardProps> = ({ group, onOpen }) => {
  const cat = CATEGORY_ACCENT[group.category];
  const label = CATEGORY_LABEL[group.category];
  return (
    <button
      type="button"
      className="em-gd-related"
      onClick={onOpen}
      style={{
        ['--accent' as string]: cat.accent,
      } as React.CSSProperties}
    >
      <div className="em-gd-related-meta">
        <span className="em-gd-related-cat">{label.emoji} {label.en}</span>
        <span className="em-gd-related-level">{group.cefrLevel}</span>
      </div>
      <div className="em-gd-related-topic">{group.topicEn}</div>
      <div className="em-gd-related-topic-pl">{group.topicPl}</div>
      <div className="em-gd-related-foot">
        <span>{group.exerciseCount} exercises</span>
        <span className="em-gd-related-arrow" aria-hidden>→</span>
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GroupDetail — the main page component.
// ─────────────────────────────────────────────────────────────────────────────
export const GroupDetail: React.FC<GroupDetailProps> = ({ groupId, onBack, onLaunchShell, onOpenGroup }) => {
  const { group, related, status } = useGroupDetail(groupId);
  const [whyOpen, setWhyOpen] = useState(false);
  // Mike 2026-05-02: collapse non-test-english-equivalent shells under
  // "Show more". Default false → MC/GapFill/OpenCloze visible only.
  const [moreOpen, setMoreOpen] = useState(false);

  const cat: GroupCategory = group?.category ?? 'grammar';
  const accent = CATEGORY_ACCENT[cat].accent;
  const accentGlow = CATEGORY_ACCENT[cat].glow;
  const gradient = CATEGORY_ACCENT[cat].gradient;
  const catLabel = CATEGORY_LABEL[cat];

  // Whose voice writes the "Why these shells?" copy? Bajla's. Same eyebrow,
  // same bilingual rhythm we use everywhere.
  const whyCopyEn = useMemo(() => {
    if (!group) return '';
    const districtNames = group.compatibleShells
      .map((s) => DISTRICTS_LITE[s]?.name ?? s)
      .slice(0, 3)
      .join(', ');
    return `These districts share an exercise format that fits the topic. ${districtNames} all let you spot the right form in context, which is exactly the move this topic asks of you.`;
  }, [group]);
  const whyCopyPl = useMemo(() => {
    if (!group) return '';
    return `Te dzielnice korzystają z formatu ćwiczeń, który pasuje do tematu. Wszystkie pozwalają dostrzec właściwą formę w kontekście — a tego dokładnie wymaga ten temat.`;
  }, [group]);

  if (status === 'loading' || !group) {
    return (
      <div className="em-dash">
        <GroupDetailStyles />
        <div className="em-dash-inner">
          <div className="em-pg-loading">
            <div className="em-pg-loading-spinner" aria-hidden />
            <div>Loading topic… <span style={{ opacity: 0.6 }}>Wczytywanie tematu…</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="em-dash">
      <GroupDetailStyles />
      <div className="em-dash-inner">
        {/* Back link */}
        <button type="button" className="em-pg-back" onClick={onBack} style={{ marginBottom: 18 }}>
          <span className="em-pg-back-arrow" aria-hidden>←</span>
          Back to topics · Wróć do tematów
        </button>

        {/* Two-column desktop layout, single-column mobile. */}
        <div className="em-gd-layout">
          {/* ── MAIN COLUMN ─────────────────────────────────────────── */}
          <main className="em-gd-main">
            {/* Header card — gradient block w/ category accent + Bajla cameo */}
            <header
              className="em-gd-header em-grain"
              style={{
                ['--gd-accent' as string]: accent,
                ['--gd-accent-glow' as string]: accentGlow,
                background: gradient,
              } as React.CSSProperties}
            >
              <div className="em-gd-header-bajla" aria-hidden>
                <Bajla size={92} mood="wave" />
              </div>
              <div className="em-gd-header-meta">
                <span className="em-gd-header-cat">{catLabel.emoji} {catLabel.en} · {catLabel.pl}</span>
                <span className="em-gd-header-level">{group.cefrLevel}</span>
              </div>
              <h1 className="em-gd-header-title">{group.topicEn}</h1>
              <p className="em-gd-header-title-pl">{group.topicPl}</p>
              <div className="em-gd-header-stats">
                <div>
                  <strong>{group.exerciseCount}</strong>
                  <span>exercises · ćwiczeń</span>
                </div>
                <div>
                  <strong>{group.compatibleShells.length}</strong>
                  <span>districts · dzielnic</span>
                </div>
              </div>
            </header>

            {/* Bilingual description card */}
            {(group.descriptionEn || group.descriptionPl) && (
              <section className="em-gd-desc">
                <div className="em-gd-desc-eyebrow">About this topic · O temacie</div>
                {group.descriptionEn && (
                  <p className="em-gd-desc-en">{group.descriptionEn}</p>
                )}
                {group.descriptionPl && (
                  <p className="em-gd-desc-pl">🇵🇱 {group.descriptionPl}</p>
                )}
              </section>
            )}

            {/* District tab strip */}
            <section className="em-gd-tabs-section" aria-label="Practice this topic in">
              <div className="em-gd-tabs-head">
                <div>
                  <div className="em-eyebrow" style={{ color: accent }}>
                    Practice this topic in · Ćwicz w
                  </div>
                  <h2 className="em-gd-tabs-title">
                    {group.compatibleShells.length} compatible {group.compatibleShells.length === 1 ? 'district' : 'districts'}.
                  </h2>
                </div>
              </div>
              {(() => {
                // Mike 2026-05-02: only show the 3 shells with direct
                // test-english.com equivalents by default. Other compatible
                // districts collapsed under "Show more · Pokaż więcej".
                // The 3 are MultipleChoice (Bulletin Board) / GapFill
                // (Construction Quarter) / OpenCloze (Vellum Atelier).
                const TEST_ENGLISH_EQUIVALENTS: ShellKey[] = ['multiplechoice', 'gapfill', 'opencloze'];
                const featured = group.compatibleShells.filter((s) => TEST_ENGLISH_EQUIVALENTS.includes(s));
                const extras = group.compatibleShells.filter((s) => !TEST_ENGLISH_EQUIVALENTS.includes(s));
                return (
                  <>
                    <div className="em-gd-tabs-strip">
                      {featured.map((shell, i) => (
                        <ShellTab
                          key={shell}
                          shell={shell}
                          count={group.shellCounts?.[shell]}
                          index={i}
                          onLaunch={() => onLaunchShell(shell, group)}
                        />
                      ))}
                    </div>
                    {extras.length > 0 && (
                      <div className={`em-gd-extras${moreOpen ? ' is-open' : ''}`}>
                        <button
                          type="button"
                          className="em-gd-extras-toggle"
                          onClick={() => setMoreOpen((v) => !v)}
                          aria-expanded={moreOpen}
                          aria-controls="em-gd-extras-list"
                        >
                          <span>
                            {moreOpen ? 'Show fewer' : `Show ${extras.length} more `}·{' '}
                            {moreOpen ? 'Pokaż mniej' : 'Pokaż więcej'}
                          </span>
                          <span className="em-gd-extras-chev" aria-hidden>{moreOpen ? '−' : '+'}</span>
                        </button>
                        {moreOpen && (
                          <div id="em-gd-extras-list" className="em-gd-tabs-strip" style={{ marginTop: 12 }}>
                            {extras.map((shell, i) => (
                              <ShellTab
                                key={shell}
                                shell={shell}
                                count={group.shellCounts?.[shell]}
                                index={featured.length + i}
                                onLaunch={() => onLaunchShell(shell, group)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Why-these-shells expandable */}
              <div className={`em-gd-why${whyOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="em-gd-why-toggle"
                  onClick={() => setWhyOpen((v) => !v)}
                  aria-expanded={whyOpen}
                >
                  <span>Why these shells? · Dlaczego te dzielnice?</span>
                  <span className="em-gd-why-chev" aria-hidden>{whyOpen ? '−' : '+'}</span>
                </button>
                {whyOpen && (
                  <div className="em-gd-why-body">
                    <p className="em-gd-why-en">{whyCopyEn}</p>
                    <p className="em-gd-why-pl">🇵🇱 {whyCopyPl}</p>
                  </div>
                )}
              </div>
            </section>
          </main>

          {/* ── RIGHT RAIL ──────────────────────────────────────────── */}
          <aside className="em-gd-rail" aria-label="Related topics">
            <div className="em-eyebrow" style={{ color: 'var(--em-violet)' }}>
              Related topics · Powiązane
            </div>
            <h3 className="em-gd-rail-title">Other plazas to visit</h3>
            <div className="em-gd-rail-list">
              {related.length === 0 ? (
                <div className="em-gd-rail-empty">
                  No close matches yet — Bajla is still mapping the streets.
                </div>
              ) : (
                related.map((g) => (
                  <RelatedCard
                    key={g.groupId}
                    group={g}
                    onOpen={() => onOpenGroup?.(g.groupId)}
                  />
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default GroupDetail;

// ─────────────────────────────────────────────────────────────────────────────
// Styles — page-scoped, injected via <style>. Mirrors the pattern in
// PracticeGroups.tsx + GroupingPill.tsx so all three new files keep their
// CSS self-contained and don't touch global.css (avoids merge conflicts
// with sister agents).
// ─────────────────────────────────────────────────────────────────────────────
const GD_CSS = `
.em-practice-root .em-gd-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  align-items: start;
}
@media (max-width: 960px) {
  .em-practice-root .em-gd-layout { grid-template-columns: 1fr; }
}

/* ─── Header card ─── */
.em-practice-root .em-gd-header {
  position: relative;
  padding: 36px 32px 28px;
  border-radius: 24px;
  border: 1px solid color-mix(in srgb, var(--gd-accent, #E879F9) 24%, transparent);
  overflow: hidden;
  margin-bottom: 22px;
  animation: em-rise 540ms var(--em-ease) both;
}
.em-practice-root .em-gd-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 50% 80% at 100% 0%, color-mix(in srgb, var(--gd-accent, #E879F9) 18%, transparent), transparent 60%),
    radial-gradient(ellipse 70% 50% at 0% 100%, rgba(0,0,0,0.3), transparent 60%);
  pointer-events: none;
}
.em-practice-root .em-gd-header > * { position: relative; z-index: 1; }

.em-practice-root .em-gd-header-bajla {
  position: absolute;
  top: 22px;
  right: 26px;
  z-index: 2;
  filter: drop-shadow(0 12px 18px var(--gd-accent-glow, rgba(232,121,249,0.4)));
}
.em-practice-root .em-gd-header-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.em-practice-root .em-gd-header-cat {
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gd-accent, #E879F9);
}
.em-practice-root .em-gd-header-level {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--gd-accent, #E879F9) 40%, transparent);
  background: color-mix(in srgb, var(--gd-accent, #E879F9) 16%, transparent);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  color: var(--gd-accent, #E879F9);
}
.em-practice-root .em-gd-header-title {
  margin: 0 0 6px;
  font-family: var(--em-decor);
  font-size: clamp(36px, 5vw, 54px);
  line-height: 0.98;
  color: var(--em-text);
  letter-spacing: -0.01em;
  padding-right: 110px;
}
.em-practice-root .em-gd-header-title-pl {
  margin: 0 0 22px;
  font-style: italic;
  font-size: 16px;
  color: var(--em-text-muted, #C4B8E0);
  opacity: 0.85;
  padding-right: 110px;
}
.em-practice-root .em-gd-header-stats {
  display: flex;
  gap: 28px;
  padding-top: 16px;
  border-top: 1px solid rgba(245, 239, 255, 0.1);
}
.em-practice-root .em-gd-header-stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.em-practice-root .em-gd-header-stats strong {
  font-family: var(--em-decor);
  font-size: 28px;
  line-height: 1;
  color: var(--gd-accent, #E879F9);
}
.em-practice-root .em-gd-header-stats span {
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--em-text-muted);
  opacity: 0.7;
}
@media (max-width: 640px) {
  .em-practice-root .em-gd-header-bajla { display: none; }
  .em-practice-root .em-gd-header-title,
  .em-practice-root .em-gd-header-title-pl { padding-right: 0; }
  .em-practice-root .em-gd-header { padding: 28px 22px 22px; }
}

/* ─── Description card ─── */
.em-practice-root .em-gd-desc {
  padding: 22px 24px;
  margin-bottom: 22px;
  border-radius: 18px;
  border: 1px solid rgba(232, 121, 249, 0.18);
  background:
    radial-gradient(ellipse 50% 100% at 0% 0%, rgba(232, 121, 249, 0.08), transparent 60%),
    rgba(14, 10, 26, 0.6);
  animation: em-rise 540ms var(--em-ease) 60ms both;
}
.em-practice-root .em-gd-desc-eyebrow {
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--em-magenta, #E879F9);
  margin-bottom: 10px;
}
.em-practice-root .em-gd-desc-en {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--em-text);
}
.em-practice-root .em-gd-desc-pl {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--em-text-muted, #C4B8E0);
  font-style: italic;
  opacity: 0.88;
}

/* ─── Tab strip ─── */
.em-practice-root .em-gd-tabs-section {
  margin-bottom: 32px;
  animation: em-rise 540ms var(--em-ease) 120ms both;
}
.em-practice-root .em-gd-tabs-head { margin-bottom: 14px; }
.em-practice-root .em-gd-tabs-title {
  margin: 4px 0 0;
  font-family: var(--em-decor);
  font-size: clamp(22px, 2.6vw, 28px);
  line-height: 1.1;
  color: var(--em-text);
  letter-spacing: -0.005em;
}
.em-practice-root .em-gd-tabs-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.em-practice-root .em-gd-tab {
  --tab-accent: #E879F9;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(245, 239, 255, 0.1);
  background:
    radial-gradient(ellipse 50% 100% at 0% 50%, color-mix(in srgb, var(--tab-accent) 12%, transparent), transparent 70%),
    rgba(14, 10, 26, 0.55);
  color: var(--em-text);
  text-align: left;
  cursor: pointer;
  transition: transform 200ms var(--em-ease), border-color 200ms var(--em-ease), box-shadow 200ms var(--em-ease);
  animation: em-rise 480ms var(--em-ease) var(--stagger, 0ms) both;
}
.em-practice-root .em-gd-tab:hover,
.em-practice-root .em-gd-tab:focus-visible {
  border-color: var(--tab-accent);
  transform: translateY(-2px);
  box-shadow: 0 10px 22px -14px color-mix(in srgb, var(--tab-accent) 60%, transparent);
}
.em-practice-root .em-gd-tab-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tab-accent) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--tab-accent) 36%, transparent);
  font-size: 18px;
  flex-shrink: 0;
}
.em-practice-root .em-gd-tab-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.em-practice-root .em-gd-tab-name {
  font-family: var(--em-decor);
  font-size: 15px;
  line-height: 1.1;
  color: var(--em-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.em-practice-root .em-gd-tab-count {
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--em-text-muted);
  opacity: 0.78;
}
.em-practice-root .em-gd-tab-count strong {
  color: var(--tab-accent);
  font-weight: 700;
  margin-right: 3px;
}
.em-practice-root .em-gd-tab-arrow {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--tab-accent) 16%, transparent);
  color: var(--tab-accent);
  font-size: 13px;
  transition: transform 200ms var(--em-ease);
}
.em-practice-root .em-gd-tab:hover .em-gd-tab-arrow {
  transform: translate(2px, -2px);
}

/* ─── Why-these-shells expandable ─── */
.em-practice-root .em-gd-why {
  margin-top: 18px;
  border-radius: 14px;
  border: 1px dashed rgba(167, 139, 250, 0.32);
  background: rgba(167, 139, 250, 0.04);
  overflow: hidden;
}
.em-practice-root .em-gd-why-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 18px;
  border: none;
  background: transparent;
  color: var(--em-violet, #A78BFA);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
  transition: background 180ms var(--em-ease);
}
/* Mike 2026-05-02: "Show more" toggle for extra compatible districts that
 * aren't the 3 test-english.com equivalents (MC/GapFill/OpenCloze). */
.em-practice-root .em-gd-extras {
  margin-top: 12px;
  border: 1px dashed rgba(245, 239, 255, 0.18);
  border-radius: 10px;
  background: rgba(20, 16, 42, 0.35);
}
.em-practice-root .em-gd-extras-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 18px;
  border: none;
  background: transparent;
  color: var(--em-text-muted, rgba(245, 239, 255, 0.65));
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
  transition: background 180ms var(--em-ease), color 180ms var(--em-ease);
}
.em-practice-root .em-gd-extras-toggle:hover { background: rgba(232, 121, 249, 0.06); color: var(--em-text, #EDE6FF); }
.em-practice-root .em-gd-extras.is-open .em-gd-extras-toggle { color: var(--em-text, #EDE6FF); }
.em-practice-root .em-gd-extras-chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(232, 121, 249, 0.16);
  color: var(--em-magenta, #E879F9);
  font-size: 14px;
  line-height: 1;
}
#em-gd-extras-list {
  padding: 0 14px 14px;
}
.em-practice-root .em-gd-why-toggle:hover { background: rgba(167, 139, 250, 0.08); }
.em-practice-root .em-gd-why-chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(167, 139, 250, 0.14);
  font-size: 16px;
  line-height: 1;
}
.em-practice-root .em-gd-why-body {
  padding: 0 18px 16px;
  animation: em-rise 320ms var(--em-ease) both;
}
.em-practice-root .em-gd-why-en {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--em-text);
}
.em-practice-root .em-gd-why-pl {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--em-text-muted);
  font-style: italic;
  opacity: 0.85;
}

/* ─── Right rail: related topics ─── */
.em-practice-root .em-gd-rail {
  position: sticky;
  top: 24px;
  padding: 20px 18px;
  border-radius: 18px;
  border: 1px solid rgba(167, 139, 250, 0.18);
  background:
    radial-gradient(ellipse 80% 60% at 100% 0%, rgba(167, 139, 250, 0.1), transparent 60%),
    rgba(14, 10, 26, 0.55);
  animation: em-rise 540ms var(--em-ease) 180ms both;
}
.em-practice-root .em-gd-rail-title {
  margin: 4px 0 16px;
  font-family: var(--em-decor);
  font-size: 22px;
  line-height: 1.1;
  color: var(--em-text);
}
.em-practice-root .em-gd-rail-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.em-practice-root .em-gd-rail-empty {
  padding: 16px;
  border-radius: 12px;
  border: 1px dashed rgba(245, 239, 255, 0.14);
  background: rgba(245, 239, 255, 0.03);
  color: var(--em-text-muted);
  font-size: 13px;
  font-style: italic;
}

.em-practice-root .em-gd-related {
  --accent: #A78BFA;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(245, 239, 255, 0.08);
  background:
    radial-gradient(ellipse 50% 100% at 0% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 60%),
    rgba(14, 10, 26, 0.5);
  color: var(--em-text);
  text-align: left;
  cursor: pointer;
  transition: transform 180ms var(--em-ease), border-color 180ms var(--em-ease);
}
.em-practice-root .em-gd-related:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.em-practice-root .em-gd-related-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.em-practice-root .em-gd-related-cat { color: var(--accent); }
.em-practice-root .em-gd-related-level {
  padding: 2px 8px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
  color: var(--accent);
}
.em-practice-root .em-gd-related-topic {
  font-family: var(--em-decor);
  font-size: 16px;
  line-height: 1.15;
  color: var(--em-text);
}
.em-practice-root .em-gd-related-topic-pl {
  font-size: 13px;
  font-style: italic;
  color: var(--em-text-muted);
  opacity: 0.78;
}
.em-practice-root .em-gd-related-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(245, 239, 255, 0.06);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--em-text-muted);
}
.em-practice-root .em-gd-related-arrow {
  font-size: 13px;
  color: var(--accent);
}

@media (max-width: 960px) {
  .em-practice-root .em-gd-rail { position: static; }
}
`;

const GroupDetailStyles: React.FC = () => <style>{GD_CSS}</style>;
