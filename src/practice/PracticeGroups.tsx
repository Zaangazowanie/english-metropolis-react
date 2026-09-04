// PracticeGroups.tsx — /practice/groups landing page.
// ─────────────────────────────────────────────────────────────────────────────
// Mike's reference: test-english.com's B2 grammar card grid (one card per
// language grouping — "Have: auxiliary or main verb", "Reflexive pronouns",
// "Modal verbs of speculation", etc.). Tapping a card opens a topic page
// where the student can practice that grouping in any compatible district.
//
// In our city-of-districts metaphor a "grouping" is a *topic square* — a
// neighborhood plaza where multiple districts intersect. The grid is the
// atlas; each card is one square. The page sits behind /practice/groups
// (mounted by main session into StudentPractice).
//
// DATA — Agent A is shipping these Convex queries:
//   • api.exerciseGroups.listGroups({ cefrLevel?, category? })
//   • api.exerciseGroups.getGroup({ groupId })
//   • api.exerciseGroups.getCompatibleShellsForGroup({ groupId })
//
// At time of writing (2026-05-02) Agent A's branch isn't merged yet. We wire
// against the EXPECTED shape and stub with mock data so the UI is testable
// against gold. Main session swaps `useExerciseGroups` to call queryConvex
// once Agent A lands; the stub block below is the only diff.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Bajla } from './components/primitives';
import type { ShellKey } from './lib/shell-selector';
import { useQueryConvex } from './lib/convex-stubs';
import { fetchJSONCached } from './lib/practice-cache';
import {
  CATEGORY_ACCENT,
  CATEGORY_LABEL,
  type GroupCategory,
} from './lib/groupContext';

// ─────────────────────────────────────────────────────────────────────────────
// Public types — mirror Agent A's Convex query return shapes (per spec).
// ─────────────────────────────────────────────────────────────────────────────
export interface ExerciseGroup {
  groupId: string;
  topicEn: string;
  topicPl: string;
  cefrLevel: string;          // 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  category: GroupCategory;
  illustrationUrl?: string;   // optional thumbnail / icon URL
  exerciseCount: number;      // how many exercises are tagged into this group
  compatibleShells: ShellKey[];
  /**
   * Optional. The error-categories this group exercises — used by GroupDetail's
   * right rail to find related groups.
   */
  errorCategories?: string[];
}

