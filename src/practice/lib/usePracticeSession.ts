// usePracticeSession.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-shot hook that wires the per-student practice page:
//   1. Reads the student session from localStorage (StudentAuthContext shape).
//   2. Fetches the KB JSON from /knowledge-base/<slug>.json (prod-stable URL).
//   3. Normalises it via readKB() (handles all 5 KB shapes).
//   4. Runs pickShellsForStudent() locally to recommend the top 3 shells.
//   5. Returns { studentSlug, studentLevel, kb, picks, status, error }.
//
// We do client-side selection (rather than calling the cached Convex query) so
// students get a fresh recommendation every page load — the Convex
// `getRecommendedShells` query exists for analytics + audit only. If/when KBs
// move into Convex tables this hook flips one line.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { readKB, type NormalisedKB } from './kb-reader';
import { pickShellsForStudent, type PickedShell } from './shell-selector';
import { fetchJSONCached } from './practice-cache';

export interface PracticeSession {
  studentSlug?: string;
  studentLevel: string;
  kb: NormalisedKB | null;
  picks: PickedShell[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

interface SessionData {
  slug?: string;
  level?: string;
  name?: string;
}

const STUDENT_SESSION_KEY = 'em-student-session';
const LEGACY_SLUG_KEY = 'studentSlug';
const KB_BASE_URL = ''; // same-origin: /knowledge-base/<slug>.json

function readStudentSession(): SessionData {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STUDENT_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SessionData;
      if (parsed?.slug) return parsed;
    }
  } catch {
    // swallow & try legacy
  }
  try {
    const legacy = window.localStorage.getItem(LEGACY_SLUG_KEY);
    if (legacy) return { slug: legacy };
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * usePracticeSession — fetch + normalise the student's KB, run the selector,
 * and return the top 3 picks. Re-runs whenever the student slug changes.
 */
export function usePracticeSession(slugOverride?: string): PracticeSession {
  const [session, setSession] = useState<PracticeSession>(() => ({
    studentLevel: 'B1',
    kb: null,
    picks: [],
    status: 'idle',
  }));

  useEffect(() => {
    let cancelled = false;
    const ctx = readStudentSession();
    const slug = slugOverride ?? ctx.slug;
    if (!slug) {
      setSession({
        studentLevel: ctx.level || 'B1',
        kb: null,
        picks: [],
        status: 'ready',
        error: 'no-session',
      });
      return;
    }
    setSession((prev) => ({ ...prev, status: 'loading', studentSlug: slug }));

    (async () => {
      try {
        const url = `${KB_BASE_URL}/knowledge-base/${slug}.json`;
        // 30s timeout + 5-min in-memory cache (shared with kb-reader.fetchKB)
        // so the same KB JSON isn't re-downloaded on every render or nav.
        const json = await fetchJSONCached<unknown>(url, { cacheKey: `kb::${url}` });
        if (cancelled) return;
        const kb = readKB(json);
        const level = kb.student?.currentLevel || ctx.level || 'B1';
        const picks = pickShellsForStudent(kb, level, 3);
        setSession({
          studentSlug: slug,
          studentLevel: level,
          kb,
          picks,
          status: 'ready',
        });
      } catch (err) {
        if (cancelled) return;
        // The KB is an optional personalisation layer, not a prerequisite for
        // entering Practice. Production deliberately falls back to the SPA for
        // unknown static paths, so a missing /knowledge-base/<slug>.json can
        // arrive as HTML with a 200 response. Keep the generic districts and
        // assigned lesson-practice activities available instead of replacing
        // the whole screen with a JSON parse error.
        setSession({
          studentSlug: slug,
          studentLevel: ctx.level || 'B1',
          kb: null,
          picks: [],
          status: 'ready',
          error: 'kb-unavailable',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slugOverride]);

  return session;
}
