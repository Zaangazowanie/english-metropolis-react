// MultipleChoice3D — "The Notice Board" (The Bulletin Board district).
//
// A three.js re-skin of the canonical 2D MultipleChoice shell
// (src/practice/shells/MultipleChoice.tsx). The MECHANIC is unchanged: a
// bilingual question appears; four answer posters hang on the board; the player
// commits ONE (single shot per question); a right pick lights the poster green,
// a wrong pick reveals the correct one (no-fail — still teaches, still advances).
// A textual hint clue is available (3 per session). Skip advances. Same puzzle
// in (ShellMultipleChoicePuzzle.questions → {prompt, prompt_pl?, options,
// answerIndex, hint, hint_pl}); same SessionResult out. Built on the GameKit.
//
// Scene: a dusk community notice-board under warm lamps. Four blank poster cards
// hang on push-pins in a 2×2 grid — the readable English lives in the crisp DOM
// overlay, never a 3D texture (contract rule 9). Commit a verdict and the chosen
// poster lights; the correct one always blooms green. Bajla perches alongside.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (1–4 / A–D pick, Enter next, H hint, S skip) + touch (≥44px);
// procedural geometry + basic materials only (no GLB, no external URLs, no new
// deps); no per-frame allocations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh, Mesh } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'

// ── Palette ──────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_SOFT = '#ffce86'
const GREEN = '#34D399'   // correct
const ROSE = '#FB7185'    // wrong
const INK = '#1f0e3a'
const PAPER = '#efe3c6'   // blank poster paper
const PIN = '#E8920A'     // amber push-pin

// ── Puzzle shape (mirrors the 2D shell's MCQuestion) ─────────────────────────
interface MCQ {
  id?: string
  prompt: string
  prompt_pl?: string
  options: string[]
  answerIndex: number
  hint?: string
  hint_pl?: string
}
interface MCPuzzle { questions: MCQ[] }

// ── Built-in demo — original dusk/city statements for anonymous play ──────────
const DEMO: MCQ[] = [
  { id: 'd1', prompt: 'We crossed the ___ over the river at dusk.', prompt_pl: 'Przeszliśmy przez ___ nad rzeką o zmierzchu.',
    options: ['avenue', 'bridge', 'platform', 'square'], answerIndex: 1,
    hint: 'It carries you over water.', hint_pl: 'Most — przechodzi nad wodą.' },
  { id: 'd2', prompt: 'Please ___ the next train to the centre.', prompt_pl: 'Proszę ___ następny pociąg do centrum.',
    options: ['take', 'make', 'do', 'have'], answerIndex: 0,
    hint: "We 'take' a train, bus or taxi.", hint_pl: "Po angielsku 'take' a train." },
  { id: 'd3', prompt: 'The clock ___ chimed at midnight.', prompt_pl: 'Zegar na ___ wybił północ.',
    options: ['shed', 'post', 'tower', 'gate'], answerIndex: 2,
    hint: 'A tall, narrow building.', hint_pl: 'Wieża — wysoka, wąska budowla.' },
  { id: 'd4', prompt: 'She posted the letter at the ___.', prompt_pl: 'Wysłała list na ___.',
    options: ['bakery', 'post office', 'pier', 'park'], answerIndex: 1,
    hint: 'Where parcels and letters are sent.', hint_pl: 'Poczta — gdzie wysyła się listy.' },
  { id: 'd5', prompt: 'The past tense of "go" is ___.', prompt_pl: 'Czas przeszły "go" to ___.',
    options: ['goed', 'gone', 'went', 'going'], answerIndex: 2,
    hint: "It's an irregular verb.", hint_pl: 'Czasownik nieregularny — "went".' },
  { id: 'd6', prompt: 'A wide, tree-lined ___ ran through the district.', prompt_pl: 'Szeroka ___ z drzewami biegła przez dzielnicę.',
    options: ['alley', 'avenue', 'tunnel', 'lobby'], answerIndex: 1,
    hint: 'A grand road, often tree-lined.', hint_pl: 'Aleja — szeroka droga z drzewami.' },
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

const LETTERS = ['A', 'B', 'C', 'D']
// 2×2 grid offsets on the board face (x, y).
const SLOTS: Array<[number, number]> = [
  [-0.66, 0.44], [0.66, 0.44], [-0.66, -0.42], [0.66, -0.42],
]

// ── 3D scene — the dusk notice-board ──────────────────────────────────────────
type PosterState = 'idle' | 'correct' | 'wrong' | 'dim'

const _col = new Color()
const _o = new Object3D()

function BulletinScene({
  states, warmth, reducedMotion, bajlaVariant,
}: {
  states: PosterState[]
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 11, 28]} />}
      {/* Ground */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Notice board */}
      <group position={[0, 1.7, -0.5]}>
        {/* support posts */}
        <mesh position={[-1.45, -0.95, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 3.0, 8]} />
          <meshToonMaterial color="#3A2A1E" />
        </mesh>
        <mesh position={[1.45, -0.95, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 3.0, 8]} />
          <meshToonMaterial color="#3A2A1E" />
        </mesh>
        {/* cork backing panel */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[3.0, 1.9, 0.1]} />
          <meshToonMaterial color="#6E5236" />
        </mesh>
        {/* little pitched roof */}
        <mesh position={[0, 1.08, 0]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[3.3, 0.12, 0.5]} />
          <meshToonMaterial color="#b5572e" />
        </mesh>
        {/* poster cards (2×2) */}
        {SLOTS.map((s, i) => (
          <Poster key={i} x={s[0]} y={s[1]} state={states[i] ?? 'idle'} reducedMotion={reducedMotion} />
        ))}
        {/* amber push-pins (instanced) */}
        <Pins />
      </group>
      {/* Warm dusk lamps that brighten with progress */}
      <Lamp x={-3.1} warmth={warmth} />
      <Lamp x={3.1} warmth={warmth} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.4} position={[2.6, 1.05, 0.6]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.04
    cam.position.set(0, 2.4 + bob, 6.4)
    cam.lookAt(0, 1.7, 0)
  })
  return null
}