export interface PracticeGroupsProps {
  /** Student's CEFR band — drives the level filter. */
  studentLevel?: string;
  /**
   * Navigation: open a single group's detail page. Main session wires this
   * to react-router's navigate(`/practice/groups/${groupId}`).
   */
  onOpenGroup: (groupId: string) => void;
  /** Back to the district atlas (the main /practice surface). */
  onBack?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// useExerciseGroups — stub today, Convex tomorrow.
// ─────────────────────────────────────────────────────────────────────────────
// MAIN-SESSION SWAP-IN:
//   Replace MOCK_GROUPS with `queryConvex<ExerciseGroup[]>('exerciseGroups:listGroups', { cefrLevel, category })`
//   wrapped in a useEffect (see lib/convex-stubs.ts useQueryConvex for the pattern).
//   Keep the rest of the component identical.
//
// The mock list is calibrated to look like a realistic B2 atlas (~12 groups
// across 4 categories) so the visual reads correctly during dev. Once Agent
// A's data lands the count will jump to whatever's seeded in Convex.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_GROUPS: ExerciseGroup[] = [
  // ── GRAMMAR ────────────────────────────────────────────────────────────
  { groupId: 'mock-modals-spec',     topicEn: 'Modal verbs of speculation',     topicPl: 'Czasowniki modalne — przypuszczenie',     cefrLevel: 'B2', category: 'grammar',         exerciseCount: 24, compatibleShells: ['multiplechoice', 'gapfill', 'truefalse', 'sentencetransform', 'sentencecorrection'], errorCategories: ['grammar-modal'] },
  { groupId: 'mock-have-aux',        topicEn: 'Have — auxiliary or main verb',  topicPl: '"Have" — operator czy czasownik główny',  cefrLevel: 'B2', category: 'grammar',         exerciseCount: 18, compatibleShells: ['multiplechoice', 'gapfill', 'truefalse', 'sentencecorrection'], errorCategories: ['grammar-aspect', 'grammar-tense'] },
  { groupId: 'mock-reflexive',       topicEn: 'Reflexive pronouns',             topicPl: 'Zaimki zwrotne',                          cefrLevel: 'B1', category: 'grammar',         exerciseCount: 15, compatibleShells: ['multiplechoice', 'gapfill', 'dragdrop', 'opencloze'], errorCategories: ['grammar-determiner'] },
  { groupId: 'mock-conditionals',    topicEn: 'Mixed conditionals',             topicPl: 'Okresy warunkowe — typy mieszane',        cefrLevel: 'B2', category: 'grammar',         exerciseCount: 22, compatibleShells: ['multiplechoice', 'gapfill', 'sentencetransform', 'unjumble'], errorCategories: ['grammar-conditional'] },
  { groupId: 'mock-passive-rep',     topicEn: 'Passive — reporting structures', topicPl: 'Strona bierna — struktury sprawozdawcze', cefrLevel: 'C1', category: 'grammar',         exerciseCount: 16, compatibleShells: ['multiplechoice', 'gapfill', 'sentencetransform', 'sentencecorrection'], errorCategories: ['grammar-passive'] },
  { groupId: 'mock-articles-zero',   topicEn: 'Articles — the zero article',    topicPl: 'Przedimek zerowy',                        cefrLevel: 'B1', category: 'grammar',         exerciseCount: 20, compatibleShells: ['multiplechoice', 'gapfill', 'opencloze', 'truefalse'], errorCategories: ['grammar-article'] },
  // ── VOCABULARY ─────────────────────────────────────────────────────────
  { groupId: 'mock-phrasal-take',    topicEn: 'Phrasal verbs with "take"',      topicPl: 'Czasowniki frazowe z "take"',             cefrLevel: 'B2', category: 'vocabulary',      exerciseCount: 30, compatibleShells: ['multiplechoice', 'matching', 'flashcards', 'gapfill', 'concentration'], errorCategories: ['phrasal-verb'] },
  { groupId: 'mock-collocations-do', topicEn: 'Collocations — do vs make',      topicPl: 'Kolokacje — "do" kontra "make"',          cefrLevel: 'B1', category: 'vocabulary',      exerciseCount: 26, compatibleShells: ['multiplechoice', 'matching', 'gapfill', 'dragdrop'], errorCategories: ['collocation'] },
  { groupId: 'mock-business-idioms', topicEn: 'Business idioms',                topicPl: 'Idiomy biznesowe',                        cefrLevel: 'B2', category: 'vocabulary',      exerciseCount: 18, compatibleShells: ['multiplechoice', 'matching', 'flashcards', 'sentencetransform'], errorCategories: ['idiom'] },
  // ── USE OF ENGLISH ─────────────────────────────────────────────────────
  { groupId: 'mock-cae-key-word',    topicEn: 'CAE key word transformation',    topicPl: 'CAE — transformacja zdań kluczowym słowem', cefrLevel: 'C1', category: 'use-of-english', exerciseCount: 28, compatibleShells: ['multiplechoice', 'sentencetransform', 'opencloze', 'wordformation'], errorCategories: ['grammar-modal', 'grammar-passive'] },
  // ── READING / LISTENING ────────────────────────────────────────────────
  { groupId: 'mock-reading-multiple', topicEn: 'Multiple matching headlines',   topicPl: 'Dopasowywanie nagłówków',                 cefrLevel: 'B2', category: 'reading',         exerciseCount: 12, compatibleShells: ['readingcomp', 'multiplechoice', 'matching'], errorCategories: ['reading'] },
  { groupId: 'mock-listening-gist',  topicEn: 'Listening for gist',             topicPl: 'Słuchanie ogólnego sensu',                cefrLevel: 'B1', category: 'listening',       exerciseCount: 14, compatibleShells: ['listeningcomp', 'multiplechoice', 'truefalse'], errorCategories: ['listening'] },
];

