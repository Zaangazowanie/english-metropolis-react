// PitchCard — student-facing hero for /practice landing.
//
// Adapted from CoverBoard in PracticeCanvas.tsx (the design exhibit's
// "Cover · Okładka" artboard). The exhibit version was 1200×700 with 96px
// Caprasimo headline. This live version is full-width responsive, headline
// scales 48-80px depending on viewport, drops dev-only footer copy, and
// keeps the skyline silhouette + Bajla mascot + district-name pills.
//
// Renders ABOVE the title row in StudentPractice. Visible to everyone
// (logged-in and logged-out) — Bajla's first introduction.
//
// EM-035 (Builder 2 / 2026-04-30): the design-exhibit footer
// "EXPLORATION v1 · ARCHITECTURE: SHENZHEN × WARSAW × VIENNA × LONDON" is
// intentionally OMITTED here. It was a designer signature for the artboard,
// not user-facing copy — drop confirmed per audit recommendation. Do not
// reintroduce.

import React from 'react';
import { ArcadeCity } from './DistrictArtwork';
import type { ShellKey } from '../lib/shell-selector';
import { CoverageWidget } from './CoverageWidget';

interface PitchCardProps {
  /** Day / dusk / night theme — matches the rest of the practice canvas. */
  time?: 'day' | 'dusk' | 'night';
  /** Optional click handler — when provided, each district pill becomes a
   *  button that selects the corresponding shell. */
  onSelectShell?: (shell: ShellKey) => void;
  /** Optional handler for the "Browse by topic" pill (sprint-2 grouping nav). */
  onBrowseByTopic?: () => void;
  /** Logged-in student's slug. When present, the right rail mounts the
   *  CoverageWidget (Phase 1.6 of audit §4 #21 — keyword-bank coverage
   *  motivator). Omitted for anonymous viewers — widget no-ops. */
  studentSlug?: string;
}

