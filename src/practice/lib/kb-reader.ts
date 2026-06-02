// kb-reader.ts
// ─────────────────────────────────────────────────────────────────────────────
// Normalises the five Knowledge-Base JSON shapes seen on prod (englishmetro.com
// /knowledge-base/<slug>.json) into a single canonical `NormalisedKB` shape
// that the practice selector + drill generators consume.
//
// Shapes seen on prod:
//   1. Bare array of error objects (aleksandra-gorska, natalia-pvt, szymon)
//        [ { id, title, category, examplesFromLessons:[], summary, ... } ]
//   2. { student, errors:[ { id, pattern, examples:[], category } ], summary }
//        — ilona-karpinska
//   3. { student, errorPatterns:[...] } — mikolaj-karpinski
//   4. { errors:[ {...} ] }            (defensive — older partial shape)
//   5. { errorPatterns:[ {...} ] }     (defensive)
//
// Per-error fields differ too: some use `examplesFromLessons` (objects with
// `said`/`corrected`), others `examples` (objects with `incorrect`/`correct`),
// the legacy ones have `pattern` instead of `title`. The reader maps everything
// to a single shape so the rest of the system never has to branch.
// ─────────────────────────────────────────────────────────────────────────────

export interface KBExample {
  said: string;
  corrected: string;
  context?: string;
  lessonDate?: string;
}

export interface KBError {
  id: string;
  title: string;             // Human-readable description
  category: string;          // e.g. "grammar-tense", "grammar-aspect"
  cefrLevel?: string;        // "A2" | "B1" | ...
  fossilized: boolean;
  frequency: number;         // 1..N
  summary?: string;
  examples: KBExample[];
  fixStrategies: string[];
  drillType?: string;        // "fill-blank" | "minimal-pair" | ...
}

export interface NormalisedKB {
  student?: {
    name?: string;
    currentLevel?: string;
    targetLevel?: string;
  };
  errors: KBError[];
}

// ───────────────────────────────────────────────────────────────
// Best-effort field accessors with multiple shape fallbacks.
// ───────────────────────────────────────────────────────────────
function pickFirst<T>(...candidates: Array<T | undefined | null>): T | undefined {
  for (const c of candidates) {
    if (c !== undefined && c !== null) return c;
  }
  return undefined;
}

function normaliseExample(raw: unknown): KBExample | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const said = pickFirst<string>(
    o.said as string | undefined,
    o.incorrect as string | undefined,
    o.error as string | undefined,
    o.utterance as string | undefined,
  );
  const corrected = pickFirst<string>(
    o.corrected as string | undefined,
    o.correct as string | undefined,
    o.fix as string | undefined,
    o.target as string | undefined,
  );
  if (!said || !corrected) return null;
  return {
    said,
    corrected,
    context: typeof o.context === 'string' ? o.context : undefined,
    lessonDate: typeof o.lessonDate === 'string' ? o.lessonDate : undefined,
  };
}

function normaliseError(raw: unknown): KBError | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = (o.id as string) ?? (o.errorId as string) ?? `err-${Math.random().toString(36).slice(2, 8)}`;
  const title = pickFirst<string>(
    o.title as string | undefined,
    o.pattern as string | undefined,
    o.name as string | undefined,
    o.summary as string | undefined,
  );
  if (!title) return null;
  const category = (o.category as string) ?? (o.errorCategory as string) ?? 'unknown';
  const cefrLevel = (o.cefrLevel as string) ?? (o.level as string) ?? undefined;

  // Examples can be examplesFromLessons | examples | examplesList
  const rawExamples = pickFirst<unknown[]>(
    o.examplesFromLessons as unknown[] | undefined,
    o.examples as unknown[] | undefined,
    o.examplesList as unknown[] | undefined,
  ) ?? [];
  const examples = rawExamples
    .map((r) => normaliseExample(r))
    .filter((x): x is KBExample => x !== null);

  // remediation/recommendations may be a single string OR an array — coerce to array first.
  const fixCandidates: unknown[] = [];
  for (const f of [o.fixStrategies, o.remediation, o.recommendations]) {
    if (Array.isArray(f)) fixCandidates.push(...f);
    else if (typeof f === 'string') fixCandidates.push(f);
  }
  const fixStrategies = fixCandidates.filter((x): x is string => typeof x === 'string');

  // Frequency may be a number, a string ("4"), or a sentence ("flagged once...")
  let frequency = 1;
  if (typeof o.frequency === 'number') frequency = o.frequency;
  else if (typeof o.frequency === 'string') {
    const n = parseInt(o.frequency, 10);
    if (!Number.isNaN(n) && n > 0) frequency = n;
  }

  return {
    id,
    title,
    category,
    cefrLevel,
    fossilized: o.fossilized === true || o.priority === 'high',
    frequency,
    summary: typeof o.summary === 'string' ? o.summary : undefined,
    examples,
    fixStrategies,
    drillType: typeof o.drillType === 'string' ? o.drillType : undefined,
  };
}

// ───────────────────────────────────────────────────────────────
// Top-level reader: takes parsed JSON of any of the 5 shapes,
// returns NormalisedKB.
// ───────────────────────────────────────────────────────────────
export function readKB(json: unknown): NormalisedKB {
  if (Array.isArray(json)) {
    // Shape 1: bare array
    return {
      errors: json.map((r) => normaliseError(r)).filter((x): x is KBError => x !== null),
    };
  }

  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const studentField = (o.student && typeof o.student === 'object')
      ? o.student as Record<string, unknown>
      : undefined;
    const student = studentField
      ? {
          name: typeof studentField.name === 'string' ? studentField.name : undefined,
          currentLevel: typeof studentField.currentLevel === 'string' ? studentField.currentLevel : undefined,
          targetLevel: typeof studentField.targetLevel === 'string' ? studentField.targetLevel : undefined,
        }
      : undefined;

    const list = pickFirst<unknown[]>(
      o.errors as unknown[] | undefined,
      o.errorPatterns as unknown[] | undefined,
      o.patterns as unknown[] | undefined,
    ) ?? [];

    return {
      student,
      errors: list.map((r) => normaliseError(r)).filter((x): x is KBError => x !== null),
    };
  }

  return { errors: [] };
}

// Convenience: fetch + parse + normalise.
// Uses fetchJSONCached for both the 30s AbortController-backed timeout AND a
// 5-min in-memory cache so repeat KB reads (usePracticeSession,
// useStudentExercises, KnowledgeBase view, etc.) all share one round-trip.
import { fetchJSONCached } from './practice-cache';
export async function fetchKB(slug: string, baseUrl: string = ''): Promise<NormalisedKB> {
  const url = `${baseUrl}/knowledge-base/${slug}.json`;
  const json = await fetchJSONCached<unknown>(url, { cacheKey: `kb::${url}` });
  return readKB(json);
}
