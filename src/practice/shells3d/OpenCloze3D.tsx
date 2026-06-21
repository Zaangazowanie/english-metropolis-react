// OpenCloze3D — "The Vellum Atelier" (OpenCloze district).
//
// A three.js re-skin of the canonical 2D OpenCloze shell
// (src/practice/shells/OpenCloze.tsx). The MECHANIC is unchanged: a passage of
// text has several [BLANK_n] gaps; the player types the missing word into each
// inkwell (free typing — no options). A right word "dries" into the parchment
// (locks green); a wrong word washes out and the correct word is revealed
// (no-fail; the gap still resolves). A hint reveals a gap's clue (3/session);
// skip reveals the current gap. Same puzzle in (ShellOpenClozePuzzle {passage
// with [BLANK_n], passage_pl?, gaps:[{id, answer, acceptedAnswers?, hint,
// hint_pl}]}); same SessionResult out. Built on the GameKit.
//
// Scene: a dusk scribe's desk. A sheet of parchment under candlelight warms to
// gold as more gaps dry in; an inkpot and quill rest on the desk — but the
// readable English (the passage + the typed inputs) lives in the crisp DOM
// overlay, never baked into a texture (contract rule 9). Bajla the scribe's
// owl watches from the desk.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (type each gap, Enter to ink it · H hint · S skip the gap) + touch
// (≥44px controls; native keyboard for inputs); procedural geometry + basic
// materials only (no GLB, no external URLs, no new deps); no per-frame allocs.

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
const PARCHMENT = '#e8dcbf'
const PARCHMENT_WARM = '#f2d79a'
const DESK = '#3A2A1E'

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
interface OCGap { id: number; answer: string; acceptedAnswers?: string[]; hint?: string; hint_pl?: string }
interface OCPuzzle { passage: string; passage_pl?: string; gaps: OCGap[] }

// ── Built-in demo — original dusk-metro cloze for anonymous play ──────────────
const DEMO: OCPuzzle = {
  passage:
    'The old metro station opened [BLANK_1] 1903. It is one [BLANK_2] the oldest in the city. ' +
    'Travellers pass through it [BLANK_3] day, and they rarely notice the small inscription [BLANK_4] ' +
    'the marble pillar. It reads: "[BLANK_5] who waits, arrives."',
  gaps: [
    { id: 1, answer: 'in', hint: 'Preposition for years.', hint_pl: 'Przyimek dla lat — w (roku).' },
    { id: 2, answer: 'of', hint: 'Preposition of belonging.', hint_pl: 'Przyimek przynależności — z.' },
    { id: 3, answer: 'every', hint: 'How often? Każdego…', hint_pl: 'Jak często? Każdego dnia.' },
    { id: 4, answer: 'on', hint: 'Preposition of contact.', hint_pl: 'Przyimek kontaktu — na (filarze).' },
    { id: 5, answer: 'He', hint: 'Subject pronoun, third person.', hint_pl: 'Zaimek osobowy — on.' },
  ],
}

function isAnswer(typed: string, gap: OCGap): boolean {
  const t = typed.trim().toLowerCase()
  if (t === gap.answer.toLowerCase()) return true
  return gap.acceptedAnswers?.some((a) => a.toLowerCase() === t) ?? false
}

// ── Passage parser → ordered text/gap parts ───────────────────────────────────
type Part = { type: 'text'; text: string } | { type: 'gap'; id: number }
function parsePassage(passage: string): Part[] {
  const out: Part[] = []
  const re = /\[BLANK_(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(passage)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: passage.slice(last, m.index) })
    out.push({ type: 'gap', id: parseInt(m[1], 10) })
    last = m.index + m[0].length
  }
  if (last < passage.length) out.push({ type: 'text', text: passage.slice(last) })
  return out
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

const _col = new Color()