interface UseExerciseGroupsResult {
  groups: ExerciseGroup[];
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

function useExerciseGroups(opts: { cefrLevel?: string; category?: GroupCategory | null }): UseExerciseGroupsResult {
  const { cefrLevel, category } = opts;
  // 2026-05-02: wired to real Convex query (Agent A's exerciseGroups schema).
  // Returns same-level + one-band-easier so e.g. B2 students see B1 revision
  // material too — server doesn't compute that, so we expand client-side.
  const bands = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const idx = cefrLevel ? Math.max(0, bands.indexOf(cefrLevel.toUpperCase())) : -1;
  const allowedBand = cefrLevel ? bands[idx] : undefined;
  const easierBand = cefrLevel && idx > 0 ? bands[idx - 1] : undefined;

  const same = useQueryConvex<ExerciseGroup[]>(
    'exerciseGroups:listGroups',
    { cefrLevel: allowedBand, category: category ?? undefined },
  );
  const easier = useQueryConvex<ExerciseGroup[]>(
    easierBand ? 'exerciseGroups:listGroups' : null,
    { cefrLevel: easierBand, category: category ?? undefined },
  );

  if (same === undefined || (easierBand && easier === undefined)) {
    return { groups: [], status: 'loading' };
  }
  const merged = [...(same ?? []), ...(easier ?? [])];
  // Dedup defensively (queries are scoped by level so collision shouldn't happen)
  const seen = new Set<string>();
  const groups = merged.filter((g) => {
    if (seen.has(g.groupId)) return false;
    seen.add(g.groupId);
    return true;
  });
  return { groups, status: 'ready' };
}

// ─────────────────────────────────────────────────────────────────────────────
// useTopicScenes — fetches the LLM-pre-passed example sentences + visual scenes
// (one entry per groupId) from /topic-scenes.json. The file is generated by
// scripts/llm-prepass.py and incrementally synced to /var/www/englishmetro/
// by a minutely cron. Returns a Map<groupId, {exampleEn, examplePl}>.
// Fetched once per page mount; static asset, browser caches.
// ─────────────────────────────────────────────────────────────────────────────
interface SceneRow {
  groupId: string;
  exampleEn?: string;
  examplePl?: string;
  status?: string;
}
function useTopicScenes(): Map<string, SceneRow> {
  const [map, setMap] = useState<Map<string, SceneRow>>(new Map());
  useEffect(() => {
    let cancelled = false;
    // 30s timeout + 5-min in-memory cache so route-flips don't re-pull the
    // (large, static) topic-scenes.json on every PracticeGroups remount.
    fetchJSONCached<SceneRow[]>('/topic-scenes.json', {
      init: { cache: 'force-cache' },
      cacheKey: 'topic-scenes',
    })
      .then((arr) => {
        if (cancelled) return;
        const m = new Map<string, SceneRow>();
        for (const r of arr || []) {
          if (r.groupId && r.status === 'ok' && r.exampleEn) m.set(r.groupId, r);
        }
        setMap(m);
      })
      .catch(() => { /* fine — overlay just won't render */ });
    return () => { cancelled = true; };
  }, []);
  return map;
}

// Stable hash → used to decide whether each card shows the speech-bubble
// overlay. ~33% of cards (hash % 3 === 0) get text; the rest stay clean.
// Same group always gets the same decision so the layout doesn't jitter.
function shouldShowBubble(groupId: string): boolean {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) h = (h * 31 + groupId.charCodeAt(i)) | 0;
  return Math.abs(h) % 3 === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// CategoryChip — like the existing district pills but rendered as a filter.
// Active state lights up the brand magenta. Bilingual label inline.
// ─────────────────────────────────────────────────────────────────────────────
const ALL_CATEGORIES: (GroupCategory | null)[] = [
  null, 'grammar', 'vocabulary', 'use-of-english', 'reading', 'listening', 'writing', 'speaking',
];

interface CategoryChipProps {
  cat: GroupCategory | null;
  active: boolean;
  onSelect: () => void;
}

const CategoryChip: React.FC<CategoryChipProps> = ({ cat, active, onSelect }) => {
  const meta = cat ? CATEGORY_LABEL[cat] : { en: 'All topics', pl: 'Wszystkie tematy', emoji: '✦' };
  const accent = cat ? CATEGORY_ACCENT[cat].accent : '#FBBF24';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`em-pg-chip${active ? ' is-active' : ''}`}
      aria-pressed={active}
      style={{
        ['--chip-accent' as string]: accent,
      } as React.CSSProperties}
    >
      <span className="em-pg-chip-emoji" aria-hidden>{meta.emoji}</span>
      <span className="em-pg-chip-en">{meta.en}</span>
      <span className="em-pg-chip-pl">{meta.pl}</span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GroupCard — one card in the atlas. Each card carries its category accent
// + gradient as CSS custom properties, so a single .em-pg-card rule renders
// every card with its own personality.
// ─────────────────────────────────────────────────────────────────────────────
interface GroupCardProps {
  group: ExerciseGroup;
  index: number;
  onSelect: (id: string) => void;
  scene?: SceneRow;            // LLM-generated example sentence + visual scene
  showBubble?: boolean;        // 33% deterministic — Mike, 2026-05-02 08:39 UTC
}

const GroupCard: React.FC<GroupCardProps> = ({ group, index, onSelect, scene, showBubble }) => {
  const cat = CATEGORY_ACCENT[group.category];
  const label = CATEGORY_LABEL[group.category];
  const [pressing, setPressing] = useState(false);
  const handle = () => {
    setPressing(true);
    window.setTimeout(() => onSelect(group.groupId), 220);
  };

  return (
    <button
      type="button"
      className={`em-pg-card${pressing ? ' is-pressing' : ''}`}
      onClick={handle}
      style={{
        ['--card-grad' as string]: cat.gradient,
        ['--accent' as string]: cat.accent,
        ['--accent-glow' as string]: cat.glow,
        ['--stagger' as string]: `${index * 60}ms`,
      } as React.CSSProperties}
      aria-label={`${group.topicEn} — ${group.exerciseCount} exercises in ${group.compatibleShells.length} districts`}
    >
      {/* Illustration banner — pixar-style scene depicting an example
          sentence for this topic. Populated incrementally by the MiniMax
          image-gen pipeline (~50 cards per quota window over ~11 hours).
          Cards without an illustration fall through to the gradient surface
          + emoji stamp; visually different but never broken. */}
      {group.illustrationUrl && (
        <div className="em-pg-card-illu" aria-hidden>
          <img
            src={group.illustrationUrl}
            alt=""
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          {showBubble && scene?.exampleEn && (
            <div className="em-pg-card-bubble" role="presentation">
              <div className="em-pg-card-bubble-text">{scene.exampleEn}</div>
              <svg className="em-pg-card-bubble-tail" viewBox="0 0 16 14" aria-hidden>
                <path d="M0 0 L16 0 L8 14 Z" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Stamp: category code, top-right. Like postage on an envelope. */}
      <div className="em-pg-card-stamp" aria-hidden>
        <div className="em-pg-card-stamp-emoji">{label.emoji}</div>
        <div className="em-pg-card-stamp-cat">{label.en}</div>
      </div>

      {/* CEFR level chip, top-left */}
      <div className="em-pg-card-level" aria-hidden>{group.cefrLevel}</div>

      {/* Topic — Caprasimo display headline */}
      <h3 className="em-pg-card-topic">{group.topicEn}</h3>
      <p className="em-pg-card-topic-pl">{group.topicPl}</p>

      {/* Footer: stats + CTA chevron */}
      <div className="em-pg-card-foot">
        <div className="em-pg-card-stats">
          <div className="em-pg-card-stat">
            <strong>{group.exerciseCount}</strong>
            <span>exercises · ćwiczeń</span>
          </div>
          <div className="em-pg-card-stat">
            <strong>{group.compatibleShells.length}</strong>
            <span>districts · dzielnic</span>
          </div>
        </div>
        <div className="em-pg-card-cta">
          <span>OPEN</span>
          <span className="em-pg-card-arrow" aria-hidden>↗</span>
        </div>
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PracticeGroups — the main page component.
// ─────────────────────────────────────────────────────────────────────────────
export const PracticeGroups: React.FC<PracticeGroupsProps> = ({
  studentLevel = 'B1',
  onOpenGroup,
  onBack,
}) => {
  const [activeCategory, setActiveCategory] = useState<GroupCategory | null>(null);
  const { groups, status } = useExerciseGroups({
    cefrLevel: studentLevel,
    category: activeCategory,
  });
  const scenes = useTopicScenes();

  // Ranked: alphabetical by topicEn within each category for stable order.
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.topicEn.localeCompare(b.topicEn)),
    [groups],
  );

  return (
    <div className="em-dash">
      {/* The single source of styles for this page is appended at the bottom of
          this file as a <style> tag rather than added to global.css — keeps
          Agent B's diff self-contained and avoids touching the
          1374-line global.css that other agents may be editing. */}
      <PracticeGroupsStyles />

      <div className="em-dash-inner">
        {/* ── HEADER STRIP ─────────────────────────────────────────────── */}
        <div className="em-pg-hero em-grain">
          {/* Bajla cameo, top-right (matches PitchCard convention). */}
          <div className="em-pg-hero-bajla" aria-hidden>
            <Bajla size={120} mood="wave" />
          </div>

          {/* Faint plaza-floor SVG behind the hero copy — diamond grid that
              suggests cobblestones in a city square. Pure decoration. */}
          <svg className="em-pg-hero-plaza" viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden>
            <defs>
              <pattern id="em-pg-diamond" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M 0 0 L 40 0 L 40 40 L 0 40 Z" fill="none" stroke="#E879F9" strokeOpacity="0.06" strokeWidth="1" />
              </pattern>
              <linearGradient id="em-pg-plaza-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity="0.45" />
              </linearGradient>
            </defs>
            <rect width="1200" height="400" fill="url(#em-pg-diamond)" />
            <rect width="1200" height="400" fill="url(#em-pg-plaza-fade)" />
          </svg>

          {onBack && (
            <button type="button" className="em-pg-back" onClick={onBack}>
              <span className="em-pg-back-arrow" aria-hidden>←</span>
              All districts · Wszystkie dzielnice
            </button>
          )}

          <div className="em-pg-hero-content">
            <div className="em-eyebrow em-pg-eyebrow">
              ATLAS · TEMATY · TOPIC SQUARES
            </div>
            <h1 className="em-pg-title">
              Practice<br />by topic.
            </h1>
            <p className="em-pg-subtitle">
              Each card opens to a topic. Practice it in any compatible district.
              <br />
              <span className="em-pg-subtitle-pl">
                Każda karta otwiera temat. Ćwicz go w dowolnej dopasowanej dzielnicy.
              </span>
            </p>

            <div className="em-pg-level-row">
              <div className="em-level-chip">
                <span className="em-level-chip-dot" aria-hidden />
                Level · Poziom {studentLevel}
              </div>
              <div className="em-pg-count-chip">
                {status === 'loading' ? '— ' : sortedGroups.length} topics shown
              </div>
            </div>
          </div>
        </div>

        {/* ── CATEGORY CHIPS ───────────────────────────────────────────── */}
        <div className="em-pg-chip-row" role="toolbar" aria-label="Filter topics by category">
          {ALL_CATEGORIES.map((cat) => (
            <CategoryChip
              key={cat ?? 'all'}
              cat={cat}
              active={activeCategory === cat}
              onSelect={() => setActiveCategory(cat)}
            />
          ))}
        </div>

        {/* ── GRID ─────────────────────────────────────────────────────── */}
        {status === 'loading' ? (
          <div className="em-pg-loading">
            <div className="em-pg-loading-spinner" aria-hidden />
            <div>
              Loading the atlas… <span style={{ opacity: 0.6 }}>Wczytywanie atlasu…</span>
            </div>
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="em-empty">
            <strong>No topics in this category yet.</strong>
            Try another filter — Bajla is still mapping the streets.<br />
            <span style={{ opacity: 0.6 }}>Spróbuj innego filtra — Bajla wciąż mapuje ulice.</span>
          </div>
        ) : (
          <section aria-label="Topic atlas" className="em-pg-grid">
            {sortedGroups.map((g, i) => (
              <GroupCard
                key={g.groupId}
                group={g}
                index={i}
                onSelect={onOpenGroup}
                scene={scenes.get(g.groupId)}
                showBubble={shouldShowBubble(g.groupId)}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default PracticeGroups;

// ─────────────────────────────────────────────────────────────────────────────
// PracticeGroupsStyles — page-scoped CSS injected via <style>.
// We deliberately avoid editing global.css so Agent D / Agent C diffs stay
// clean. Every selector is namespaced under .em-practice-root .em-pg-*.
// ─────────────────────────────────────────────────────────────────────────────
const PG_CSS = `
.em-practice-root .em-pg-hero {
  position: relative;
  margin: 24px 0 28px;
  padding: 36px 32px 28px;
  border-radius: 24px;
  border: 1px solid rgba(232, 121, 249, 0.18);
  background:
    radial-gradient(ellipse 80% 60% at 12% 0%, rgba(232, 121, 249, 0.22), transparent 55%),
    radial-gradient(ellipse 60% 50% at 95% 20%, rgba(251, 191, 36, 0.14), transparent 60%),
    linear-gradient(160deg, #1F1240 0%, #2D1F4A 50%, #4A2270 100%);
  overflow: hidden;
  animation: em-rise 620ms var(--em-ease) both;
}
.em-practice-root .em-pg-hero-bajla {
  position: absolute;
  top: 22px;
  right: 28px;
  z-index: 2;
  filter: drop-shadow(0 12px 20px rgba(232, 121, 249, 0.4));
}
.em-practice-root .em-pg-hero-plaza {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
.em-practice-root .em-pg-hero-content {
  position: relative;
  z-index: 2;
  max-width: 760px;
}
.em-practice-root .em-pg-back {
  position: relative;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 10px;
  margin-bottom: 22px;
  border-radius: 999px;
  border: 1px solid rgba(167, 139, 250, 0.32);
  background: rgba(167, 139, 250, 0.08);
  color: var(--em-violet, #A78BFA);
  font-family: var(--em-mono, 'IBM Plex Mono', monospace);
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 200ms var(--em-ease), border-color 200ms var(--em-ease), transform 200ms var(--em-ease);
}
.em-practice-root .em-pg-back:hover {
  background: rgba(167, 139, 250, 0.16);
  border-color: rgba(167, 139, 250, 0.6);
  transform: translateX(-2px);
}
.em-practice-root .em-pg-back-arrow {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(167, 139, 250, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
}
.em-practice-root .em-pg-eyebrow {
  color: var(--em-amber, #FBBF24);
  margin-bottom: 14px;
}
.em-practice-root .em-pg-title {
  margin: 0 0 12px;
  font-family: var(--em-decor, 'Caprasimo', Georgia, serif);
  font-size: clamp(48px, 7vw, 76px);
  line-height: 0.92;
  color: var(--em-text, #EDE6FF);
  letter-spacing: -0.015em;
}
.em-practice-root .em-pg-subtitle {
  margin: 14px 0 22px;
  max-width: 540px;
  font-size: 16px;
  line-height: 1.55;
  color: var(--em-text, #EDE6FF);
  opacity: 0.92;
}
.em-practice-root .em-pg-subtitle-pl {
  display: inline-block;
  margin-top: 4px;
  opacity: 0.7;
  font-style: italic;
}
.em-practice-root .em-pg-level-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.em-practice-root .em-pg-count-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(232, 121, 249, 0.32);
  background: rgba(232, 121, 249, 0.06);
  color: var(--em-text, #EDE6FF);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
@media (max-width: 640px) {
  .em-practice-root .em-pg-hero-bajla { display: none; }
  .em-practice-root .em-pg-hero { padding: 28px 22px 22px; }
}

/* ─── Category chip row ─── */
.em-practice-root .em-pg-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 24px;
  padding: 8px 0;
  animation: em-rise 540ms var(--em-ease) 80ms both;
}
.em-practice-root .em-pg-chip {
  --chip-accent: #FBBF24;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid rgba(245, 239, 255, 0.12);
  background: rgba(245, 239, 255, 0.04);
  color: var(--em-text, #EDE6FF);
  font-family: var(--em-body, 'Inter', system-ui, sans-serif);
  font-size: 13px;
  cursor: pointer;
  transition: background 180ms var(--em-ease), border-color 180ms var(--em-ease), transform 180ms var(--em-ease);
}
.em-practice-root .em-pg-chip:hover {
  background: rgba(245, 239, 255, 0.08);
  border-color: rgba(245, 239, 255, 0.24);
  transform: translateY(-1px);
}
.em-practice-root .em-pg-chip.is-active {
  border-color: var(--chip-accent);
  background: color-mix(in srgb, var(--chip-accent) 14%, transparent);
  box-shadow: 0 0 0 1px var(--chip-accent), 0 8px 20px -10px var(--chip-accent);
}
.em-practice-root .em-pg-chip-emoji { font-size: 14px; line-height: 1; }
.em-practice-root .em-pg-chip-en { font-weight: 600; }
.em-practice-root .em-pg-chip-pl {
  font-size: 13px;
  opacity: 0.55;
  font-style: italic;
}

/* ─── The atlas grid ─── */
.em-practice-root .em-pg-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 80px;
}
@media (max-width: 1024px) {
  .em-practice-root .em-pg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .em-practice-root .em-pg-grid { grid-template-columns: 1fr; }
}

/* ─── Topic card ─── */
.em-practice-root .em-pg-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 260px;
  padding: 22px 22px 18px;
  border-radius: 22px;
  border: 1px solid rgba(245, 239, 255, 0.1);
  background: var(--card-grad, linear-gradient(135deg, #1F1240, #4A2270));
  color: var(--em-text, #EDE6FF);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  animation: em-rise 540ms var(--em-ease) var(--stagger, 0ms) both;
  transition: transform 240ms var(--em-ease), box-shadow 240ms var(--em-ease), border-color 240ms var(--em-ease);
}
/* Illustration banner — fills the top half of the card with the
 * pixar-style scene depicting the topic's example sentence. The bottom of
 * the image fades into the card gradient via mask-image so the topic title
 * stays readable. */
.em-practice-root .em-pg-card-illu {
  position: absolute;
  inset: 0 0 auto 0;
  height: 56%;
  z-index: 0;
  overflow: hidden;
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
          mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}
.em-practice-root .em-pg-card-illu img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
/* Speech bubble overlay — shown on ~33% of cards (deterministic by groupId
 * hash). The example sentence is rendered via CSS so it's always legible,
 * never garbled by diffusion-model text drift. */
.em-practice-root .em-pg-card-bubble {
  position: absolute;
  top: 12px;
  left: 12px;
  max-width: 60%;
  padding: 10px 14px 12px;
  background: rgba(255, 255, 255, 0.96);
  color: #1F1240;
  border-radius: 14px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.32);
  z-index: 1;
  animation: em-rise 540ms var(--em-ease) both;
}
.em-practice-root .em-pg-card-bubble-text {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 14px;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.em-practice-root .em-pg-card-bubble-tail {
  position: absolute;
  bottom: -10px;
  left: 22px;
  width: 16px;
  height: 14px;
  fill: rgba(255, 255, 255, 0.96);
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.18));
}
@media (max-width: 720px) {
  .em-practice-root .em-pg-card-bubble {
    max-width: 80%;
    padding: 8px 12px 10px;
  }
  .em-practice-root .em-pg-card-bubble-text { font-size: 13px; }
}
/* Cards with an illustration get extra top padding so the title sits BELOW
 * the image instead of on top of it. Margin pushes the topic block down. */
.em-practice-root .em-pg-card:has(.em-pg-card-illu) .em-pg-card-topic {
  margin-top: 130px;
}
.em-practice-root .em-pg-card:has(.em-pg-card-illu) .em-pg-card-stamp,
.em-practice-root .em-pg-card:has(.em-pg-card-illu) .em-pg-card-level {
  /* Lift chrome above the illustration via z-index */
  z-index: 2;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
/* Glassy diagonal sheen */
.em-practice-root .em-pg-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 60% at 0% 0%, rgba(255,255,255,0.10), transparent 60%),
    radial-gradient(ellipse 50% 40% at 100% 100%, color-mix(in srgb, var(--accent, #E879F9) 22%, transparent), transparent 65%);
  pointer-events: none;
  z-index: 0;
}
/* Soft accent halo on hover */
.em-practice-root .em-pg-card::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  z-index: -1;
  background: var(--accent-glow, rgba(232, 121, 249, 0.4));
  opacity: 0;
  filter: blur(28px);
  transition: opacity 280ms var(--em-ease);
}
.em-practice-root .em-pg-card > * { position: relative; z-index: 1; }
.em-practice-root .em-pg-card:hover,
.em-practice-root .em-pg-card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--accent, #E879F9);
  box-shadow: 0 14px 32px -16px var(--accent-glow, rgba(232,121,249,0.5));
}
.em-practice-root .em-pg-card:hover::after,
.em-practice-root .em-pg-card:focus-visible::after { opacity: 0.55; }
.em-practice-root .em-pg-card:active { transform: translateY(-1px); }
.em-practice-root .em-pg-card.is-pressing {
  animation: em-card-select 220ms var(--em-ease);
}

.em-practice-root .em-pg-card-stamp {
  position: absolute;
  top: 18px;
  right: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px 5px;
  border-radius: 8px;
  border: 1px dashed rgba(245, 239, 255, 0.22);
  background: rgba(14, 10, 26, 0.45);
  z-index: 2;
}
.em-practice-root .em-pg-card-stamp-emoji { font-size: 16px; line-height: 1; }
.em-practice-root .em-pg-card-stamp-cat {
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent, #E879F9);
}

.em-practice-root .em-pg-card-level {
  display: inline-block;
  margin-bottom: 18px;
  padding: 4px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent, #E879F9) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent, #E879F9) 40%, transparent);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  color: var(--accent, #E879F9);
}

.em-practice-root .em-pg-card-topic {
  margin: 0 0 6px;
  font-family: var(--em-decor);
  font-size: clamp(20px, 2.2vw, 26px);
  line-height: 1.1;
  color: var(--em-text);
  letter-spacing: -0.005em;
  /* Push down so stamp doesn't collide */
  padding-right: 80px;
}
.em-practice-root .em-pg-card-topic-pl {
  margin: 0 0 16px;
  font-style: italic;
  font-size: 13px;
  line-height: 1.4;
  color: var(--em-text-muted, #C4B8E0);
  opacity: 0.78;
}

.em-practice-root .em-pg-card-foot {
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(245, 239, 255, 0.08);
}
.em-practice-root .em-pg-card-stats {
  display: flex;
  gap: 18px;
}
.em-practice-root .em-pg-card-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.em-practice-root .em-pg-card-stat strong {
  font-family: var(--em-decor);
  font-size: 22px;
  line-height: 1;
  color: var(--accent, #E879F9);
}
.em-practice-root .em-pg-card-stat span {
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--em-text-muted);
  opacity: 0.7;
}
.em-practice-root .em-pg-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent, #E879F9) 16%, transparent);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent, #E879F9);
  transition: background 180ms var(--em-ease);
}
.em-practice-root .em-pg-card:hover .em-pg-card-cta {
  background: color-mix(in srgb, var(--accent, #E879F9) 28%, transparent);
}
.em-practice-root .em-pg-card-arrow {
  display: inline-block;
  transition: transform 200ms var(--em-ease);
}
.em-practice-root .em-pg-card:hover .em-pg-card-arrow {
  transform: translate(2px, -2px);
}

/* Loading + empty */
.em-practice-root .em-pg-loading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 32px;
  border-radius: 16px;
  border: 1px solid rgba(167, 139, 250, 0.18);
  background: rgba(167, 139, 250, 0.04);
  color: var(--em-text-muted);
  font-family: var(--em-mono);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.em-practice-root .em-pg-loading-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(232, 121, 249, 0.25);
  border-top-color: #E879F9;
  animation: em-spin 0.9s linear infinite;
}
`;

const PracticeGroupsStyles: React.FC = () => {
  // useMemo + a single mounted <style> tag — React de-dupes by element, so
  // even if the page is unmounted/remounted (e.g. category change → router
  // re-mount) we don't leak duplicate stylesheets.
  return <style>{PG_CSS}</style>;
};
