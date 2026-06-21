// TrueFalse3D — "The Crossroads" (Tannoy Cross district).
//
// A three.js re-skin of the canonical 2D TrueFalse shell
// (src/practice/shells/TrueFalse.tsx). The MECHANIC is unchanged: a bilingual
// statement appears; the player commits TRUE or FALSE; the verdict is revealed
// with a small fact (no-fail — a wrong verdict still teaches, never blocks).
// Same puzzle in (ShellTrueFalsePuzzle.questions → {q, q_pl, ans, fact}); same
// session result out (SessionResult). Built on the Fluent City GameKit.
//
// Scene: a dusk crossroads. A blank signpost stands under the lamps (the
// readable statement lives in the crisp DOM overlay, never a 3D texture —
// contract rule 9); two glowing orbs flank it — a green TRUE orb and a rose
// FALSE orb. Commit a verdict and the correct orb blooms; Bajla nods.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (T/←=TRUE, F/→=FALSE, Enter=next, S=skip) + touch (≥44px); procedural
// geometry + basic materials only (no GLB, no external URLs, no new deps); no
// per-frame allocations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'

// ── Palette ──────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_SOFT = '#ffce86'
const GREEN = '#34D399'  // TRUE
const ROSE = '#FB7185'   // FALSE
const INK = '#1f0e3a'

// ── Puzzle shape (mirrors the 2D shell's TFQuestion) ─────────────────────────
interface TFQ { q: string; q_pl: string; ans: boolean; fact?: string }
interface TFPuzzle { questions: TFQ[] }

// ── Built-in demo — original dusk/grammar statements for anonymous play ───────
const DEMO: TFQ[] = [
  { q: "We say 'I am twenty years old', not 'I have twenty years'.", q_pl: "Mówimy 'I am ... years old'.", ans: true, fact: "Use 'be' for age in English, not 'have'." },
  { q: "The plural of 'child' is 'childs'.", q_pl: "Liczba mnoga 'child' to 'childs'.", ans: false, fact: "It's 'children' — an irregular plural." },
  { q: "'An' goes before a vowel sound, as in 'an hour'.", q_pl: "'An' przed dźwiękiem samogłoski.", ans: true, fact: "'Hour' starts with a vowel sound, so 'an'." },
  { q: "The past tense of 'go' is 'goed'.", q_pl: "Czas przeszły 'go' to 'goed'.", ans: false, fact: "It's 'went' — an irregular verb." },
  { q: "We 'cross the bridge', we do not 'go over the bridge'.", q_pl: "Mówimy 'cross the bridge'.", ans: true, fact: "'Cross the bridge' is the natural phrase." },
  { q: "'Their', 'there' and 'they're' all mean the same.", q_pl: "Mają to samo znaczenie.", ans: false, fact: "Possession · place · 'they are' — three different words." },
]

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

// ── 3D scene — the dusk crossroads ────────────────────────────────────────────
function CrossroadsScene({
  reveal, correctIsTrue, warmth, reducedMotion, bajlaVariant,
}: {
  reveal: boolean
  correctIsTrue: boolean
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 10, 26]} />}
      {/* Ground */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Signpost (blank — the statement is the DOM sign) */}
      <mesh position={[0, 1.1, -0.6]} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 2.2, 8]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      <mesh position={[0, 2.05, -0.55]} castShadow>
        <boxGeometry args={[1.7, 0.9, 0.08]} />
        <meshToonMaterial color="#4A3826" />
      </mesh>
      {/* Verdict orbs */}
      <Orb x={-1.7} color={GREEN} bright={reveal && correctIsTrue} dim={reveal && !correctIsTrue} reducedMotion={reducedMotion} />
      <Orb x={1.7} color={ROSE} bright={reveal && !correctIsTrue} dim={reveal && correctIsTrue} reducedMotion={reducedMotion} />
      {/* A couple of warm dusk lamps that brighten with progress */}
      <Lamp x={-3.2} warmth={warmth} />
      <Lamp x={3.2} warmth={warmth} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.4} position={[2.7, 1.05, 0.4]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.04
    cam.position.set(0, 2.7 + bob, 6.6)
    cam.lookAt(0, 1.5, 0)
  })
  return null
}

