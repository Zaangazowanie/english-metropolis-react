// Anagram3D — "Mr. Chen's Chalkboard", Saffron Market.
//
// A three.js re-skin of the canonical 2D Anagram shell
// (src/practice/shells/Anagram.tsx). The MECHANIC, tile→slot spelling, the
// forgiving no-fail wrong-order shake, the per-word hint (reveal next letter),
// the deck/visited-set completion and the single-fire session result are
// inherited from the 2D shell — this file changes only the stagecraft. Same
// puzzle in (AnagramPuzzle[]), same session result out (SessionResult). Built
// on the Fluent City GameKit (CityStage + Bajla + palette).
//
// Scene: Mr. Chen's café "The Still Cup" at dusk. The wind has scrambled the
// chalk menu; help him put each word back so the café can open. The slate
// chalkboard backs the readable DOM chalk-letters (English stays crisp DOM,
// never a 3D texture). Each word restored warms the café lamp and pushes the
// Hush (grey fog) back a half-step.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden); all
// readable English lives in the DOM overlay; quality tiers + reducedMotion
// honoured; full keyboard + touch (≥44px tap targets); procedural geometry +
// vertex/instance colours only (no GLB, no textures, no external URLs, no new
// deps); no per-frame allocations; instancing for repeated props.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'
import { generateAnagram } from '../generators/generateAnagram'
import type { AnagramPuzzle } from '../generators/generateAnagram'

// ── Palette constants ─────────────────────────────────────────────────────────
const CHALK = '#f3ead6'
const AMBER_STR = '#E8920A'
const AMBER_SOFT = '#ffce86'
const INK = '#1f0e3a'
const ROSE = '#FB7185'
const GREEN = '#7fb069'

// ── Built-in demo deck (anonymous / home-page play) ───────────────────────────
// Original Saffron Market café vocabulary (5–8 letters), scrambled by the same
// generator the 2D shell uses. No abeto / external content.
const DEMO_INPUT = [
  { word: 'coffee', word_pl: 'kawa', clue: 'A warm morning drink.' },
  { word: 'teapot', word_pl: 'czajniczek', clue: 'You pour from it.' },
  { word: 'biscuit', word_pl: 'herbatnik', clue: 'A small sweet baked snack.' },
  { word: 'muffin', word_pl: 'babeczka', clue: 'A little cake for one.' },
  { word: 'saucer', word_pl: 'spodek', clue: 'The small plate under a cup.' },
]
const DEMO_DECK: AnagramPuzzle[] = generateAnagram(DEMO_INPUT, { count: 5, seed: 0xC0FFEE })

// ── Allocation-free scratch objects (module scope) ────────────────────────────
const _obj = new Object3D()
const _col = new Color()

interface Tile { id: number; letter: string }

// =========================================================================
// 3D Scene
// =========================================================================
function CafeScene({
  solvedCount,
  total,
  reducedMotion,
  bajlaVariant,
  justSolved,
}: {
  solvedCount: number
  total: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
  justSolved: number
}) {
  const { tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  // Warmth grows as words are restored (0..1).
  const warmth = total > 0 ? solvedCount / total : 0

  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {/* The Hush — fog recedes as the café warms. */}
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 9 + warmth * 6, 26 + warmth * 8]} />}
      <Background />
      <CafeFacade warmth={warmth} highFx={highFx} justSolved={justSolved} reducedMotion={reducedMotion} />
      <Chalkboard />
      <Counter />
      <Lanterns flicker={tier !== 'low' && !reducedMotion} warmth={warmth} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.4} position={[2.7, 1.35, 0.4]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.035
    cam.position.set(0, 2.4 + bob, 6.6)
    cam.lookAt(0, 2.0, 0)
  })
  return null
}

function Background() {
  return (
    <group>
      {/* Night wall behind the café */}
      <mesh position={[0, 2.4, -3.4]} receiveShadow>
        <boxGeometry args={[16, 6.5, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* Wet cobble floor */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 9]} />
        <meshStandardMaterial color="#34555e" roughness={0.85} metalness={0.15} />
      </mesh>
    </group>
  )
}

