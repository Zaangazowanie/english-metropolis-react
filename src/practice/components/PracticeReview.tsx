// PracticeReview — end-of-shell review screen.
//
// Replaces the old InterferenceTip end-of-shell modal (CD's D1, 2026-05-02).
// The student sees ALL wrongs in one scrollable list with rule explanations
// inline, instead of a single modal popup. Match's test-english.com's review
// pattern, adapted for our district metaphor + bilingual layout.
//
// Renders OVER the shell area (covers the existing "you completed" overlay).
// localStorage-persisted by sessionId so a refresh during review still shows
// the data. Cleared when the student taps Try another / Next district.

import React, { useEffect, useState } from 'react';
import { Bajla, HintCard } from './primitives';
import type { WrongAttempt } from '../lib/useEndOfShellTip';

export interface PracticeReviewQuestion {
  id: string;
  prompt: string;
  prompt_pl?: string;
  hint?: string;
  hint_pl?: string;
  /** Per-shell free-form payload — passed back to renderItem so each shell
   *  can draw its options (poster cards, gap chips, cloze inputs) the same
   *  way it draws them in live play. */
  shellPayload: unknown;
  /** Convex exercises.questions[i].explanationPL — the full rule. */
  explanationPL?: string;
  /** Multi-answer support for cloze. Single canonical answer for everything else. */
  acceptedAnswers?: string[];
}

export interface PracticeReviewItemState {
  /** What the user did on this question. */
  status: 'correct' | 'wrong' | 'skipped' | 'unanswered';
  /** Their actual answer string (or null when skipped/unanswered). */
  studentAnswer?: string;
  /** The canonical correct answer for display. */
  correctAnswer: string;
}

export interface PracticeReviewProps {
  /** Stable identifier for the shell — used in localStorage key. */
  districtId: string;
  /** Per-session id so re-runs don't collide in localStorage. */
  sessionId: string;
  /** District-themed emoji on the summary card. 📌 / 🔨 / 📜 etc. */
  summaryEmoji: string;
  /** District accent color for the summary headline + button. */
  accent: string;
  totalQuestions: number;
  correctCount: number;
  wrongAttempts: WrongAttempt[];
  /** All questions in the session, in display order. */
  questions: PracticeReviewQuestion[];
  /**
   * Per-shell render function. Returns the locked option-grid for a question.
   * Called once per question with the question's shellPayload + the state
   * (correct/wrong/skipped) so the renderer knows which visual variant to use.
   */
  renderItem: (
    q: PracticeReviewQuestion,
    state: PracticeReviewItemState,
  ) => React.ReactNode;
  onTryAnother: () => void;
  onNextDistrict: () => void;
}

interface PersistedReview {
  districtId: string;
  sessionId: string;
  totalQuestions: number;
  correctCount: number;
  wrongAttempts: WrongAttempt[];
  questionIds: string[];
}

function lsKey(districtId: string, sessionId: string): string {
  return `em:practice:review:${districtId}:${sessionId}`;
}