// A glowing verdict orb on a short post. Brightens (with a gentle pulse) when it
// is the revealed-correct answer; dims when it is the revealed-wrong side.
function Orb({ x, color, bright, dim, reducedMotion }: {
  x: number; color: string; bright: boolean; dim: boolean; reducedMotion: boolean
}) {
  const ref = useRef<Mesh>(null!)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!ref.current) return
    const m = ref.current.material as { opacity: number }
    const target = bright ? 0.95 : dim ? 0.18 : 0.6
    if (reducedMotion) {
      m.opacity = target
      ref.current.scale.setScalar(bright ? 1.18 : 1)
      return
    }
    t.current += dt
    const pulse = bright ? (Math.sin(t.current * 4) * 0.5 + 0.5) * 0.12 : 0
    m.opacity += (target + pulse - m.opacity) * Math.min(1, dt * 4)
    const s = bright ? 1.16 + pulse : 1
    ref.current.scale.setScalar(ref.current.scale.x + (s - ref.current.scale.x) * Math.min(1, dt * 4))
  })
  return (
    <group position={[x, 1.35, 0.5]}>
      {/* post */}
      <mesh position={[0, -0.78, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 1.5, 6]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      {/* orb */}
      <mesh ref={ref}>
        <sphereGeometry args={[0.34, 16, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

function Lamp({ x, warmth }: { x: number; warmth: number }) {
  return (
    <group position={[x, 0, -1.4]}>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 2.8, 6]} />
        <meshToonMaterial color={palette.brass} />
      </mesh>
      <mesh position={[0, 2.85, 0]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshBasicMaterial color={palette.lanternCore} transparent opacity={0.55 + warmth * 0.4} />
      </mesh>
    </group>
  )
}

// =========================================================================
// TrueFalse3D — default export
// =========================================================================
export default function TrueFalse3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle (same object the 2D shell receives) ──────────────────────
  const questions = useMemo<TFQ[]>(() => {
    const p = puzzle as TFPuzzle | undefined
    if (p && Array.isArray(p.questions) && p.questions.length > 0) return p.questions
    return DEMO
  }, [puzzle])
  const total = questions.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [picked, setPicked] = useState<boolean | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [seen, setSeen] = useState(0)        // answered + skipped → completion driver
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const cur = questions[idx]
  const done = seen >= total
  const verdictRight = answered && picked === cur?.ans

  // ── Session complete (single fire) ──────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('All signs read. The crossroads is bright again.')
    const result: SessionResult = {
      correctCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'truefalse',
    }
    onSessionComplete?.(result)
  }, [done, correctCount, total, onSessionComplete])

  const commit = useCallback((val: boolean) => {
    if (answered || done || !cur) return
    setPicked(val)
    setAnswered(true)
    const right = val === cur.ans
    if (right) {
      setCorrectCount((c) => c + 1)
      setLive(`Correct — ${cur.ans ? 'TRUE' : 'FALSE'}. ${cur.fact ?? ''}`)
    } else {
      // No-fail: reveal the correct verdict + fact, gently. Still advances.
      setLive(`Not quite — it's ${cur.ans ? 'TRUE' : 'FALSE'}. ${cur.fact ?? ''}`)
    }
  }, [answered, done, cur])

  const advance = useCallback(() => {
    setAnswered(false)
    setPicked(null)
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  const skip = useCallback(() => {
    if (done) return
    if (answered) { advance(); return }
    setLive('Skipped — the sign waits for another time.')
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [answered, done, advance])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key
      if (!answered && (k === 't' || k === 'T' || k === 'ArrowLeft')) { e.preventDefault(); commit(true) }
      else if (!answered && (k === 'f' || k === 'F' || k === 'ArrowRight')) { e.preventDefault(); commit(false) }
      else if (answered && (k === 'Enter' || k === ' ')) { e.preventDefault(); advance() }
      else if (k === 's' || k === 'S') { e.preventDefault(); skip() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [answered, done, commit, advance, skip])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setIdx(0); setAnswered(false); setPicked(null); setCorrectCount(0); setSeen(0); setLive('')
  }, [])

  const warmth = total > 0 ? correctCount / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>Tannoy Cross</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>True or False?</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{correctCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} signs read</span>
        </div>
      </div>

      {/* Statement sign + verdict controls */}
      {cur && !done && (
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 'min(540px, 90vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Sign card (the readable statement) */}
          <div style={{
            background: 'rgba(14,10,26,0.86)', borderRadius: 12, border: `1px solid ${AMBER_SOFT}44`,
            padding: '18px 22px', marginBottom: 16,
          }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, lineHeight: 1.5, color: CREAM }}>{cur.q}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 8, color: AMBER_SOFT }}>{cur.q_pl}</div>
          </div>

          {/* TRUE / FALSE buttons (before answering) */}
          {!answered && (
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
              <button onClick={() => commit(true)} aria-label="True (T or left arrow)"
                style={verdictBtn(GREEN)}>✓ TRUE · PRAWDA</button>
              <button onClick={() => commit(false)} aria-label="False (F or right arrow)"
                style={verdictBtn(ROSE)}>✗ FALSE · FAŁSZ</button>
            </div>
          )}

          {/* Verdict + fact (after answering) */}
          {answered && (
            <div>
              <div style={{
                display: 'inline-block', padding: '8px 16px', borderRadius: 999, marginBottom: 12,
                fontWeight: 700, letterSpacing: '0.08em', fontSize: 13,
                background: verdictRight ? `${GREEN}22` : `${ROSE}18`,
                border: `1px solid ${verdictRight ? GREEN : ROSE}`,
                color: verdictRight ? GREEN : ROSE,
              }}>
                {verdictRight ? 'Correct!' : `It's ${cur.ans ? 'TRUE · PRAWDA' : 'FALSE · FAŁSZ'}`}
              </div>
              {cur.fact && (
                <div style={{ fontSize: 13, fontStyle: 'italic', opacity: 0.85, maxWidth: 420, margin: '0 auto 14px', lineHeight: 1.5 }}>
                  “{cur.fact}”
                </div>
              )}
              <button onClick={advance} style={nextBtn}>Next sign →</button>
            </div>
          )}
        </div>
      )}

      {/* Controls hint */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <button onClick={skip} style={skipBtn}>SKIP →</button>
          <div style={{ fontSize: 10, opacity: 0.5 }}>T / ← True · F / → False · Enter next · S skip</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Crossroads complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The crossroads is bright.</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            You read every sign.<br />
            <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} verdicts correct.
          </div>
          <button onClick={reset} style={nextBtn}>Read again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="True or False — read each street sign and decide if it is true or false"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.7, 6.6]} cameraFov={46} overlay={overlay}>
        <CrossroadsScene
          reveal={answered}
          correctIsTrue={!!cur?.ans}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}

// ── Button styles ─────────────────────────────────────────────────────────────
function verdictBtn(color: string): React.CSSProperties {
  return {
    minHeight: 48, padding: '12px 22px', borderRadius: 10,
    background: `${color}1A`, border: `2px solid ${color}`, color,
    fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', cursor: 'pointer',
    touchAction: 'manipulation',
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