// ── 3D scene — the dusk scribe's atelier ──────────────────────────────────────
function AtelierScene({ warmth, reducedMotion, bajlaVariant }: {
  warmth: number; reducedMotion: boolean; bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 11, 26]} />}
      {/* Floor */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Scribe's desk (slightly tilted top toward the camera) */}
      <mesh position={[0, 0.66, -0.1]} rotation={[-0.12, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.0, 0.12, 1.7]} />
        <meshToonMaterial color={DESK} />
      </mesh>
      {([-1.3, 1.3] as const).map((x) => (
        <mesh key={x} position={[x, 0.32, 0.15]}><boxGeometry args={[0.14, 0.66, 0.14]} /><meshToonMaterial color="#2A1C10" /></mesh>
      ))}
      {/* Parchment on the desk (warms to gold with progress) */}
      <Parchment warmth={warmth} reducedMotion={reducedMotion} />
      {/* Inkpot + quill */}
      <mesh position={[1.05, 0.78, 0.35]} castShadow><cylinderGeometry args={[0.1, 0.12, 0.18, 10]} /><meshToonMaterial color={INK} /></mesh>
      <mesh position={[1.16, 0.95, 0.35]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <cylinderGeometry args={[0.012, 0.03, 0.5, 5]} /><meshToonMaterial color="#d8cba8" />
      </mesh>
      {/* Candle with warm glow */}
      <group position={[-1.05, 0.78, 0.3]}>
        <mesh position={[0, 0.12, 0]} castShadow><cylinderGeometry args={[0.05, 0.06, 0.26, 8]} /><meshToonMaterial color="#e9e2cf" /></mesh>
        <mesh position={[0, 0.3, 0]}><sphereGeometry args={[0.05, 8, 6]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.7 + warmth * 0.3} /></mesh>
      </group>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.36} position={[-1.5, 0.95, 0.45]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 2.3 + bob, 5.8)
    cam.lookAt(0, 0.95, 0)
  })
  return null
}

// The parchment sheet — colour lerps from cream toward warm gold with progress.
function Parchment({ warmth, reducedMotion }: { warmth: number; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color }
    _col.set(PARCHMENT).lerp(new Color(PARCHMENT_WARM), warmth)
    const k = reducedMotion ? 1 : Math.min(1, dt * 4)
    mat.color.lerp(_col, k)
  })
  return (
    <mesh ref={ref} position={[0, 0.74, 0.08]} rotation={[-Math.PI / 2 + 0.12, 0, 0]} castShadow>
      <planeGeometry args={[1.7, 1.2]} />
      <meshBasicMaterial color={PARCHMENT} />
    </mesh>
  )
}

