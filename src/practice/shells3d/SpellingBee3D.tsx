// SpellingBee3D — "Mr. Frank's Sorting Office", The Sorting Office.
//
// A three.js re-skin of the canonical 2D SpellingBee shell
// (src/practice/shells/SpellingBee.tsx). The MECHANIC, word-by-word
// spelling, hint system, and single-fire onSessionComplete are inherited
// from the 2D shell — this file changes only the stagecraft. Same puzzle in
// (SpellingBeePuzzle.words), same session result out (SessionResult). Built
// on the Fluent City GameKit.
//
// Scene: Mr. Frank's Sorting Office at dusk. Letter addresses have faded
// from the parcels. The player types each word letter by letter onto a
// vintage letterboard to restore the address — each correctly spelled word
// lets Mr. Frank stamp and dispatch a parcel, and the office lamp warms.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// all readable English lives in the DOM overlay (letterboard slots + clue
// text, never 3D textures); quality tiers + reducedMotion honoured; full
// keyboard input; no audio (no external URLs); procedural geometry + vertex
// colours only (no GLB, no external URLs, no new deps); no per-frame allocs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'
import { generateSpellingBee } from '../generators/generateSpellingBee'
import type { SpellingBeeWord, SpellingBeePuzzle } from '../generators/generateSpellingBee'

// ── Palette ────────────────────────────────────────────────────────────────────
const CREAM  = '#f6efe2'
const AMBER  = '#E8920A'
const AMBER_SOFT = '#ffce86'
const INK    = '#1f0e3a'
const GREEN  = '#34D399'
const ROSE   = '#FB7185'

// ── Demo puzzle — postal/sorting-themed vocabulary ────────────────────────────
const DEMO_INPUT = [
  { word: 'address',   word_pl: 'adres',       exampleEn: 'Write the address clearly on the envelope.' },
  { word: 'parcel',    word_pl: 'paczka',      exampleEn: 'The parcel arrived on Tuesday morning.' },
  { word: 'envelope',  word_pl: 'koperta',     exampleEn: 'She sealed the envelope with care.' },
  { word: 'borough',   word_pl: 'dzielnica',   exampleEn: 'Each borough has its own post office.' },
  { word: 'district',  word_pl: 'okręg',       exampleEn: 'The district covers ten streets.' },
  { word: 'postbox',   word_pl: 'skrzynka pocztowa', exampleEn: 'Drop the letter in the postbox.' },
  { word: 'courier',   word_pl: 'kurier',      exampleEn: 'The courier knocked twice at the door.' },
  { word: 'receipt',   word_pl: 'potwierdzenie', exampleEn: 'Keep the receipt for the parcel.' },
]
const DEMO: SpellingBeePuzzle = generateSpellingBee(DEMO_INPUT, { count: 6, seed: 0xF04B }) ?? {
  words: DEMO_INPUT.slice(0, 6).map((it) => ({ id: it.word, word: it.word, hint: it.exampleEn!, hint_pl: `Po polsku: ${it.word_pl}.` })),
}

// Allocation-free scratch objects.
const _obj = new Object3D()
const _col = new Color()

// ── 3D Scene — The Sorting Office at dusk ─────────────────────────────────────
function SortingScene({
  solvedCount,
  total,
  reducedMotion,
  bajlaVariant,
}: {
  solvedCount: number
  total: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  const warmth = total > 0 ? solvedCount / total : 0

  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 9 + warmth * 5, 24 + warmth * 6]} />}
      <RoomShell warmth={warmth} />
      <SortingCounter />
      <Letterboard warmth={warmth} highFx={highFx} />
      <HangingLamps flicker={tier !== 'low' && !reducedMotion} warmth={warmth} />
      <Parcels solvedCount={solvedCount} reducedMotion={reducedMotion} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.38} position={[2.6, 1.1, 0.3]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.48) * 0.035
    cam.position.set(0, 2.8 + bob, 7.2)
    cam.lookAt(0, 1.4, 0)
  })
  return null
}

