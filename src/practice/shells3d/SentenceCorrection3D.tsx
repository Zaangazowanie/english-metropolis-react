// SentenceCorrection3D — "The Editor's Office" (SentenceCorrection district).
//
// A three.js re-skin of the canonical 2D SentenceCorrection shell
// (src/practice/shells/SentenceCorrection.tsx). The MECHANIC is unchanged: a
// sentence with exactly one grammatical error appears (or occasionally no error);
// the player taps the wrong word, types the correction, and commits — or presses
// "No errors" for a clean sentence. Wrong pick or wrong correction reveals the
// right fix (no-fail; still advances). A hint narrows the search (3/session).
// Same puzzle in (ShellSentenceCorrectionPuzzle.items → {id, sentence_with_error,
// error_span:[start,end), correction, acceptedAnswers?, hint?, hint_pl});
// same SessionResult out. Built on the GameKit.
//
// Scene: a dusk newspaper editor's office. A dark oak desk, a stack of proof
// sheets, and a warm amber desk lamp — the 3D paper sheet on the desk reacts
// to state (neutral / correct-stamp / wrong-flash) while all readable English
// lives in the crisp DOM overlay, never baked into a texture (contract rule 9).
// Bajla the proof-reader owl perches on the desk edge.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay (sentence tokens as clickable buttons + text input);
// quality tiers + reducedMotion honoured; full keyboard (click word, type, Enter
// commit · N = no-errors · H hint · S skip) + touch (≥44px word tokens);
// procedural geometry + basic materials only (no GLB, no external URLs, no new
// deps); no per-frame allocations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import type { Mesh } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'

// ── Palette ──────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_SOFT = '#ffce86'
const GREEN = '#34D399'
const ROSE = '#FB7185'
const INK = '#1f0e3a'
const PAPER = '#efe3c6'     // proof sheet (neutral)
const PAPER_OK = '#34D39933' // correct
const PAPER_ERR = '#FB718533' // wrong flash

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
interface SCItem {
  id: string
  sentence_with_error: string
  error_span: [number, number]
  correction: string
  acceptedAnswers?: string[]
  hint?: string
  hint_pl?: string
}
interface SCPuzzle { items: SCItem[] }

// ── Built-in demo — original grammatical errors for anonymous play ─────────────
const DEMO: SCItem[] = [
  { id: 'sc-1', sentence_with_error: 'tower lights up at night.',
    error_span: [0, 5], correction: 'The tower',
    hint: 'A definite article is missing.', hint_pl: 'Brakuje rodzajnika "the".' },
  { id: 'sc-2', sentence_with_error: 'She walk to school every morning.',
    error_span: [4, 8], correction: 'walks',
    hint: 'Third-person singular needs -s.', hint_pl: 'Trzecia osoba l. poj. wymaga -s.' },
  { id: 'sc-3', sentence_with_error: 'I bought two book at the market.',
    error_span: [14, 18], correction: 'books',
    hint: 'Two of something — plural.', hint_pl: 'Dwa egzemplarze — liczba mnoga.' },
  { id: 'sc-4', sentence_with_error: 'He arrived on work at nine.',
    error_span: [11, 13], correction: 'at',
    hint: 'Wrong preposition with "work".', hint_pl: 'Zły przyimek — "at work".' },
  { id: 'sc-5', sentence_with_error: 'Yesterday I go to the cinema.',
    error_span: [12, 14], correction: 'went',
    hint: 'Past time → past tense.', hint_pl: 'Wczoraj — czas przeszły.' },
  { id: 'sc-6', sentence_with_error: 'She is a honest woman.',
    error_span: [7, 8], correction: 'an',
    hint: 'Article before a vowel SOUND.', hint_pl: 'Rodzajnik przed dźwiękiem samogłoski.' },
]

