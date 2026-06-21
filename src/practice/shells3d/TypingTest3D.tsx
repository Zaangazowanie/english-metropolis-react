// TypingTest3D — "The Telegraph Office" (TypingTest district).
//
// A three.js re-skin of the canonical 2D TypingTest shell
// (src/practice/shells/TypingTest.tsx). The MECHANIC is unchanged: a target
// dispatch (sentence) appears; the player types it exactly. Correct characters
// advance the cursor; a wrong key is rejected (the key "jams" briefly — no
// penalty, no progress, the learner simply types the right letter — no-fail).
// Live WPM + accuracy are shown. Finishing a phrase advances; all phrases done
// → session complete. Same puzzle in (ShellTypingTestPuzzle.phrases →
// {target_text, target_wpm, hint_pl}); same SessionResult out. Built on GameKit.
//
// Scene: a dusk telegraph office. A brass telegraph key on a desk; paper tape
// spools from the receiver and lengthens as the dispatch is typed; a brass
// dial glows with live WPM — but the readable English (the target text + the
// live typed overlay) lives in the crisp DOM overlay, never baked into a
// texture (contract rule 9). Bajla the telegraph owl perches on the desk.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (type the text; Enter/→ next when done; S skip) + touch (native
// keyboard via a focused hidden input); procedural geometry + basic materials
// only; no new deps; no per-frame allocations.

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
const BRASS = '#b08d57'
const TAPE = '#e8dcc0'

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
interface TTPhrase { id: string; target_text: string; target_wpm?: number; hint_pl?: string }
interface TTPuzzle { phrases: TTPhrase[] }

// ── Built-in demo — original dusk-city dispatches ─────────────────────────────
const DEMO: TTPhrase[] = [
  { id: 't1', target_text: 'Take the metro to the city centre after work.', target_wpm: 28, hint_pl: 'Pojedź metrem do centrum po pracy.' },
  { id: 't2', target_text: 'We crossed the bridge at sunset and watched the river.', target_wpm: 26, hint_pl: 'Przeszliśmy przez most o zachodzie.' },
  { id: 't3', target_text: 'She bought a paper from the kiosk on the corner.', target_wpm: 28, hint_pl: 'Kupiła gazetę w kiosku na rogu.' },
  { id: 't4', target_text: 'The clock tower rang twelve times at midnight.', target_wpm: 28, hint_pl: 'Wieża zegarowa wybiła dwunastą.' },
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

const _col = new Color()

// ── 3D scene — the dusk telegraph office ──────────────────────────────────────
function TelegraphScene({ progress, jam, warmth, reducedMotion, bajlaVariant }: {
  progress: number; jam: boolean; warmth: number; reducedMotion: boolean; bajlaVariant: 'idle' | 'celebrate'
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
      {/* Telegraph desk */}
      <mesh position={[0, 0.66, -0.1]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.14, 1.5]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      {/* Telegraph base + brass key (jams red briefly on a wrong stroke) */}
      <mesh position={[0, 0.78, 0.3]} castShadow><boxGeometry args={[0.7, 0.1, 0.4]} /><meshToonMaterial color="#2A1C10" /></mesh>
      <TelegraphKey jam={jam} reducedMotion={reducedMotion} />
      {/* Paper tape spool — grows with typing progress */}
      <TapeSpool progress={progress} reducedMotion={reducedMotion} />
      {/* Brass WPM dial */}
      <mesh position={[1.1, 0.95, -0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.08, 16]} /><meshToonMaterial color={BRASS} />
      </mesh>
      <mesh position={[1.1, 1.0, -0.1]}>
        <sphereGeometry args={[0.06, 8, 6]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.5 + warmth * 0.45} />
      </mesh>
      {/* Warm office lamp */}
      <group position={[-1.7, 0, -1.0]}>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.04, 0.06, 2.8, 6]} /><meshToonMaterial color={palette.brass} /></mesh>
        <mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.16, 10, 8]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.55 + warmth * 0.4} /></mesh>
      </group>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.36} position={[1.55, 0.95, 0.4]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 2.1 + bob, 5.6)
    cam.lookAt(0, 1.0, 0)
  })
  return null
}

// Brass key — flashes rose when a wrong key is pressed, otherwise brass.
function TelegraphKey({ jam, reducedMotion }: { jam: boolean; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color }
    _col.set(jam ? ROSE : BRASS)
    const k = reducedMotion ? 1 : Math.min(1, dt * 10)
    mat.color.lerp(_col, k)
    // tiny press dip when jammed
    const want = jam ? 0.86 : 0.92
    ref.current.position.y += (want - ref.current.position.y) * (reducedMotion ? 1 : Math.min(1, dt * 12))
  })
  return (
    <mesh ref={ref} position={[0, 0.92, 0.3]} castShadow>
      <cylinderGeometry args={[0.07, 0.08, 0.1, 12]} />
      <meshBasicMaterial color={BRASS} />
    </mesh>
  )
}