// A poster card on the board. Lerps toward its state colour + a small pop when
// it becomes the correct answer. No per-frame allocations (module-scope _col).
function Poster({ x, y, state, reducedMotion }: {
  x: number; y: number; state: PosterState; reducedMotion: boolean
}) {
  const ref = useRef<Mesh>(null!)
  const target = state === 'correct' ? GREEN : state === 'wrong' ? ROSE : state === 'dim' ? '#5a5446' : PAPER
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color; opacity: number }
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 6)
    mat.color.lerp(_col, k)
    mat.opacity += ((state === 'dim' ? 0.4 : 1) - mat.opacity) * k
    const want = state === 'correct' ? 1.08 : 1
    ref.current.scale.x += (want - ref.current.scale.x) * k
    ref.current.scale.y += (want - ref.current.scale.y) * k
  })
  return (
    <mesh ref={ref} position={[x, y, 0.09]}>
      <boxGeometry args={[1.18, 0.74, 0.04]} />
      <meshBasicMaterial color={PAPER} transparent opacity={1} />
    </mesh>
  )
}

function Pins() {
  const ref = useRef<InstancedMesh>(null!)
  useEffect(() => {
    if (!ref.current) return
    SLOTS.forEach((s, i) => {
      _o.position.set(s[0], s[1] + 0.31, 0.13)
      _o.rotation.set(Math.PI / 2, 0, 0)
      _o.scale.set(1, 1, 1)
      _o.updateMatrix()
      ref.current.setMatrixAt(i, _o.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, SLOTS.length]} frustumCulled={false}>
      <cylinderGeometry args={[0.05, 0.05, 0.06, 8]} />
      <meshBasicMaterial color={PIN} />
    </instancedMesh>
  )
}

function Lamp({ x, warmth }: { x: number; warmth: number }) {
  return (
    <group position={[x, 0, -1.2]}>
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
// MultipleChoice3D — default export
// =========================================================================
export default function MultipleChoice3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle (same object the 2D shell receives) ──────────────────────
  const questions = useMemo<MCQ[]>(() => {
    const p = puzzle as MCPuzzle | undefined
    if (p && Array.isArray(p.questions) && p.questions.length > 0) return p.questions
    return DEMO
  }, [puzzle])
  const total = questions.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [seen, setSeen] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintShown, setHintShown] = useState(false)
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const cur = questions[idx]
  const done = seen >= total
  const pickedRight = revealed && picked === cur?.answerIndex

  // ── Session complete (single fire) ──────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('The board is full. Every notice is read.')
    const result: SessionResult = {
      correctCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'multiplechoice',
    }
    onSessionComplete?.(result)
  }, [done, correctCount, total, onSessionComplete])

  const pick = useCallback((i: number) => {
    if (revealed || done || !cur || i < 0 || i >= cur.options.length) return
    setPicked(i)
    setRevealed(true)
    if (i === cur.answerIndex) {
      setCorrectCount((c) => c + 1)
      setLive(`Correct — ${cur.options[i]}.`)
    } else {
      // No-fail: reveal the correct poster + advance.
      setLive(`Not quite — the answer was ${cur.options[cur.answerIndex]}.`)
    }
  }, [revealed, done, cur])

  const advance = useCallback(() => {
    setRevealed(false)
    setPicked(null)
    setHintShown(false)
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  const skip = useCallback(() => {
    if (done) return
    if (revealed) { advance(); return }
    setLive('Skipped — the notice waits for another time.')
    setHintShown(false)
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [revealed, done, advance])

  const useHint = useCallback(() => {
    if (revealed || done || hintsUsed >= 3 || !cur?.hint) return
    setHintsUsed((h) => h + 1)
    setHintShown(true)
    setLive(`Hint: ${cur.hint}`)
  }, [revealed, done, hintsUsed, cur])

  // ── Keyboard (1–4 / A–D pick, Enter next, H hint, S skip) ───────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key.toLowerCase()
      if (!revealed) {
        const numIdx = ['1', '2', '3', '4'].indexOf(k)
        const letIdx = ['a', 'b', 'c', 'd'].indexOf(k)
        const target = numIdx >= 0 ? numIdx : letIdx
        if (target >= 0 && cur && target < cur.options.length) { e.preventDefault(); pick(target); return }
        if (k === 'h') { e.preventDefault(); useHint(); return }
      } else if (k === 'enter' || k === ' ') { e.preventDefault(); advance(); return }
      if (k === 's') { e.preventDefault(); skip() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [revealed, done, cur, pick, advance, skip, useHint])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setIdx(0); setPicked(null); setRevealed(false); setCorrectCount(0)
    setSeen(0); setHintsUsed(0); setHintShown(false); setLive('')
  }, [])

  const warmth = total > 0 ? correctCount / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // Poster states for the 3D board.
  const posterStates: PosterState[] = useMemo(() => {
    return SLOTS.map((_, i) => {
      if (!cur || i >= cur.options.length) return 'dim'
      if (!revealed) return 'idle'
      if (i === cur.answerIndex) return 'correct'
      if (i === picked) return 'wrong'
      return 'dim'
    })
  }, [cur, revealed, picked])

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Bulletin Board</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>Pin the right poster</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{correctCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} pinned</span>
        </div>
      </div>

      {/* Question + options */}
      {cur && !done && (
        <div style={{ position: 'absolute', top: '16%', left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 92vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Notice card (the readable prompt) */}
          <div style={{
            background: 'rgba(14,10,26,0.86)', borderRadius: 12, border: `1px solid ${AMBER_SOFT}44`,
            padding: '16px 20px', marginBottom: 14,
          }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, lineHeight: 1.45, color: CREAM }}>{cur.prompt}</div>
            {cur.prompt_pl && <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 6, color: AMBER_SOFT }}>{cur.prompt_pl}</div>}
            {hintShown && cur.hint && (
              <div style={{ marginTop: 10, fontSize: 12, fontStyle: 'italic', color: AMBER_SOFT, opacity: 0.9 }}>
                Hint: {cur.hint}{cur.hint_pl ? ` · ${cur.hint_pl}` : ''}
              </div>
            )}
          </div>

          {/* Option posters (2×2) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {cur.options.map((opt, i) => {
              const isCorrect = revealed && i === cur.answerIndex
              const isWrong = revealed && i === picked && i !== cur.answerIndex
              const dim = revealed && !isCorrect && !isWrong
              return (
                <button key={i} onClick={() => pick(i)} disabled={revealed}
                  aria-label={`Option ${LETTERS[i]}: ${opt}${isCorrect ? ', correct' : isWrong ? ', wrong' : ''}`}
                  style={optionBtn(isCorrect ? GREEN : isWrong ? ROSE : AMBER_SOFT, dim, revealed)}>
                  <span style={{ fontSize: 9, letterSpacing: '0.18em', opacity: 0.7, display: 'block', marginBottom: 4 }}>{LETTERS[i]}</span>
                  {opt}{isCorrect ? '  ✓' : isWrong ? '  ✗' : ''}
                </button>
              )
            })}
          </div>

          {/* Reveal → next */}
          {revealed && (
            <div style={{ marginTop: 14 }}>
              <div style={{
                display: 'inline-block', padding: '6px 14px', borderRadius: 999, marginBottom: 10,
                fontWeight: 700, letterSpacing: '0.06em', fontSize: 12,
                background: pickedRight ? `${GREEN}22` : `${ROSE}18`,
                border: `1px solid ${pickedRight ? GREEN : ROSE}`, color: pickedRight ? GREEN : ROSE,
              }}>
                {pickedRight ? 'Correct!' : `Answer: ${cur.options[cur.answerIndex]}`}
              </div>
              <br />
              <button onClick={advance} style={nextBtn}>{idx + 1 >= total ? 'See the board →' : 'Next poster →'}</button>
            </div>
          )}
        </div>
      )}

      {/* Footer controls */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={skip} style={skipBtn}>SKIP →</button>
            <button onClick={useHint} disabled={revealed || hintsUsed >= 3} style={hintBtn(revealed || hintsUsed >= 3)}>HINT · {3 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>1–4 / A–D pick · H hint · Enter next · S skip</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Bulletin board complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The board is full.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every notice read.<br />
            <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} pinned correctly.
          </div>
          <button onClick={reset} style={nextBtn}>Read again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Multiple choice — read the notice and pin the correct answer poster"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.4, 6.4]} cameraFov={46} overlay={overlay}>
        <BulletinScene
          states={posterStates}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}

// ── Button styles ─────────────────────────────────────────────────────────────
function optionBtn(color: string, dim: boolean, locked: boolean): React.CSSProperties {
  return {
    minHeight: 54, padding: '10px 14px', borderRadius: 10,
    background: `${color}14`, border: `2px solid ${color}`, color: CREAM,
    fontWeight: 600, fontSize: 14, cursor: locked ? 'default' : 'pointer',
    opacity: dim ? 0.4 : 1, textAlign: 'center', touchAction: 'manipulation',
    transition: 'opacity 200ms ease',
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