// ── Word tokenizer — split sentence into clickable token spans ────────────────
interface Token { text: string; start: number; end: number }
function tokenize(s: string): Token[] {
  const tokens: Token[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  return tokens
}
// The error token is the one whose span overlaps the error_span.
function isErrorToken(t: Token, span: [number, number]): boolean {
  return t.start < span[1] && t.end > span[0]
}
// Validate a correction: trim + case-insensitive match against correction / acceptedAnswers.
function isCorrection(typed: string, item: SCItem): boolean {
  const t = typed.trim().toLowerCase()
  if (t === item.correction.toLowerCase()) return true
  return item.acceptedAnswers?.some((a) => a.toLowerCase() === t) ?? false
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function usePrefersReducedMotion() {
  const [rm, setRm] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setRm(mq.matches)
    const h = () => setRm(mq.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])
  return rm
}

type SheetState = 'idle' | 'correct' | 'wrong'
const _col = new Color()

// ── 3D scene — the dusk editor's office ───────────────────────────────────────
function EditorScene({
  sheetState, warmth, reducedMotion, bajlaVariant,
}: {
  sheetState: SheetState
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 12, 28]} />}
      {/* Floor */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Editor's desk */}
      <mesh position={[0, 0.68, -0.1]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.12, 1.6]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      {/* Desk legs */}
      {([-1.55, 1.55] as const).map((x) => (
        <mesh key={x} position={[x, 0.34, 0.0]}>
          <boxGeometry args={[0.14, 0.72, 0.14]} />
          <meshToonMaterial color="#2A1C10" />
        </mesh>
      ))}
      {/* Stack of proof sheets on the desk */}
      <mesh position={[-0.7, 0.76, 0.2]} rotation={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.9, 0.03, 0.65]} />
        <meshToonMaterial color="#c9bfa5" />
      </mesh>
      {/* Active proof sheet (state-reactive) */}
      <Sheet state={sheetState} reducedMotion={reducedMotion} />
      {/* Desk lamp */}
      <group position={[1.1, 0.74, -0.3]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.04, 0.9, 6]} />
          <meshToonMaterial color={palette.brass} />
        </mesh>
        {/* shade */}
        <mesh position={[0, 0.96, 0]}>
          <coneGeometry args={[0.28, 0.22, 10, 1, true]} />
          <meshToonMaterial color={palette.brass} />
        </mesh>
        <mesh position={[0, 0.85, 0]}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshBasicMaterial color={palette.lanternCore} transparent opacity={0.6 + warmth * 0.38} />
        </mesh>
      </group>
      {/* Typewriter silhouette at the back */}
      <mesh position={[0.2, 0.82, -0.52]} castShadow>
        <boxGeometry args={[0.7, 0.28, 0.36]} />
        <meshToonMaterial color="#2A1C10" />
      </mesh>
      <mesh position={[0.2, 1.02, -0.52]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 6]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.38}
        position={[-1.55, 0.96, 0.28]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 2.4 + bob, 6.2)
    cam.lookAt(0, 1.0, 0)
  })
  return null
}

// The active proof sheet — colour lerps toward state colour.
function Sheet({ state, reducedMotion }: { state: SheetState; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  const target = state === 'correct' ? GREEN : state === 'wrong' ? ROSE : PAPER
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color; opacity: number }
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 5)
    mat.color.lerp(_col, k)
    const targetOp = state === 'idle' ? 1 : state === 'correct' ? 0.85 : 0.7
    mat.opacity += (targetOp - mat.opacity) * k
  })
  return (
    <mesh ref={ref} position={[0, 0.77, 0.12]} castShadow>
      <boxGeometry args={[0.86, 0.03, 0.62]} />
      <meshBasicMaterial color={PAPER} transparent opacity={1} />
    </mesh>
  )
}