export const PracticeReview: React.FC<PracticeReviewProps> = ({
  districtId,
  sessionId,
  summaryEmoji,
  accent,
  totalQuestions,
  correctCount,
  wrongAttempts,
  questions,
  renderItem,
  onTryAnother,
  onNextDistrict,
}) => {
  // Persist on mount so a tab refresh during review still surfaces the data.
  // Cleared when the student taps a CTA.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: PersistedReview = {
      districtId,
      sessionId,
      totalQuestions,
      correctCount,
      wrongAttempts,
      questionIds: questions.map((q) => q.id),
    };
    try {
      window.localStorage.setItem(lsKey(districtId, sessionId), JSON.stringify(payload));
    } catch { /* quota-exceeded — silently drop, review still works in-memory */ }
  }, [districtId, sessionId, totalQuestions, correctCount, wrongAttempts, questions]);

  // 2026-05-02 (Mike's "three scrollbars" report): when the review is open,
  // the only scroll context that should remain is em-pr-root's own. The
  // ancestor `.em-dash` + body scroll create up-to-three stacked scrollbars
  // on the right edge. Lock them while review is mounted; restore on
  // unmount so the rest of the app behaves normally afterwards.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const dash = document.querySelector<HTMLElement>('.em-dash');
    const prevDash = dash?.style.overflow ?? null;
    const prevBody = document.body.style.overflow;
    if (dash) dash.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      if (dash) dash.style.overflow = prevDash ?? '';
      document.body.style.overflow = prevBody;
    };
  }, []);

  const clearAndCall = (cb: () => void) => () => {
    try { window.localStorage.removeItem(lsKey(districtId, sessionId)); } catch { /* ignore */ }
    cb();
  };

  const percent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Build a question→state lookup so per-item rendering is O(1).
  const wrongById = new Map<string, WrongAttempt>();
  for (const w of wrongAttempts) wrongById.set(w.questionId, w);

  const stateFor = (q: PracticeReviewQuestion): PracticeReviewItemState => {
    const w = wrongById.get(q.id);
    if (w) {
      return { status: 'wrong', studentAnswer: w.studentAnswer, correctAnswer: w.correctAnswer };
    }
    // No wrong record — student got it right OR skipped. We can't distinguish
    // without a richer record from the shell; for now treat as 'correct' since
    // the prevailing flow (advance() vs skip()) doesn't differentiate at the
    // hook layer. A future enhancement could plumb a separate skipped[] array.
    return { status: 'correct', correctAnswer: q.shellPayload && typeof q.shellPayload === 'object' && 'correctAnswer' in (q.shellPayload as object)
      ? String((q.shellPayload as { correctAnswer?: unknown }).correctAnswer ?? '')
      : '' };
  };

  // Pick the explanation to show under each wrong item. The shell pushes
  // explanationPL into the WrongAttempt at recordWrong time (typically from
  // the question's hint_pl or a richer convex.exercises explanationPL). The
  // PracticeReviewQuestion mirror may also carry one. Prefer wrongAttempt's
  // since that's the canonical source from the shell at the moment of judgment.
  const explanationFor = (q: PracticeReviewQuestion): string | undefined => {
    const w = wrongById.get(q.id);
    return w?.explanationPL ?? q.explanationPL;
  };

  return (
    <div className="em-pr-root" role="region" aria-label="Session review">
      {/* Summary card — centered, matches test-english pattern with our metaphor */}
      <div className="em-pr-summary" role="status" aria-live="polite">
        <div className="em-pr-summary-emoji" aria-hidden>{summaryEmoji}</div>
        <h2 className="em-pr-summary-title" style={{ color: accent }}>
          Board reviewed · Tablica sprawdzona
        </h2>
        <p className="em-pr-summary-line">
          Correct answers: <strong>{correctCount}/{totalQuestions}</strong>.
          <br />
          <span className="em-text-dim">Twój wynik: {correctCount}/{totalQuestions}.</span>
        </p>
        <p className="em-pr-summary-line em-pr-summary-score">
          Your score is <strong style={{ color: accent }}>{percent}%</strong>.
        </p>
        <p className="em-pr-summary-cta">
          Check your answers below.
          <br />
          <span className="em-text-dim">Sprawdź swoje odpowiedzi poniżej.</span>
        </p>
      </div>

      {/* Per-question cards */}
      <ol className="em-pr-list" aria-label="All questions reviewed">
        {questions.map((q, i) => {
          const st = stateFor(q);
          return (
            <li key={q.id} className="em-pr-item" data-state={st.status}>
              <div className="em-pr-item-num" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="em-pr-item-body">
                {/* Prompt */}
                <div className="em-pr-item-prompt">{q.prompt}</div>
                {q.prompt_pl ? (
                  <div className="em-pr-item-prompt-pl">{q.prompt_pl}</div>
                ) : null}

                {/* Per-shell locked option render */}
                <div className="em-pr-item-options">
                  {renderItem(q, st)}
                </div>

                {/* Multi-answer chip strip for cloze (collapses to single chip
                    when only canonical answer is available). */}
                {st.status === 'wrong' && q.acceptedAnswers && q.acceptedAnswers.length > 0 ? (
                  <div className="em-pr-item-accepted">
                    <span className="em-pr-item-accepted-label">✓ ACCEPTED · DOPUSZCZALNE:</span>
                    <span className="em-pr-item-accepted-list">
                      {q.acceptedAnswers.join(', ')}
                    </span>
                  </div>
                ) : null}

                {/* Rule callout — Bajla bilingual explanation. Mirrors the
                    InterferenceTip dialog body, rendered inline. The explanation
                    is sourced from the WrongAttempt at the moment of judgment
                    (typically the question's hint_pl, or convex.exercises
                    explanationPL when the puzzle came from convex). */}
                {(() => {
                  const exp = explanationFor(q);
                  if (st.status !== 'wrong' || !exp) return null;
                  return (
                    <div className="em-pr-item-rule">
                      <span className="em-pr-item-rule-glyph" aria-hidden>‣&nbsp;&nbsp;</span>
                      <span
                        className="em-pr-item-rule-text"
                        // explanationPL may contain <strong> markup per CD's tone spec.
                        // Trusted Convex source — no user input.
                        dangerouslySetInnerHTML={{ __html: exp }}
                      />
                    </div>
                  );
                })()}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Bottom CTAs — same buttons as the dead-end "completed" dialog had */}
      <div className="em-pr-actions">
        <button
          type="button"
          className="em-btn em-btn-ghost"
          onClick={clearAndCall(onTryAnother)}
        >
          Try another · Spróbuj ponownie
        </button>
        <button
          type="button"
          className="em-btn em-btn-primary"
          onClick={clearAndCall(onNextDistrict)}
          style={{ background: `linear-gradient(120deg, ${accent}, ${accent}cc)` }}
        >
          Next district · Następna dzielnica →
        </button>
      </div>

      {/* Friendly mascot in the corner so the review feels like part of the city */}
      <div className="em-pr-bajla" aria-hidden>
        <Bajla size={56} mood="cheer" decorative />
      </div>

      <style>{`
        .em-pr-root {
          position: absolute;
          inset: 0;
          z-index: 5;
          padding: 28px 22px 36px;
          background: linear-gradient(180deg, var(--em-card, #1A1438) 0%, var(--em-card-2, #14102A) 100%);
          color: var(--em-text, #EDE6FF);
          overflow-y: auto;
          animation: em-pr-fade 320ms var(--em-ease, cubic-bezier(0.4, 0, 0.2, 1)) both;
        }
        @keyframes em-pr-fade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .em-pr-summary {
          max-width: 500px;
          margin: 0 auto 28px;
          background: var(--em-card-bg, rgba(255,255,255,0.04));
          border: 1px solid var(--em-line, rgba(245,239,255,0.12));
          border-radius: 16px;
          padding: 30px;
          text-align: center;
          box-shadow: 0 12px 32px -16px rgba(0, 0, 0, 0.6);
        }
        .em-pr-summary-emoji {
          font-size: 36px;
          line-height: 1;
          margin-bottom: 10px;
        }
        .em-pr-summary-title {
          font-family: 'Caprasimo', 'Fraunces', Georgia, serif;
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 14px;
          letter-spacing: -0.005em;
        }
        .em-pr-summary-line {
          font-family: var(--em-body, 'Source Serif 4', Georgia, serif);
          font-weight: 300;
          font-size: 15px;
          line-height: 1.5;
          margin: 6px 0;
        }
        .em-pr-summary-line strong { font-weight: 600; }
        .em-pr-summary-score { margin-top: 4px; }
        .em-pr-summary-cta { margin-top: 14px; font-style: italic; }
        .em-text-dim { color: var(--em-text-dim, rgba(245,239,255,0.55)); }

        .em-pr-list {
          max-width: 720px;
          margin: 0 auto;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .em-pr-item {
          display: grid;
          grid-template-columns: 32px 1fr;
          gap: 14px;
          padding: 16px 18px 18px;
          background: var(--em-card-2, rgba(20, 16, 42, 0.6));
          border: 1px solid var(--em-line, rgba(245,239,255,0.1));
          border-radius: 14px;
        }
        .em-pr-item[data-state="wrong"] {
          border-color: color-mix(in srgb, var(--em-wrong, #FB7185) 35%, transparent);
        }
        .em-pr-item[data-state="correct"] {
          border-color: color-mix(in srgb, var(--em-correct, #34D399) 18%, transparent);
        }
        .em-pr-item-num {
          font-family: var(--em-mono, 'IBM Plex Mono', monospace);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: var(--em-text-muted, rgba(245,239,255,0.4));
          padding-top: 4px;
        }
        .em-pr-item-prompt {
          font-family: var(--em-body, 'Source Serif 4', Georgia, serif);
          font-size: 16px;
          line-height: 1.45;
          margin-bottom: 4px;
        }
        .em-pr-item-prompt-pl {
          font-size: 13px;
          color: var(--em-text-dim, rgba(245,239,255,0.55));
          font-style: italic;
          margin-bottom: 12px;
        }
        .em-pr-item-options {
          margin: 8px 0 0;
        }
        .em-pr-item-accepted {
          margin: 12px 0 0;
          padding: 8px 12px;
          background: color-mix(in srgb, var(--em-correct, #34D399) 12%, transparent);
          border-left: 2px solid var(--em-correct, #34D399);
          border-radius: 4px;
          font-size: 13px;
        }
        .em-pr-item-accepted-label {
          font-family: var(--em-mono, monospace);
          font-size: 13px;
          letter-spacing: 0.12em;
          color: var(--em-correct, #34D399);
          margin-right: 8px;
        }
        .em-pr-item-accepted-list { color: var(--em-text, #EDE6FF); }

        .em-pr-item-rule {
          margin: 14px 0 0;
          padding: 14px;
          background: var(--em-card-2, rgba(20, 16, 42, 0.4));
          border-left: 2px solid var(--em-line-strong, rgba(245,239,255,0.28));
          border-radius: 4px;
          font-size: 15px;
          line-height: 1.5;
          color: var(--em-text, #EDE6FF);
          display: flex;
          align-items: flex-start;
        }
        .em-pr-item-rule-glyph {
          color: var(--em-line-strong, rgba(245,239,255,0.45));
          flex: 0 0 auto;
        }
        .em-pr-item-rule-text strong {
          font-weight: 700;
          color: var(--em-amber, #FBBF24);
        }

        .em-pr-actions {
          max-width: 720px;
          margin: 28px auto 12px;
          display: flex;
          justify-content: center;
          gap: 12px;
        }
        .em-pr-bajla {
          position: fixed;
          right: 22px;
          bottom: 22px;
          opacity: 0.85;
          pointer-events: none;
          animation: em-pr-fade 540ms 320ms var(--em-ease) both;
        }

        @media (max-width: 720px) {
          .em-pr-root { padding: 22px 14px 28px; }
          .em-pr-summary { padding: 22px 18px; }
          .em-pr-summary-title { font-size: 20px; }
          .em-pr-item { grid-template-columns: 24px 1fr; gap: 10px; padding: 14px; }
          .em-pr-item-prompt { font-size: 15px; }
          .em-pr-actions { flex-direction: column; }
          .em-pr-bajla { display: none; }
        }
      `}</style>
    </div>
  );
};

export default PracticeReview;