function RoomShell({ warmth }: { warmth: number }) {
  return (
    <group>
      {/* Back wall */}
      <mesh position={[0, 2.2, -3.4]}>
        <boxGeometry args={[14, 6.5, 0.3]} />
        <meshStandardMaterial color="#2a3830" roughness={1} />
      </mesh>
      {/* Floor */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 9]} />
        <meshStandardMaterial color="#3d2a18" roughness={0.95} />
      </mesh>
      {/* Arched window (the teal sky outside) */}
      <mesh position={[0, 3.8, -3.35]}>
        <cylinderGeometry args={[1.1, 1.1, 0.12, 20, 1, false, 0, Math.PI]} rotation={[Math.PI / 2, 0, 0]} />
        <meshStandardMaterial color={palette.duskMid} emissive={palette.duskTop} emissiveIntensity={0.3 + warmth * 0.5} roughness={0.3} />
      </mesh>
      {/* Wall cubby shelves — instanced */}
      <WallCubbies />
    </group>
  )
}

function WallCubbies() {
  const inst = useRef<InstancedMesh>(null)
  const N = 24
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        out.push([-4.8 + col * 1.92, 1.2 + row * 0.65, -3.1])
      }
    }
    return out
  }, [])
  useEffect(() => {
    const m = inst.current; if (!m) return
    positions.forEach((p, i) => {
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1.8, 0.58, 0.4)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
      _col.set(i % 2 === 0 ? '#4a3322' : '#3d2a18')
      m.setColorAt(i, _col)
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
  }, [positions])
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors roughness={0.95} />
    </instancedMesh>
  )
}

function SortingCounter() {
  return (
    <group position={[0, 0, 0.6]}>
      <mesh position={[0, 0.78, 0]} receiveShadow>
        <boxGeometry args={[8.0, 0.14, 1.8]} />
        <meshStandardMaterial color="#6b4a2e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[8.0, 0.62, 1.6]} />
        <meshStandardMaterial color="#4a3220" roughness={1} />
      </mesh>
      {/* Small piles of envelopes on counter */}
      {[-2.5, -0.8, 0.8, 2.5].map((x, i) => (
        <mesh key={i} position={[x, 0.88, -0.2]} rotation={[0, (i * 0.15) % 0.3, 0]}>
          <boxGeometry args={[0.6 + (i % 2) * 0.2, 0.06 + i * 0.02, 0.38]} />
          <meshStandardMaterial color={CREAM} roughness={0.7} />
        </mesh>
      ))}
      {/* Ink stamp */}
      <mesh position={[3.2, 0.88, 0.3]}>
        <boxGeometry args={[0.28, 0.22, 0.16]} />
        <meshStandardMaterial color="#8a4b34" roughness={0.8} />
      </mesh>
    </group>
  )
}

// The mechanical letterboard — the exercise's physical analogue in 3D.
// It grows warmer as words are correctly spelled.
function Letterboard({ warmth, highFx }: { warmth: number; highFx: boolean }) {
  const lampRef = useRef<PointLight>(null)
  useFrame((_, dt) => {
    if (!lampRef.current) return
    lampRef.current.intensity += (0.35 + warmth * 1.2 - lampRef.current.intensity) * Math.min(1, dt * 3)
  })
  return (
    <group position={[-1.5, 2.4, -3.0]}>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[5.2, 2.4, 0.22]} />
        <meshStandardMaterial color="#3d2818" roughness={0.9} />
      </mesh>
      {/* Slate surface */}
      <mesh position={[0, 0, 0.12]}>
        <boxGeometry args={[4.9, 2.2, 0.08]} />
        <meshStandardMaterial color="#1c2622" roughness={0.9} emissive={AMBER} emissiveIntensity={0.04 + warmth * 0.12} />
      </mesh>
      {/* "SORTING OFFICE" label strip */}
      <mesh position={[0, 0.95, 0.22]}>
        <boxGeometry args={[4.8, 0.28, 0.04]} />
        <meshStandardMaterial color="#2f4a3a" roughness={0.7} emissive="#3a6a50" emissiveIntensity={0.4 + warmth * 0.5} />
      </mesh>
      {highFx && <pointLight ref={lampRef} position={[0, 0.4, 1.0]} color={palette.lanternAmber} intensity={0.4} distance={7} decay={2} />}
    </group>
  )
}