// Paper tape — a strip that lengthens as the dispatch is typed.
function TapeSpool({ progress, reducedMotion }: { progress: number; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  useFrame((_, dt) => {
    if (!ref.current) return
    const targetLen = 0.3 + progress * 2.4
    const k = reducedMotion ? 1 : Math.min(1, dt * 6)
    ref.current.scale.x += (targetLen - ref.current.scale.x) * k
    ref.current.position.x = -0.3 - (ref.current.scale.x - 0.3) / 2
  })
  return (
    <mesh ref={ref} position={[-0.3, 0.74, -0.55]} scale={[0.3, 1, 1]}>
      <boxGeometry args={[1, 0.02, 0.3]} />
      <meshToonMaterial color={TAPE} />
    </mesh>
  )
}

// =========================================================================
// TypingTest3D — default export
// =========================================================================
export default function TypingTest3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const phrases = useMemo<TTPhrase[]>(() => {
    const p = puzzle as TTPuzzle | undefined
    if (p && Array.isArray(p.phrases) && p.phrases.length > 0) return p.phrases
    return DEMO
  }, [puzzle])
  const total = phrases.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  const [typed, setTyped] = useState('')          // correctly typed prefix
  const [jam, setJam] = useState(false)            // wrong-key flash
  const [keystrokes, setKeystrokes] = useState(0)  // total key attempts (for accuracy)
  const [hits, setHits] = useState(0)              // correct keystrokes
  const [phraseStart, setPhraseStart] = useState<number | null>(null)
  const [seen, setSeen] = useState(0)
  const [phraseDone, setPhraseDone] = useState(false)
  const [completedWpm, setCompletedWpm] = useState(0)
  const [okCount, setOkCount] = useState(0)        // phrases finished at/over target WPM
  const [live, setLive] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const jamTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const cur = phrases[idx]
  const done = seen >= total
  const target = cur?.target_text ?? ''

  useEffect(() => { if (!done && !phraseDone) setTimeout(() => inputRef.current?.focus(), 0) }, [idx, done, phraseDone])
  useEffect(() => () => { if (jamTimer.current) clearTimeout(jamTimer.current) }, [])

  // Live accuracy + WPM.
  const accuracy = keystrokes > 0 ? Math.round((hits / keystrokes) * 100) : 100
  const liveWpm = useMemo(() => {
    if (!phraseStart || typed.length === 0) return 0
    const mins = (performance.now() - phraseStart) / 60000
    if (mins <= 0) return 0
    return Math.round((typed.length / 5) / mins)
  }, [phraseStart, typed])

  // ── Session complete ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('Every dispatch sent. The wire falls quiet.')
    const r: SessionResult = {
      correctCount: okCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'typingtest',
    }
    onSessionComplete?.(r)
  }, [done, okCount, total, onSessionComplete])

  // Handle a controlled input change: accept only matching chars; reject the rest.
  const onInput = useCallback((value: string) => {
    if (phraseDone || done || !cur) return
    if (phraseStart === null) setPhraseStart(performance.now())
    // Compare against the target prefix.
    if (value.length <= typed.length) {
      // backspace / deletion — allow shrinking the correct prefix
      setTyped(value.slice(0, typed.length))
      return
    }
    const nextChar = value[value.length - 1]
    const expected = target[typed.length]
    setKeystrokes((k) => k + 1)
    if (nextChar === expected) {
      const np = typed + nextChar
      setTyped(np)
      setHits((h) => h + 1)
      if (np.length >= target.length) {
        // phrase complete
        const mins = phraseStart ? (performance.now() - phraseStart) / 60000 : 1
        const wpm = mins > 0 ? Math.round((target.length / 5) / mins) : 0
        setCompletedWpm(wpm)
        setPhraseDone(true)
        const tgt = cur.target_wpm ?? 0
        if (wpm >= tgt) setOkCount((c) => c + 1)
        setLive(`Dispatch sent — ${wpm} WPM, ${accuracy}% accurate.`)
      }
    } else {
      // wrong key — jam, no progress
      setJam(true)
      setLive('Key jammed — type the highlighted letter.')
      if (jamTimer.current) clearTimeout(jamTimer.current)
      jamTimer.current = setTimeout(() => setJam(false), reduce ? 0 : 240)
    }
  }, [phraseDone, done, cur, phraseStart, typed, target, accuracy, reduce])

  const advance = useCallback(() => {
    setTyped(''); setJam(false); setKeystrokes(0); setHits(0); setPhraseStart(null)
    setPhraseDone(false); setCompletedWpm(0)
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  const skip = useCallback(() => {
    if (done) return
    if (phraseDone) { advance(); return }
    setLive('Skipped — on to the next dispatch.')
    advance()
  }, [done, phraseDone, advance])

  // ── Keyboard for non-input keys (advance / skip) ────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      if (e.target === inputRef.current) return  // input handles typing
      const k = e.key.toLowerCase()
      if (phraseDone && (k === 'enter' || k === ' ' || k === 'arrowright')) { e.preventDefault(); advance(); return }
      if (k === 's') { e.preventDefault(); skip(); return }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, phraseDone, advance, skip])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setIdx(0); setTyped(''); setJam(false); setKeystrokes(0); setHits(0); setPhraseStart(null)
    setPhraseDone(false); setCompletedWpm(0); setOkCount(0); setSeen(0); setLive('')
  }, [])

  const progress = target.length > 0 ? typed.length / target.length : 0
  const warmth = total > 0 ? seen / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : phraseDone ? 'celebrate' : 'idle'

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Telegraph Office</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Tap out the dispatch</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px', display: 'flex', gap: 10 }}>
          <span><span style={{ color: GREEN }}>{liveWpm}</span><span style={{ opacity: 0.6 }}> WPM</span></span>
          <span><span style={{ color: accuracy >= 95 ? GREEN : AMBER_SOFT }}>{accuracy}%</span><span style={{ opacity: 0.6 }}> acc</span></span>
          <span style={{ opacity: 0.6 }}>{Math.min(idx + 1, total)}/{total}</span>
        </div>
      </div>

      {cur && !done && (
        <div style={{ position: 'absolute', top: '16%', left: '50%', transform: 'translateX(-50%)', width: 'min(640px, 94vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Tape — target text with typed prefix highlighted */}
          <div style={{
            background: TAPE, color: '#2A1C10', borderRadius: 8, border: `2px solid ${jam ? ROSE : `${BRASS}88`}`,
            padding: '20px 22px', marginBottom: 14, fontFamily: 'Georgia, serif', fontSize: 20, lineHeight: 1.7,
            letterSpacing: '0.02em', boxShadow: 'inset 0 0 20px rgba(120,90,40,0.18)', transition: 'border-color 160ms ease',
          }}>
            {target.split('').map((ch, i) => {
              const stateColor = i < typed.length ? GREEN : i === typed.length ? INK : '#9a8a6a'
              const bg = i === typed.length ? `${AMBER_SOFT}` : 'transparent'
              return (
                <span key={i} style={{
                  color: i < typed.length ? '#15663f' : stateColor,
                  background: bg, borderRadius: 3,
                  textDecoration: i < typed.length ? 'none' : 'none',
                  fontWeight: i < typed.length ? 700 : 400,
                  padding: i === typed.length ? '0 1px' : 0,
                }}>{ch === ' ' ? ' ' : ch}</span>
              )
            })}
          </div>
          {cur.hint_pl && <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12, fontStyle: 'italic', color: AMBER_SOFT }}>🇵🇱 {cur.hint_pl}</div>}

          {/* Hidden-ish input that captures typing (visible caret cue) */}
          {!phraseDone ? (
            <input ref={inputRef} value={typed} onChange={(e) => onInput(e.target.value)}
              aria-label="Type the dispatch shown above"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              style={{
                width: 'min(420px, 90%)', padding: '10px 14px', borderRadius: 9,
                background: 'rgba(14,10,26,0.6)', border: `2px solid ${jam ? ROSE : AMBER_SOFT}`,
                color: CREAM, fontFamily: 'Georgia, serif', fontSize: 16, outline: 'none', textAlign: 'center',
              }} />
          ) : (
            <div>
              <div style={{
                display: 'inline-block', padding: '8px 16px', borderRadius: 999, marginBottom: 12,
                fontWeight: 700, fontSize: 13, background: `${GREEN}22`, border: `1px solid ${GREEN}`, color: GREEN,
              }}>
                ✓ Sent · {completedWpm} WPM · {accuracy}% {cur.target_wpm ? `(target ${cur.target_wpm})` : ''}
              </div>
              <br />
              <button onClick={advance} style={nextBtn}>{idx + 1 >= total ? 'Close the office →' : 'Next dispatch →'}</button>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <button onClick={skip} style={skipBtn}>SKIP →</button>
          <div style={{ fontSize: 10, opacity: 0.5 }}>type the dispatch · wrong keys jam (no penalty) · S skip</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Telegraph office complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The wire falls quiet.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every dispatch tapped out.<br />
            <strong style={{ color: GREEN }}>{okCount}</strong> / {total} sent at target speed.
          </div>
          <button onClick={reset} style={nextBtn}>Send again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Typing test — type each dispatch exactly as shown; wrong keys jam without penalty"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.1, 5.6]} cameraFov={48} overlay={overlay}>
        <TelegraphScene progress={progress} jam={jam} warmth={warmth} reducedMotion={reduce} bajlaVariant={bajlaVariant} />
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