export const PitchCard: React.FC<PitchCardProps> = ({ time = 'dusk', onSelectShell, onBrowseByTopic, studentSlug }) => {
  const grad =
    time === 'day'
      ? 'linear-gradient(160deg, #4C2F7E 0%, #C58BD9 100%)'
      : time === 'night'
        ? 'linear-gradient(160deg, #02010C 0%, #2A1450 70%, #4B1E78 100%)'
        : 'linear-gradient(160deg, #1F1240 0%, #6A2A8C 60%, #C5598E 100%)';

  return (
    <div data-time={time} className="em-pitch-card em-grain" style={{ background: grad }}>
      <ArcadeCity />

      {/* Decorative top-right Bajla removed 2026-05-04 per Mike — chat-widget
          Bajla is the canonical mascot presence on every page, so the standalone
          decorative one was just noise. */}

      {/* Right rail — desktop ≥1280px only. Kills the right-side rectangular
          void called out by CD's universal #8 rule. Surfaces the 3 hero
          districts (Multiple choice / Gap-fill / Open cloze) as a "Today's
          districts" preview the student will hit first when they land. */}
      <aside className="em-pitch-rail" aria-label="Today's districts preview">
        <div className="em-eyebrow em-pitch-rail-eyebrow">
          DZIŚ POLECANE · TODAY&apos;S 3 DISTRICTS
        </div>
        <ol className="em-pitch-rail-list">
          {[
            { num: '01', label: 'Multiple choice', pl: 'Wybór wielokrotny', shell: 'multiplechoice' as ShellKey, accent: '#FBBF24', tag: 'BULLETIN BOARD' },
            { num: '02', label: 'Gap-fill', pl: 'Uzupełnij luki', shell: 'gapfill' as ShellKey, accent: '#7DD3FC', tag: 'CONSTRUCTION QUARTER' },
            { num: '03', label: 'Open cloze', pl: 'Tekst z lukami', shell: 'opencloze' as ShellKey, accent: '#E879F9', tag: 'VELLUM ATELIER' },
          ].map((it) => {
            const inner = (
              <>
                <span className="em-pitch-rail-num" style={{ color: it.accent, borderColor: `${it.accent}55` }}>{it.num}</span>
                <span className="em-pitch-rail-body">
                  <span className="em-pitch-rail-label">{it.label}</span>
                  <span className="em-pitch-rail-pl">{it.pl}</span>
                  <span className="em-pitch-rail-tag" style={{ color: it.accent }}>{it.tag}</span>
                </span>
              </>
            );
            return onSelectShell ? (
              <li key={it.shell}>
                <button
                  type="button"
                  className="em-pitch-rail-item em-pitch-rail-item-button"
                  onClick={() => onSelectShell(it.shell)}
                  aria-label={`Open ${it.label} district`}
                >
                  {inner}
                </button>
              </li>
            ) : (
              <li key={it.shell} className="em-pitch-rail-item">{inner}</li>
            );
          })}
        </ol>
        {/* CoverageWidget full-panel removed 2026-05-04 per Mike —
            "extra panel on the practice tab". Compact chip below stays
            (it's a pill, not a panel). */}
        {/* Hyperlinked to the "Explore at your own pace" All-Districts
            section below — Mike 2026-05-04: the count should be a jump-link,
            not a static stat. Uses window.scrollTo with calculated offset
            instead of scrollIntoView({behavior:'smooth'}) — that variant
            stays in-flight on iOS Safari and intercepts the user's first
            scroll-up gesture, making it feel like the page is stuck. */}
        <a
          href="#em-all-districts"
          className="em-pitch-rail-foot em-pitch-rail-foot-link"
          onClick={(e) => {
            e.preventDefault();
            const target = document.getElementById('em-all-districts');
            if (!target) return;
            const offset = 80;
            const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top, behavior: 'smooth' });
          }}
          aria-label="Jump to all 38 districts — explore at your own pace"
        >
          <span className="em-pitch-rail-foot-num">38</span>
          <span className="em-pitch-rail-foot-sub">districts in the city · dystryktów w mieście</span>
          <span
            className="material-symbols-outlined em-pitch-rail-foot-arrow"
            aria-hidden
            style={{ fontSize: 16, marginLeft: 'auto', opacity: 0.6 }}
          >
            arrow_downward
          </span>
        </a>
      </aside>

      <div className="em-pitch-content">
        <div className="em-eyebrow em-pitch-eyebrow">
          THE METRO ARCADE · TWOJE MIASTO GIER
        </div>
        {/* Compact coverage chip — visible <1280px (rail hidden there) so
            mobile + tablet learners still see their bank-coverage signal.
            CSS class em-coverage-compact-inline hides this chip at desktop
            ≥1280px where the full widget in the rail takes over. */}
        {studentSlug && (
          <div className="em-coverage-compact-inline" style={{ marginTop: 8, marginBottom: 4 }}>
            <CoverageWidget studentSlug={studentSlug} variant="compact" />
          </div>
        )}
        <h1 className="em-pitch-title">
          Your city.<br /><span>Your next challenge.</span>
        </h1>
        <p className="em-pitch-subtitle">
          Step into a district. Take on a challenge. Build your English, one game at a time. Bajla will show you the way.
        </p>

        {onBrowseByTopic && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="em-pitch-pill em-pitch-pill-button"
              onClick={onBrowseByTopic}
              aria-label="Browse practice by topic · Przeglądaj ćwiczenia według tematu"
              style={{ background: 'rgba(232,121,249,0.18)', borderColor: 'rgba(232,121,249,0.55)' }}
            >
              Browse by topic · Przeglądaj wg tematu
            </button>
          </div>
        )}
        {/* 3-pill featured-shells row removed 2026-05-04 per Mike — the
            top-3 hero districts already appear in the right rail; the second
            redundant row down here was just noise. The full "All districts"
            section below is what students discover from. */}

        <div className="em-pitch-stats" aria-hidden>
          <div>
            <div className="em-pitch-stat-num" style={{ color: '#FBBF24' }}>
              38 DISTRICTS
            </div>
            <div className="em-pitch-stat-sub">trzydzieści osiem dystryktów</div>
          </div>
          <div>
            <div className="em-pitch-stat-num" style={{ color: '#E879F9' }}>
              POLISH-FIRST
            </div>
            <div className="em-pitch-stat-sub">interferencja językowa</div>
          </div>
          <div>
            <div className="em-pitch-stat-num" style={{ color: '#7DD3FC' }}>
              1 CITY
            </div>
            <div className="em-pitch-stat-sub">jedno miasto</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PitchCard;