// The café shopfront — "The Still Cup". A warm doorway whose glow strengthens
// as words are restored; a relight pop on each solve.
function CafeFacade({ warmth, highFx, justSolved, reducedMotion }: { warmth: number; highFx: boolean; justSolved: number; reducedMotion: boolean }) {
  const door = useRef<InstancedMesh>(null)
  const lamp = useRef<PointLight>(null)
  const popT = useRef(-10)
  const lastSolved = useRef(justSolved)
  useEffect(() => {
    if (justSolved !== lastSolved.current) {
      lastSolved.current = justSolved
      popT.current = 0 // trigger a relight bloom
    }
  }, [justSolved])
  useFrame((state, dt) => {
    if (popT.current >= 0) popT.current += dt
    const pop = popT.current >= 0 && popT.current < 2.2 ? (1 - popT.current / 2.2) : 0
    const flick = highFx ? Math.sin(state.clock.elapsedTime * 5) * 0.08 : 0
    const base = 0.25 + warmth * 0.9 + pop * 0.8 + flick
    if (lamp.current) lamp.current.intensity = base
    const d = door.current
    if (d) {
      const mat = d.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.3 + warmth * 0.8 + pop
    }
  })
  return (
    <group position={[0, 0, -1.4]}>
      {/* Facade body */}
      <mesh position={[0, 2.3, 0]}>
        <boxGeometry args={[6.4, 4.6, 0.5]} />
        <meshStandardMaterial color="#caa46f" roughness={0.95} />
      </mesh>
      {/* Pitched awning */}
      <mesh position={[0, 4.6, 0.35]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[6.8, 0.18, 1.2]} />
        <meshStandardMaterial color="#8a4b34" roughness={0.9} />
      </mesh>
      {/* Sign board */}
      <mesh position={[0, 4.0, 0.3]}>
        <boxGeometry args={[3.0, 0.6, 0.08]} />
        <meshStandardMaterial color={INK} roughness={0.7} emissive={AMBER_STR} emissiveIntensity={0.15 + warmth * 0.5} />
      </mesh>
      {/* Warm doorway (the glow that grows as the café wakes) */}
      <instancedMesh ref={door} args={[undefined, undefined, 1]} frustumCulled={false}>
        <planeGeometry args={[1.5, 2.6]} />
        <meshStandardMaterial color={AMBER_SOFT} emissive={AMBER_STR} emissiveIntensity={0.3} transparent opacity={0.92} toneMapped={false} />
      </instancedMesh>
      {/* place the door plane */}
      <DoorPlacer meshRef={door} />
      {highFx && <pointLight ref={lamp} position={[0, 2.2, 1.4]} color={palette.lanternAmber} intensity={0.4} distance={11} decay={2} />}
    </group>
  )
}

// Position the single door plane (instanced for the emissive-intensity hook).
function DoorPlacer({ meshRef }: { meshRef: React.RefObject<InstancedMesh | null> }) {
  useEffect(() => {
    const m = meshRef.current
    if (!m) return
    _obj.position.set(-1.7, 1.35, 0.27)
    _obj.rotation.set(0, 0, 0)
    _obj.scale.set(1, 1, 1)
    _obj.updateMatrix()
    m.setMatrixAt(0, _obj.matrix)
    m.instanceMatrix.needsUpdate = true
  }, [meshRef])
  return null
}

// The slate chalkboard — pure backing for the crisp DOM chalk-letters.
function Chalkboard() {
  return (
    <group position={[0, 2.05, -0.2]}>
      {/* Frame */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[4.5, 2.5, 0.12]} />
        <meshStandardMaterial color="#5a3d28" roughness={0.9} />
      </mesh>
      {/* Slate */}
      <mesh>
        <boxGeometry args={[4.2, 2.2, 0.1]} />
        <meshStandardMaterial color="#1c2622" roughness={0.95} />
      </mesh>
      {/* Chalk tray */}
      <mesh position={[0, -1.18, 0.12]}>
        <boxGeometry args={[4.2, 0.12, 0.18]} />
        <meshStandardMaterial color="#3a2818" roughness={1} />
      </mesh>
    </group>
  )
}