// =========================================================================
// OpenCloze3D — default export
// =========================================================================
export default function OpenCloze3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const pz = useMemo<OCPuzzle>(() => {
    const p = puzzle as OCPuzzle | undefined
    if (p && typeof p.passage === 'string' && Array.isArray(p.gaps) && p.gaps.length > 0) return p
    return DEMO
  }, [puzzle])
  const parts = useMemo(() => parsePassage(pz.passage), [pz])
  const gapById = useMemo(() => {
    const m: Record<number, OCGap> = {}
    pz.gaps.forEach((g) => { m[g.id] = g })
    return m
  }, [pz])
  const total = pz.gaps.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [result, setResult] = useState<Record<number, 'correct' | 'wrong'>>({})
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintText, setHintText] = useState('')
  const [live, setLive] = useState('')
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const resolvedCount = Object.keys(result).length
  const correctCount = useMemo(() => Object.values(result).filter((r) => r === 'correct').length, [result])
  const done = resolvedCount >= total

  const firstOpenGap = useCallback((): number | null => {
    for (const g of pz.gaps) if (!(g.id in result)) return g.id
    return null
  }, [pz.gaps, result])

  // ── Session complete ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('The page is inked. The atelier is warm and gold.')
    const r: SessionResult = {
      correctCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'opencloze',
    }
    onSessionComplete?.(r)
  }, [done, correctCount, total, onSessionComplete])

  const commitGap = useCallback((id: number, opts?: { revealIfEmpty?: boolean }) => {
    if (id in result) return
    const g = gapById[id]
    if (!g) return
    const typed = inputs[id] ?? ''
    if (typed.trim() === '' && !opts?.revealIfEmpty) return  // Enter on empty = no-op
    const ok = typed.trim() !== '' && isAnswer(typed, g)
    setResult((r) => ({ ...r, [id]: ok ? 'correct' : 'wrong' }))
    if (!ok) {
      setInputs((s) => ({ ...s, [id]: g.answer }))   // reveal the right word ("dries in")
      setLive(`The word was "${g.answer}".`)
    } else {
      setLive(`Inked — "${g.answer}".`)
    }
    setHintText('')
    // Focus the next still-open gap (skip the one just committed).
    setTimeout(() => {
      for (const gg of pz.gaps) {
        if (gg.id !== id && !(gg.id in result)) { inputRefs.current[gg.id]?.focus(); break }
      }
    }, 0)
  }, [result, gapById, inputs, pz.gaps])

  const skipGap = useCallback(() => {
    const id = firstOpenGap()
    if (id == null) return
    commitGap(id, { revealIfEmpty: true })
    setLive(`Skipped — the word was "${gapById[id]?.answer}".`)
  }, [firstOpenGap, commitGap, gapById])

  const sealPage = useCallback(() => {
    // Resolve every still-open gap (filled → check; empty → reveal as wrong).
    pz.gaps.forEach((g) => { if (!(g.id in result)) commitGap(g.id, { revealIfEmpty: true }) })
  }, [pz.gaps, result, commitGap])

  const useHint = useCallback(() => {
    if (done || hintsUsed >= 3) return
    const id = firstOpenGap()
    if (id == null) return
    const g = gapById[id]
    setHintsUsed((h) => h + 1)
    setHintText(`Gap ${id}: ${g.hint ?? 'Think about the grammar.'}${g.hint_pl ? ` · ${g.hint_pl}` : ''}`)
    setLive(`Hint for gap ${id}.`)
    inputRefs.current[id]?.focus()
  }, [done, hintsUsed, firstOpenGap, gapById])

  // ── Keyboard (global; inputs handle their own Enter) ────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      // Let inputs manage typing/Enter themselves.
      if (e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      if (k === 'h') { e.preventDefault(); useHint() }
      else if (k === 's') { e.preventDefault(); skipGap() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, useHint, skipGap])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setInputs({}); setResult({}); setHintsUsed(0); setHintText(''); setLive('')
  }, [])

  const warmth = total > 0 ? resolvedCount / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Vellum Atelier</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Ink the missing words</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{correctCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} inked</span>
        </div>
      </div>

      {!done && (
        <div style={{ position: 'absolute', top: '13%', left: '50%', transform: 'translateX(-50%)', width: 'min(600px, 94vw)', pointerEvents: 'auto' }}>
          {/* Parchment card — passage with inline inputs */}
          <div style={{
            background: 'rgba(232,220,191,0.95)', borderRadius: 10, border: `1px solid ${AMBER_SOFT}66`,
            padding: '20px 22px', marginBottom: 14, color: '#3A2A1E',
            fontFamily: 'Georgia, serif', fontSize: 17, lineHeight: 2.0, textAlign: 'left',
            boxShadow: 'inset 0 0 24px rgba(160,130,80,0.2)',
          }}>
            {parts.map((part, i) => {
              if (part.type === 'text') return <span key={i}>{part.text}</span>
              const id = part.id
              const res = result[id]
              const val = inputs[id] ?? ''
              if (res) {
                const isCorrect = res === 'correct'
                return (
                  <span key={i} style={{
                    display: 'inline-block', margin: '0 3px', padding: '1px 8px', borderRadius: 5, fontWeight: 700,
                    color: isCorrect ? '#15663f' : '#9B1C2E',
                    background: isCorrect ? `${GREEN}33` : `${ROSE}28`,
                    border: `1px solid ${isCorrect ? GREEN : ROSE}`,
                  }}>{gapById[id]?.answer}</span>
                )
              }
              const w = Math.max(4, val.length + 1)
              return (
                <input key={i} ref={(el) => { inputRefs.current[id] = el }}
                  value={val}
                  onChange={(e) => setInputs((s) => ({ ...s, [id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitGap(id) } }}
                  aria-label={`Blank ${id} of ${total}`}
                  style={{
                    width: `${w}ch`, margin: '0 3px', padding: '1px 6px', borderRadius: 5,
                    background: 'rgba(255,255,255,0.6)', border: `2px solid ${AMBER_SOFT}`,
                    color: INK, fontFamily: 'Georgia, serif', fontSize: 16, outline: 'none', textAlign: 'center',
                  }} />
              )
            })}
          </div>

          {/* Hint chip */}
          {hintText && (
            <div style={{ fontSize: 12, color: AMBER_SOFT, marginBottom: 12, fontStyle: 'italic', opacity: 0.92 }}>🪶 {hintText}</div>
          )}

          {/* Seal */}
          <div style={{ textAlign: 'center' }}>
            <button onClick={sealPage} style={nextBtn}>Seal the page →</button>
          </div>
        </div>
      )}

      {/* Footer controls */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={skipGap} style={skipBtn}>SKIP GAP →</button>
            <button onClick={useHint} disabled={hintsUsed >= 3} style={hintBtn(hintsUsed >= 3)}>HINT · {3 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>type each gap · Enter inks it · H hint · S skip gap</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Atelier page complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The page is inked.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every gap filled in quill-ink.<br />
            <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} inked right.
          </div>
          <button onClick={reset} style={nextBtn}>A fresh page →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Open cloze — type the missing word into each gap in the passage"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.3, 5.8]} cameraFov={48} overlay={overlay}>
        <AtelierScene warmth={warmth} reducedMotion={reduce} bajlaVariant={bajlaVariant} />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
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