// =========================================================================
// SentenceCorrection3D — default export
// =========================================================================
export default function SentenceCorrection3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle ──────────────────────────────────────────────────────────
  const items = useMemo<SCItem[]>(() => {
    const p = puzzle as SCPuzzle | undefined
    if (p && Array.isArray(p.items) && p.items.length > 0) return p.items
    return DEMO
  }, [puzzle])
  const total = items.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<Token | null>(null)
  const [typed, setTyped] = useState('')
  const [verdict, setVerdict] = useState<'correct' | 'wrong' | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [seen, setSeen] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintVisible, setHintVisible] = useState(false)
  const [live, setLive] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const wrongSet = useRef<Set<string>>(new Set())
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const cur = items[idx]
  const done = seen >= total
  const tokens = useMemo(() => (cur ? tokenize(cur.sentence_with_error) : []), [cur])

  // ── Session complete ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('Every sentence filed. The editor\'s desk is clear.')
    const result: SessionResult = {
      correctCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'sentencecorrection',
    }
    onSessionComplete?.(result)
  }, [done, correctCount, total, onSessionComplete])

  const commit = useCallback(() => {
    if (verdict !== null || done || !cur) return
    // "No errors" path
    if (!selected) {
      // If sentence has an error, this is wrong
      const hasError = cur.error_span[1] > cur.error_span[0]
      if (!hasError) {
        setVerdict('correct')
        setCorrectCount((c) => c + 1)
        setLive('Correct — no errors in this sentence.')
      } else {
        wrongSet.current.add(cur.id)
        setVerdict('wrong')
        setLive(`Not quite — the error is "${cur.sentence_with_error.slice(cur.error_span[0], cur.error_span[1])}", corrected to "${cur.correction}".`)
      }
      return
    }
    // Word-tap + correction path
    const wordIsRight = isErrorToken(selected, cur.error_span)
    const correctionIsRight = isCorrection(typed, cur)
    if (wordIsRight && correctionIsRight) {
      setVerdict('correct')
      setCorrectCount((c) => c + 1)
      setLive(`Correct — "${typed.trim()}" fixes it.`)
    } else {
      wrongSet.current.add(cur.id)
      setVerdict('wrong')
      const errWord = cur.sentence_with_error.slice(cur.error_span[0], cur.error_span[1])
      setLive(`Not quite — tap "${errWord}" and change it to "${cur.correction}".`)
    }
  }, [verdict, done, cur, selected, typed])

  const advance = useCallback(() => {
    setVerdict(null)
    setSelected(null)
    setTyped('')
    setHintVisible(false)
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  const skip = useCallback(() => {
    if (done) return
    if (verdict !== null) { advance(); return }
    wrongSet.current.add(cur?.id ?? '')
    setVerdict('wrong')
    const errWord = cur ? cur.sentence_with_error.slice(cur.error_span[0], cur.error_span[1]) : ''
    setLive(`Skipped — the error was "${errWord}", corrected to "${cur?.correction}".`)
    // Auto-advance after short delay so the feedback is readable
    setTimeout(() => { advance() }, 1800)
  }, [done, verdict, cur, advance])

  const selectToken = useCallback((t: Token) => {
    if (verdict !== null || done) return
    setSelected(t)
    setTyped(t.text)
    setHintVisible(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [verdict, done])

  const useHint = useCallback(() => {
    if (verdict !== null || done || hintsUsed >= 3 || !cur) return
    setHintsUsed((h) => h + 1)
    setHintVisible(true)
    setLive(cur.hint ?? 'Look closely at the grammar.')
  }, [verdict, done, hintsUsed, cur])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key.toLowerCase()
      // Don't intercept when typing in the input
      if (e.target === inputRef.current) {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        return
      }
      if (verdict !== null && (k === 'enter' || k === ' ')) { e.preventDefault(); advance(); return }
      if (k === 'n') { e.preventDefault(); commit(); return }   // "no errors"
      if (k === 'h') { e.preventDefault(); useHint(); return }
      if (k === 's') { e.preventDefault(); skip(); return }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, verdict, commit, advance, useHint, skip])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    wrongSet.current = new Set()
    setIdx(0); setSelected(null); setTyped(''); setVerdict(null); setCorrectCount(0)
    setSeen(0); setHintsUsed(0); setHintVisible(false); setLive('')
  }, [])

  const warmth = total > 0 ? correctCount / total : 0
  const sheetState: SheetState = verdict === 'correct' ? 'correct' : verdict === 'wrong' ? 'wrong' : 'idle'
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : verdict === 'correct' ? 'celebrate' : 'idle'

  const errWord = cur ? cur.sentence_with_error.slice(cur.error_span[0], cur.error_span[1]) : ''

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Editor's Office</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Find and fix the error</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{correctCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} filed</span>
        </div>
      </div>

      {cur && !done && (
        <div style={{ position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', width: 'min(620px, 94vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Hint chip */}
          {hintVisible && cur.hint && (
            <div style={{ fontSize: 11, color: AMBER_SOFT, marginBottom: 10, fontStyle: 'italic', opacity: 0.9 }}>
              📝 {cur.hint}{cur.hint_pl ? ` · ${cur.hint_pl}` : ''}
            </div>
          )}

          {/* Sentence card — each word is a clickable token */}
          <div style={{
            background: 'rgba(14,10,26,0.84)', borderRadius: 12, border: `1px solid ${AMBER_SOFT}44`,
            padding: '18px 20px', marginBottom: 14,
          }}>
            <div role="group" aria-label="Sentence — tap the wrong word"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', lineHeight: 1 }}>
              {tokens.map((tok) => {
                const isSelected = selected?.start === tok.start
                const isError = verdict !== null && isErrorToken(tok, cur.error_span)
                const isWrongTap = verdict === 'wrong' && selected?.start === tok.start && !isErrorToken(tok, cur.error_span)
                const bg = isSelected
                  ? (verdict === null ? AMBER_SOFT : verdict === 'correct' ? GREEN : ROSE)
                  : isError && verdict !== null ? `${GREEN}33` : 'transparent'
                const col = isSelected ? INK : isError && verdict !== null ? GREEN : CREAM
                return (
                  <button key={tok.start} onClick={() => selectToken(tok)}
                    disabled={verdict !== null}
                    aria-pressed={isSelected}
                    aria-label={`${tok.text}${isSelected ? ', selected' : ''}${isWrongTap ? ', wrong pick' : ''}`}
                    style={{
                      padding: '7px 10px', borderRadius: 6, cursor: verdict !== null ? 'default' : 'pointer',
                      background: bg, color: col, fontFamily: 'Georgia, serif', fontSize: 17,
                      border: isSelected ? `2px solid ${verdict === null ? INK : verdict === 'correct' ? GREEN : ROSE}` : '2px solid transparent',
                      fontWeight: isSelected ? 700 : 400, touchAction: 'manipulation', minHeight: 44,
                    }}>{tok.text}</button>
                )
              })}
            </div>

            {/* Correction input (shown when a word is selected and no verdict yet) */}
            {selected && verdict === null && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                <label style={{ fontSize: 10, opacity: 0.7, letterSpacing: '0.12em' }}>CORRECTION →</label>
                <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
                  aria-label="Type the correction"
                  style={{
                    background: 'rgba(14,10,26,0.7)', border: `2px solid ${AMBER_SOFT}`, borderRadius: 8,
                    color: CREAM, fontFamily: 'Georgia, serif', fontSize: 16, padding: '6px 12px',
                    outline: 'none', minWidth: 120, maxWidth: 260,
                  }} />
                <button onClick={commit} style={commitBtn}>✓</button>
              </div>
            )}

            {/* Verdict reveal */}
            {verdict === 'correct' && (
              <div style={{ marginTop: 10, fontSize: 13, color: GREEN, fontWeight: 700 }}>✓ Correct — filed!</div>
            )}
            {verdict === 'wrong' && (
              <div style={{ marginTop: 10, fontSize: 13, color: ROSE }}>
                Error: <span style={{ fontFamily: 'Georgia, serif' }}>
                  "<span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{errWord}</span>" → "{cur.correction}"
                </span>
              </div>
            )}
          </div>

          {/* Action bar */}
          {verdict === null && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {selected && (
                <button onClick={commit} style={actionBtn(GREEN)}>Submit correction →</button>
              )}
              <button onClick={commit} style={actionBtn(`${AMBER_SOFT}99`)}>No errors · Bez błędów (N)</button>
            </div>
          )}
          {verdict !== null && (
            <button onClick={advance} style={nextBtn}>
              {idx + 1 >= total ? 'Close the desk →' : 'Next sheet →'}
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={skip} style={skipBtn}>SKIP →</button>
            <button onClick={useHint} disabled={verdict !== null || hintsUsed >= 3}
              style={hintBtn(verdict !== null || hintsUsed >= 3)}>HINT · {3 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>tap word → type → Enter · N no-errors · H hint · S skip</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Editor's desk cleared" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The desk is clear.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every sentence proofread.<br />
            <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} filed correctly.
          </div>
          <button onClick={reset} style={nextBtn}>Proof again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Sentence correction — find and fix the grammatical error in each sentence"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.4, 6.2]} cameraFov={46} overlay={overlay}>
        <EditorScene
          sheetState={sheetState}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const commitBtn: React.CSSProperties = {
  minHeight: 36, padding: '6px 14px', borderRadius: 8, background: AMBER_SOFT,
  color: INK, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
}
function actionBtn(col: string): React.CSSProperties {
  return {
    minHeight: 44, padding: '10px 16px', borderRadius: 9, background: `${col}1a`,
    border: `2px solid ${col}`, color: CREAM, fontWeight: 600, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
  }
}
const nextBtn: React.CSSProperties = {
  minHeight: 44, padding: '10px 22px', borderRadius: 9, background: AMBER_SOFT,
  color: INK, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
}
const skipBtn: React.CSSProperties = {
  minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
  border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em',
  cursor: 'pointer', touchAction: 'manipulation',
}
function hintBtn(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
    border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, touchAction: 'manipulation',
  }
}