function Counter() {
  return (
    <group position={[0, 0, 0.9]}>
      <mesh position={[0, 0.78, 0]} receiveShadow>
        <boxGeometry args={[5.2, 0.14, 1.2]} />
        <meshStandardMaterial color="#7a5c3a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[5.2, 0.62, 1.0]} />
        <meshStandardMaterial color="#5c4226" roughness={1} />
      </mesh>
      {/* Two cups + a teapot on the counter */}
      {[-1.2, 1.2].map((x, i) => (
        <mesh key={i} position={[x, 0.95, 0.2]}>
          <cylinderGeometry args={[0.13, 0.1, 0.2, 10]} />
          <meshStandardMaterial color={CHALK} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 1.0, 0.2]}>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color="#9aa7ad" roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  )
}

function Lanterns({ flicker, warmth }: { flicker: boolean; warmth: number }) {
  const inst = useRef<InstancedMesh>(null)
  const N = 6
  const positions = useMemo(() => Array.from({ length: N }, (_, i) => ({ x: -3 + i * 1.2, y: 3.6 + Math.sin(i) * 0.1 })), [])
  useEffect(() => {
    const m = inst.current
    if (!m) return
    positions.forEach((p, i) => {
      _obj.position.set(p.x, p.y, 0.6)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1.2, 1)
      _obj.updateMatrix()
      m.setMatrixAt(i, _obj.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    const m = inst.current
    if (!m || !flicker) return
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.5 + warmth * 0.4 + Math.sin(state.clock.elapsedTime * 5.5) * 0.12
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[0.12, 10, 8]} />
      <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.6} roughness={0.5} />
    </instancedMesh>
  )
}

// ── prefers-reduced-motion (local, SSR-safe, no dep) ──────────────────────────
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

function btnBase(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: 'rgba(232,146,10,0.16)', border: `1px solid ${AMBER_STR}66`,
    color: AMBER_SOFT, fontFamily: 'ui-monospace,monospace', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

// Belt-and-suspenders answer-leak guard (mirrors the 2D shell).
function safeClue(hint: string, word: string): string {
  return hint.toLowerCase().includes(word.toLowerCase())
    ? `${word.length}-letter word — arrange the chalk.`
    : hint
}

// =========================================================================
// Anagram3D — the Game3D component (default export)
// =========================================================================
export default function Anagram3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve deck ──────────────────────────────────────────────────────────
  const deck = useMemo<AnagramPuzzle[]>(() => {
    const p = puzzle as AnagramPuzzle[] | AnagramPuzzle | undefined
    if (Array.isArray(p) && p.length > 0 && p[0]?.word) return p
    if (p && !Array.isArray(p) && (p as AnagramPuzzle).word) return [p as AnagramPuzzle]
    if (vocab && vocab.length > 0) {
      const gen = generateAnagram(
        vocab.map((v) => ({ word: v.word, word_pl: v.word_pl ?? '', clue: v.exampleEn })),
        { count: 5, seed: 0xA9A9 },
      )
      if (gen.length > 0) return gen
    }
    return DEMO_DECK
  }, [puzzle, vocab])

  const total = deck.length

  // ── State ───────────────────────────────────────────────────────────────
  const [puzzleIdx, setPuzzleIdx] = useState(0)
  const [slots, setSlots] = useState<number[]>([])
  const [shake, setShake] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintReveal, setHintReveal] = useState<{ slot: number; letter: string } | null>(null)
  const [visited, setVisited] = useState<Set<string>>(() => new Set())
  const [solvedWords, setSolvedWords] = useState<Set<string>>(() => new Set())
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cur = deck[puzzleIdx % total]
  const word = cur.word.toUpperCase()
  const targetLen = word.length

  // Tiles — the scrambled chalk letters, with stable ids.
  const tiles: Tile[] = useMemo(
    () => cur.scrambledLetters.map((l, i) => ({ id: i, letter: l.toUpperCase() })),
    [cur.scrambledLetters],
  )

  const inSlots = useMemo(() => new Set(slots), [slots])
  const built = useMemo(() => slots.map((id) => tiles.find((t) => t.id === id)?.letter ?? '').join(''), [slots, tiles])
  const won = built === word

  // Reset slots on puzzle change.
  useEffect(() => {
    setSlots([])
    setHintReveal(null)
    setHintsUsed(0)
  }, [puzzleIdx])

  // ── Interaction ────────────────────────────────────────────────────────
  const placeTile = useCallback((id: number) => {
    if (inSlots.has(id) || slots.length >= targetLen) return
    const next = [...slots, id]
    setSlots(next)
    const builtNext = next.map((tid) => tiles.find((t) => t.id === tid)?.letter ?? '').join('')
    if (builtNext.length === targetLen) {
      if (builtNext === word) {
        setLive(`Correct — ${word} restored.`)
        setSolvedWords((s) => new Set(s).add(word))
        setVisited((s) => new Set(s).add(word))
      } else {
        // No-fail: shake, no penalty, the player removes letters and retries.
        setShake(true)
        setLive('That is not a word — try a different order. No hurry.')
        if (shakeTimer.current) clearTimeout(shakeTimer.current)
        shakeTimer.current = setTimeout(() => setShake(false), 500)
      }
    }
  }, [inSlots, slots, targetLen, tiles, word])

  const removeAt = useCallback((i: number) => {
    setSlots((s) => s.filter((_, idx) => idx !== i))
    setHintReveal(null)
  }, [])

  const clear = useCallback(() => { setSlots([]); setHintReveal(null); setLive('') }, [])

  const next = useCallback(() => {
    setVisited((s) => new Set(s).add(word))
    setPuzzleIdx((i) => (i + 1) % total)
    setLive('')
  }, [word, total])

  const useHint = useCallback(() => {
    if (hintsUsed >= 3) return
    const slot = slots.length
    if (slot >= targetLen) return
    setHintReveal({ slot, letter: word[slot] })
    setHintsUsed((h) => h + 1)
    setLive(`Hint — the next letter is ${word[slot]}.`)
  }, [hintsUsed, slots.length, targetLen, word])

  // ── Completion (single fire when every word visited) ─────────────────────
  const allVisited = visited.size >= total
  useEffect(() => {
    if (!allVisited || fired.current || !onSessionComplete) return
    fired.current = true
    setLive('All the menus are back. The café can open.')
    const result: SessionResult = {
      correctCount: solvedWords.size,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'anagram',
    }
    onSessionComplete(result)
  }, [allVisited, solvedWords.size, total, onSessionComplete])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setPuzzleIdx(0); setSlots([]); setShake(false)
    setHintsUsed(0); setHintReveal(null)
    setVisited(new Set()); setSolvedWords(new Set()); setLive('')
  }, [])

  // ── Keyboard: type a letter to place it; Backspace removes; H hint; Esc clears
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      if (k === 'Backspace') { e.preventDefault(); setSlots((s) => s.slice(0, -1)); return }
      if (k === 'h' || k === 'H') { e.preventDefault(); useHint(); return }
      if (k === 'Escape') { e.preventDefault(); clear(); return }
      if (/^[a-zA-Z]$/.test(k)) {
        const letter = k.toUpperCase()
        const t = tiles.find((t) => !inSlots.has(t.id) && t.letter === letter)
        if (t) { e.preventDefault(); placeTile(t.id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tiles, inSlots, placeTile, useHint, clear])

  useEffect(() => () => { if (shakeTimer.current) clearTimeout(shakeTimer.current) }, [])

  // When a word is won, briefly hold then advance (unless it's the last unseen).
  useEffect(() => {
    if (!won) return
    const id = window.setTimeout(() => {
      if (visited.size < total) next()
    }, 1100)
    return () => window.clearTimeout(id)
  }, [won]) // eslint-disable-line react-hooks/exhaustive-deps

  const solvedCount = solvedWords.size
  const bajlaVariant: 'idle' | 'celebrate' = allVisited || won ? 'celebrate' : 'idle'
  const clue = safeClue(cur.hint, word)

  // ── DOM overlay ───────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CHALK, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>Saffron Market · The Still Cup</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBER_SOFT }}>Mr. Chen&apos;s Chalkboard</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_STR}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: AMBER_SOFT }}>Word {Math.min(visited.size + (won ? 0 : 1), total)}</span>
          <span style={{ opacity: 0.6 }}> / {total}</span>
          <span style={{ marginLeft: 12, color: GREEN }}>{solvedCount}</span>
          <span style={{ opacity: 0.6 }}> restored</span>
        </div>
      </div>

      {/* Spelling slots — positioned over the 3D chalkboard */}
      <div style={{ position: 'absolute', top: '28%', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
        {Array.from({ length: targetLen }).map((_, i) => {
          const tid = slots[i]
          const tile = tid !== undefined ? tiles.find((t) => t.id === tid) ?? null : null
          const revealed = hintReveal && hintReveal.slot === i && !tile
          return (
            <button
              key={i}
              type="button"
              disabled={!tile}
              onClick={() => tile && removeAt(i)}
              aria-label={tile ? `Slot ${i + 1}: ${tile.letter}. Activate to remove.` : `Slot ${i + 1}: empty.`}
              style={{
                width: 46, height: 56, borderRadius: 6,
                background: tile ? 'rgba(243,234,214,0.14)' : 'rgba(0,0,0,0.35)',
                border: `2px ${tile ? 'solid' : 'dashed'} ${won ? GREEN : tile ? CHALK : 'rgba(243,234,214,0.3)'}`,
                color: won ? GREEN : revealed ? AMBER_SOFT : CHALK,
                fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 700,
                cursor: tile ? 'pointer' : 'default', touchAction: 'manipulation',
                transition: reduce ? 'none' : 'all 200ms',
                animation: shake && !reduce ? 'agShake 0.45s ease' : 'none',
              }}
            >{tile ? tile.letter : revealed ? hintReveal!.letter : '·'}</button>
          )
        })}
      </div>

      {/* Built readout */}
      <div style={{ position: 'absolute', top: 'calc(28% + 70px)', left: 0, right: 0, textAlign: 'center', fontSize: 11, letterSpacing: '0.18em', opacity: 0.55 }}>
        {built.length}/{targetLen} · &quot;{built || '…'}&quot;
      </div>

      {/* Scrambled chalk tiles */}
      <div style={{ position: 'absolute', bottom: 116, left: 14, right: 14, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', pointerEvents: 'auto' }}>
        {tiles.map((t) => {
          const used = inSlots.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => placeTile(t.id)}
              disabled={used || slots.length >= targetLen}
              aria-label={`Chalk letter ${t.letter}${used ? ', placed' : ''}`}
              style={{
                width: 50, height: 58, borderRadius: 7,
                background: used ? 'rgba(0,0,0,0.45)' : 'rgba(243,234,214,0.92)',
                color: used ? 'rgba(243,234,214,0.25)' : INK,
                border: used ? `2px dashed ${CHALK}44` : 'none',
                fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 700,
                cursor: used ? 'default' : 'pointer', touchAction: 'manipulation',
                boxShadow: used ? 'none' : '0 6px 14px rgba(0,0,0,0.35)',
                opacity: used ? 0.5 : 1, transition: reduce ? 'none' : 'all 180ms',
              }}
            >{t.letter}</button>
          )
        })}
      </div>

      {/* Clue */}
      <div style={{ position: 'absolute', bottom: 58, left: 14, right: 14, textAlign: 'center', pointerEvents: 'none' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.2em', color: AMBER_SOFT, marginRight: 8 }}>CLUE</span>
        <span style={{ fontStyle: 'italic', fontSize: 14 }}>&ldquo;{clue}&rdquo;</span>
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 10, left: 14, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={useHint} disabled={hintsUsed >= 3} style={btnBase(hintsUsed >= 3)} aria-label={`Hint — ${3 - hintsUsed} left`}>HINT {3 - hintsUsed}</button>
        <button onClick={clear} style={btnBase()} aria-label="Clear the slots">CLEAR</button>
        <button onClick={next} style={btnBase()} aria-label="Skip to the next word">SKIP →</button>
      </div>

      {/* Completion */}
      {allVisited && (
        <div role="dialog" aria-label="Café menus restored" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          background: `radial-gradient(ellipse, ${AMBER_STR}22, rgba(10,5,24,0.8))`, backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT }}>The Still Cup is open.</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>You restored <strong style={{ color: GREEN }}>{solvedCount}</strong> / {total} words.</div>
          <button onClick={reset} style={{ ...btnBase(), background: AMBER_STR, color: '#2A1604', borderColor: AMBER_STR }}>Open again →</button>
        </div>
      )}

      <style>{`@keyframes agShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}`}</style>
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Mr. Chen's Chalkboard — unscramble the chalk letters to spell each café word"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 2.4, 6.6]}
        cameraFov={46}
        overlay={overlay}
      >
        <CafeScene
          solvedCount={solvedCount}
          total={total}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
          justSolved={solvedCount}
        />
      </CityStage>
    </div>
  )
}