function HangingLamps({ flicker, warmth }: { flicker: boolean; warmth: number }) {
  const inst = useRef<InstancedMesh>(null)
  const N = 4
  const positions = useMemo(() => Array.from({ length: N }, (_, i) => ({ x: -3 + i * 2.0, y: 3.5 })), [])
  useEffect(() => {
    const m = inst.current; if (!m) return
    positions.forEach((p, i) => {
      _obj.position.set(p.x, p.y, -0.2)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1.3, 1)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    const m = inst.current; if (!m || !flicker) return
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.5 + warmth * 0.5 + Math.sin(state.clock.elapsedTime * 5.4) * 0.1
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[0.18, 12, 10]} />
      <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.6} roughness={0.5} />
    </instancedMesh>
  )
}

// A cluster of parcels that grow as words are solved.
function Parcels({ solvedCount, reducedMotion }: { solvedCount: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const N = 8
  const placed = useMemo(() => Array.from({ length: N }, (_, i) => ({
    x: -3.4 + i * 0.88,
    h: 0.18 + (i % 3) * 0.12,
    w: 0.5 + (i % 2) * 0.22,
  })), [])
  useEffect(() => {
    const m = inst.current; if (!m) return
    placed.forEach((p, i) => {
      const solved = i < solvedCount
      _obj.position.set(p.x, 0.78 + p.h / 2, -0.8)
      _obj.rotation.set(0, (i % 4) * 0.1, 0)
      _obj.scale.set(p.w, p.h, 0.36)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
      _col.set(solved ? '#c5a86e' : '#4a3220')
      m.setColorAt(i, _col)
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
  }, [placed, solvedCount])
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors roughness={0.9} />
    </instancedMesh>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function slotStyle(state: 'filled' | 'next' | 'wrong' | 'empty', letter: string, reduce: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 44, height: 54, margin: '0 3px', borderRadius: 6,
    fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 700,
    transition: reduce ? 'none' : 'all 180ms',
    animation: state === 'wrong' && !reduce ? 'sbShake 0.35s ease' : 'none',
  }
  switch (state) {
    case 'filled': return { ...base, background: `${GREEN}22`, border: `2px solid ${GREEN}`, color: GREEN }
    case 'next':   return { ...base, background: 'rgba(246,239,226,0.12)', border: `2px solid ${AMBER}`, color: AMBER }
    case 'wrong':  return { ...base, background: `${ROSE}18`, border: `2px solid ${ROSE}`, color: ROSE }
    default:       return { ...base, background: 'rgba(14,10,26,0.55)', border: '2px dashed rgba(246,239,226,0.25)', color: 'rgba(246,239,226,0.3)' }
  }
}

// =========================================================================
// SpellingBee3D — default export
// =========================================================================
export default function SpellingBee3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle ─────────────────────────────────────────────────────────
  const activePuzzle = useMemo<SpellingBeePuzzle>(() => {
    const p = puzzle as SpellingBeePuzzle | undefined
    if (p && Array.isArray(p.words) && p.words.length > 0) return p
    if (vocab && vocab.length >= 2) {
      const gen = generateSpellingBee(
        vocab.map((v) => ({ word: v.word, word_pl: v.word_pl ?? '', exampleEn: v.exampleEn })),
        { count: 6, seed: 0x504B },
      )
      if (gen) return gen
    }
    return DEMO
  }, [puzzle, vocab])

  const words: SpellingBeeWord[] = activePuzzle.words
  const total = words.length

  // ── State ─────────────────────────────────────────────────────────────────
  const [wordIdx, setWordIdx] = useState(0)
  const [typed, setTyped] = useState('')       // letters correctly typed so far
  const [wrongLetter, setWrongLetter] = useState(false) // shake the next slot
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintRevealed, setHintRevealed] = useState(false) // reveal next letter
  const [live, setLive] = useState('')
  const [solvedCount, setSolvedCount] = useState(0)
  const fired = useRef(false)
  const startMs = useRef(performance.now())
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cur: SpellingBeeWord | undefined = words[wordIdx]
  const word = cur?.word.toLowerCase() ?? ''
  const done = solvedCount >= total

  // Reset state when the word changes.
  useEffect(() => {
    setTyped('')
    setWrongLetter(false)
    setHintRevealed(false)
    setHintsUsed(0)
    setLive('')
  }, [wordIdx])

  // ── Session complete ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('All parcels addressed and dispatched. Mr. Frank is very pleased.')
    const result: SessionResult = {
      correctCount: solvedCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'spellingbee',
    }
    onSessionComplete?.(result)
  }, [done, solvedCount, total, onSessionComplete])

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const advance = useCallback(() => {
    setSolvedCount((s) => s + 1)
    if (advTimer.current) clearTimeout(advTimer.current)
    advTimer.current = setTimeout(() => {
      setWordIdx((i) => Math.min(i + 1, total - 1))
    }, 850)
  }, [total])

  useEffect(() => {
    if (!cur) return
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key
      // Hint: H key
      if ((k === 'h' || k === 'H') && hintsUsed < 3) {
        e.preventDefault()
        const nextIdx = typed.length
        if (nextIdx < word.length) {
          setHintRevealed(true)
          setHintsUsed((n) => n + 1)
          setLive(`Hint: next letter is ${word[nextIdx].toUpperCase()}.`)
          // Auto-place the hinted letter after 1.2 s
          if (advTimer.current) clearTimeout(advTimer.current)
          advTimer.current = setTimeout(() => {
            setTyped((t) => t + word[nextIdx])
            setHintRevealed(false)
          }, 1200)
        }
        return
      }
      // Skip: S key
      if (k === 's' || k === 'S') {
        e.preventDefault()
        advance()
        return
      }
      // Backspace: remove last letter
      if (k === 'Backspace') {
        e.preventDefault()
        setTyped((t) => t.slice(0, -1))
        setWrongLetter(false)
        return
      }
      // Letter keys
      if (/^[a-zA-Z]$/.test(k)) {
        e.preventDefault()
        const nextIdx = typed.length
        if (nextIdx >= word.length) return
        const correct = k.toLowerCase() === word[nextIdx]
        if (correct) {
          const nextTyped = typed + k.toLowerCase()
          setTyped(nextTyped)
          setWrongLetter(false)
          if (nextTyped === word) {
            setLive(`Correct — ${word} spelled!`)
            advance()
          }
        } else {
          // No-fail: wrong key shakes the slot, player tries again
          setWrongLetter(true)
          setLive(`Not quite — listen to the clue. Try again.`)
          if (shakeTimer.current) clearTimeout(shakeTimer.current)
          shakeTimer.current = setTimeout(() => setWrongLetter(false), 500)
        }
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cur, word, typed, done, hintsUsed, advance])

  useEffect(() => () => {
    if (shakeTimer.current) clearTimeout(shakeTimer.current)
    if (advTimer.current) clearTimeout(advTimer.current)
  }, [])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setWordIdx(0); setTyped(''); setWrongLetter(false)
    setHintRevealed(false); setHintsUsed(0)
    setSolvedCount(0); setLive('')
  }, [])

  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // ── DOM overlay ─────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Sorting Office</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>Mr. Frank&apos;s Address Board</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{solvedCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} dispatched</span>
        </div>
      </div>

      {/* Letterboard — the exercise surface */}
      {cur && !done && (
        <div style={{ position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          {/* Letter slots */}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0, marginBottom: 14 }}>
            {Array.from({ length: word.length }).map((_, i) => {
              const isFilled = i < typed.length
              const isNext = i === typed.length
              const isWrong = isNext && wrongLetter
              const letter = isFilled ? typed[i].toUpperCase() : isNext && hintRevealed ? word[i].toUpperCase() : ''
              const state: 'filled' | 'next' | 'wrong' | 'empty' = isFilled ? 'filled' : isWrong ? 'wrong' : isNext ? 'next' : 'empty'
              return <span key={i} style={slotStyle(state, letter, reduce)}>{letter || (isNext ? '_' : '')}</span>
            })}
          </div>
          {/* Built readout */}
          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 10 }}>
            {typed.length}/{word.length} letters
          </div>
          {/* Clue */}
          <div style={{
            display: 'inline-block', maxWidth: 'min(480px,84vw)', padding: '12px 20px',
            background: 'rgba(14,10,26,0.82)', borderRadius: 8, border: `1px solid ${AMBER}44`,
            fontStyle: 'italic', fontSize: 14, color: CREAM, lineHeight: 1.5,
          }}>
            <span style={{ fontSize: 9, letterSpacing: '0.18em', color: AMBER_SOFT, display: 'block', marginBottom: 4, fontStyle: 'normal' }}>CLUE · PODPOWIEDŹ</span>
            &ldquo;{cur.hint}&rdquo;
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4, fontStyle: 'normal', color: AMBER_SOFT }}>PL: {cur.hint_pl}</div>
          </div>
        </div>
      )}

      {/* Controls */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button
            onClick={() => { if (hintsUsed < 3 && !done) { setHintRevealed(true); setHintsUsed((n) => n + 1); const idx = typed.length; if (idx < word.length) { setLive(`Hint: ${word[idx].toUpperCase()}.`); if (advTimer.current) clearTimeout(advTimer.current); advTimer.current = setTimeout(() => { setTyped((t) => t + word[idx]); setHintRevealed(false); }, 1200); } } }}
            disabled={hintsUsed >= 3 || done}
            aria-label={`Hint — ${3 - hintsUsed} left`}
            style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)', border: `1px solid ${AMBER}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em', cursor: hintsUsed < 3 ? 'pointer' : 'default', opacity: hintsUsed >= 3 ? 0.45 : 1, touchAction: 'manipulation' }}
          >HINT {3 - hintsUsed}</button>
          <button onClick={() => advance()} style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)', border: `1px solid ${AMBER}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', touchAction: 'manipulation' }}>SKIP →</button>
          <button onClick={() => setTyped((t) => t.slice(0, -1))} style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.08)', border: `1px solid rgba(246,239,226,0.2)`, color: CREAM, fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', touchAction: 'manipulation' }}>⌫</button>
        </div>
      )}
      {!done && (
        <div style={{ position: 'absolute', bottom: 20, right: 14, fontSize: 10, opacity: 0.5 }}>
          Type letters to spell · H hint · S skip · ⌫ backspace
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="All parcels dispatched" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>All parcels dispatched.</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Mr. Frank stamps the last one with a firm, happy thump.<br />
            <strong style={{ color: GREEN }}>{solvedCount}</strong> / {total} words spelled correctly.
          </div>
          <button onClick={reset} style={{ minHeight: 44, padding: '10px 22px', borderRadius: 9, background: AMBER, color: INK, border: `2px solid ${AMBER}`, fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation' }}>Sort again →</button>
        </div>
      )}

      <style>{`@keyframes sbShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}`}</style>
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Mr. Frank's Sorting Office — type the letters to spell each address word"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 2.8, 7.2]}
        cameraFov={46}
        overlay={overlay}
      >
        <SortingScene
          solvedCount={solvedCount}
          total={total}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}
