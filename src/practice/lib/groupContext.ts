// groupContext.ts — current-group React context for practice shells.
// ─────────────────────────────────────────────────────────────────────────────
// When a student launches a shell session FROM a topic-grouping (e.g. "Modal
// verbs of speculation" → tap "Practice in The Bulletin Board"), we need
// every interior surface to know about that group:
//
//   • The shell's <GroupingPill> shows "📌 from Modal Verbs of Speculation"
//   • The shell's "Switch view" dropdown lists OTHER compatible districts
//     for the SAME group (so the student can keep drilling the topic in
//     a different game)
//   • The shell's completion overlay can offer a "Try a related grouping →"
//     CTA
//
// Plumbing this through every shell's prop list would be invasive (28 shells
// to edit). Instead we drop a React context above StudentPractice's shell
// host and any shell that wants to participate calls useGroupContext().
//
// Sprint-2 / Agent B (2026-05-02). Zero shell modifications required —
// shells that don't read the context still work exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from 'react';
import type { ShellKey } from './shell-selector';

/** Public shape consumed by GroupingPill + (optionally) future shells. */
export interface GroupContextValue {
  /** The exerciseGroup._id from Convex. */
  groupId: string;
  /** English topic name, e.g. "Modal verbs of speculation". */
  topicEn: string;
  /** Polish topic name, e.g. "Czasowniki modalne wyrażające przypuszczenie". */
  topicPl: string;
  /** Optional bilingual one-sentence description of the topic. */
  descriptionEn?: string;
  descriptionPl?: string;
  /** CEFR band the grouping is calibrated for ("A2", "B1", "B2", "C1", …). */
  cefrLevel?: string;
  /** Top-level category — drives the accent color in the pill. */
  category?: GroupCategory;
  /**
   * Compatible shells for THIS group, in stable order. Used by the in-shell
   * "Switch view" dropdown so students can drill the same topic in a
   * different district without bouncing back to /practice/groups.
   */
  compatibleShells: ShellKey[];
  /**
   * Navigation callbacks. Kept as props (not router refs) so this code is
   * decoupled from react-router and easier to mock in design canvases.
   */
  onBackToGroup: () => void;
  onSwitchShell?: (next: ShellKey) => void;
}

/** Top-level grouping categories — mirrors what Agent A's schema exposes. */
export type GroupCategory =
  | 'grammar'
  | 'vocabulary'
  | 'use-of-english'
  | 'reading'
  | 'listening'
  | 'writing'
  | 'speaking';

// The actual context. Default null — consumers must check for absence so the
// pill renders nothing when a shell is launched ad-hoc (not from a group).
const GroupContext = createContext<GroupContextValue | null>(null);

/** Provider — wrap the active <Shell /> tree to enable in-shell group UI. */
export const GroupContextProvider = GroupContext.Provider;

/**
 * useGroupContext — read the current group, or null if the shell was
 * launched ad-hoc.
 *
 * Returns null instead of throwing so shells that opt-in to topic display
 * can do so with a single render-time check:
 *
 *   const group = useGroupContext();
 *   if (!group) return null;  // ad-hoc launch
 *   return <GroupingPill {...group} />;
 */
export function useGroupContext(): GroupContextValue | null {
  return useContext(GroupContext);
}

/** Brand-palette accent for each category. Mirrors DESIGN.md §6. */
export const CATEGORY_ACCENT: Record<GroupCategory, { accent: string; glow: string; gradient: string }> = {
  grammar: {
    accent: '#FB7185',
    glow: 'rgba(251, 113, 133, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #6E325E 55%, #B85A88 100%)',
  },
  vocabulary: {
    accent: '#34D399',
    glow: 'rgba(52, 211, 153, 0.50)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #1A2C24 55%, #2A4A38 100%)',
  },
  'use-of-english': {
    accent: '#7DD3FC',
    glow: 'rgba(125, 211, 252, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #2D2050 55%, #4A357A 100%)',
  },
  reading: {
    accent: '#FBBF24',
    glow: 'rgba(251, 191, 36, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #2A1838 55%, #4C2A50 100%)',
  },
  listening: {
    accent: '#A78BFA',
    glow: 'rgba(167, 139, 250, 0.55)',
    gradient: 'linear-gradient(135deg, #14102A 0%, #251847 55%, #3A2466 100%)',
  },
  writing: {
    accent: '#E879F9',
    glow: 'rgba(232, 121, 249, 0.55)',
    gradient: 'linear-gradient(135deg, #1F1240 0%, #4A2270 55%, #6A2A8C 100%)',
  },
  speaking: {
    accent: '#BEF264',
    glow: 'rgba(190, 242, 100, 0.50)',
    gradient: 'linear-gradient(135deg, #110A22 0%, #1E1238 55%, #2C1850 100%)',
  },
};

/** Bilingual labels for category chips. */
export const CATEGORY_LABEL: Record<GroupCategory, { en: string; pl: string; emoji: string }> = {
  grammar:           { en: 'Grammar',           pl: 'Gramatyka',          emoji: '📐' },
  vocabulary:        { en: 'Vocabulary',        pl: 'Słownictwo',         emoji: '📖' },
  'use-of-english':  { en: 'Use of English',    pl: 'Użycie angielskiego', emoji: '⚙️' },
  reading:           { en: 'Reading',           pl: 'Czytanie',           emoji: '📰' },
  listening:         { en: 'Listening',         pl: 'Słuchanie',          emoji: '🎧' },
  writing:           { en: 'Writing',           pl: 'Pisanie',            emoji: '✍️' },
  speaking:          { en: 'Speaking',          pl: 'Mówienie',           emoji: '🗣️' },
};
