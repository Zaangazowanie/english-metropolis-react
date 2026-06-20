// Matching3D — "Flora's Bouquets", Saffron Market.
//
// A three.js re-skin of the canonical 2D Matching shell
// (src/practice/shells/Matching.tsx). The MECHANIC, pairing rules, no-fail
// wrong-shake, line-at-a-time stages, and the single-fire onSessionComplete
// are inherited from the 2D shell — this file changes only the stagecraft.
// Same puzzle in (MatchingPuzzle), same session result out (SessionResult).
// Built on the Fluent City GameKit (CityStage + Bajla + palette).
//
// Scene: Flora's flower stall at Saffron Market, dusk. Nine bouquets in
// terracotta jars sit on a counter; scattered cream gift-tags carry the
// English flower names. Match every word-tag to the right bouquet before
// Flora's customers arrive. The "lines" (magenta / violet / amber) map to the
// three jar clusters on the counter.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// all readable English lives in the DOM overlay (never a 3D texture);
// quality tiers + reducedMotion honoured; full keyboard + touch (≥44px);
// procedural geometry + vertex/instance colours only (no GLB, no external
// URLs, no new deps); no per-frame allocations; instancing for repeated props.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'
import { generateMatching } from '../generators/generateMatching'
import type { MatchingPuzzle } from '../generators/generateMatching'

// ── Types mirroring the generator ────────────────────────────────────────────
type LineColor = 'magenta' | 'violet' | 'amber'
interface Pair { en: string; pl: string; line: LineColor }

// ── Colour constants ──────────────────────────────────────────────────────────
const LINE_HEX: Record<LineColor, string> = {
  magenta: '#E879F9',
  violet: '#A78BFA',
  amber: '#FBBF24',
}
const AMBER_STR = '#ffb347'
const CREAM = '#f6efe2'
const INK = '#1f0e3a'
const ROSE = '#FB7185'
const GREEN = '#34D399'

// ── Built-in demo puzzle (anonymous / home-page play) ────────────────────────
const DEMO_PAIRS: Array<{ word: string; word_pl: string }> = [
  { word: 'sunflower', word_pl: 'słonecznik' },
  { word: 'rose',      word_pl: 'róża'       },
  { word: 'daisy',     word_pl: 'stokrotka'  },
  { word: 'lavender',  word_pl: 'lawenda'    },
  { word: 'tulip',     word_pl: 'tulipan'    },
  { word: 'violet',    word_pl: 'fiołek'     },
  { word: 'lily',      word_pl: 'lilia'      },
  { word: 'iris',      word_pl: 'irys'       },
  { word: 'poppy',     word_pl: 'mak'        },
]
const DEMO_PUZZLE: MatchingPuzzle = generateMatching(DEMO_PAIRS, { pairsPerLine: 3, seed: 0xf10a })

// Bouquet colour by line — each cluster gets a distinct hue family.
const JAR_COLORS: Record<LineColor, string[]> = {
  magenta: ['#E879F9', '#d946ef', '#c026d3'],
  violet:  ['#A78BFA', '#7c3aed', '#6d28d9'],
  amber:   ['#FBBF24', '#E8920A', '#d97706'],
}
const LINES: LineColor[] = ['magenta', 'violet', 'amber']

// Allocation-free scratch objects (module-scope).
const _obj = new Object3D()
const _col = new Color()

// ── 3D Scene ──────────────────────────────────────────────────────────────────
function StallScene({
  activeLine,
  matches,
  selected,
  wrongEn,
  reducedMotion,
  bajlaVariant,
  allPairs,
}: {
  activeLine: LineColor
  matches: Record<string, string>
  selected: string | null
  wrongEn: string | null
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
  allPairs: Pair[]
}) {
  const { tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion

  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {highFx && <fog attach="fog" args={[palette.duskHorizon, 10, 28]} />}
      <Counter />
      <Jars allPairs={allPairs} activeLine={activeLine} matches={matches} selected={selected} wrongEn={wrongEn} reducedMotion={reducedMotion} />
      <Lanterns highFx={highFx} reducedMotion={reducedMotion} />
      <Background highFx={highFx} />
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.42} position={[2.6, 1.1, 0.2]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    // Gentle breathing drift; camera locked under reducedMotion.
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.55) * 0.04
    cam.position.set(0, 3.2 + bob, 7.8)
    cam.lookAt(0, 1.2, 0)
  })
  return null
}

function Counter() {
  return (
    <group>
      {/* Counter top */}
      <mesh position={[0, 0.9, 0]} receiveShadow>
        <boxGeometry args={[7.2, 0.14, 2.2]} />
        <meshStandardMaterial color="#7a5c3a" roughness={0.9} />
      </mesh>
      {/* Counter body */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[7.2, 0.62, 2.0]} />
        <meshStandardMaterial color="#5c4226" roughness={1} />
      </mesh>
    </group>
  )
}

function Jars({
  allPairs,
  activeLine,
  matches,
  selected,
  wrongEn,
  reducedMotion,
}: {
  allPairs: Pair[]
  activeLine: LineColor
  matches: Record<string, string>
  selected: string | null
  wrongEn: string | null
  reducedMotion: boolean
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const bloomRef = useRef<InstancedMesh>(null)
  const t = useRef(0)

  const positions = useMemo(() => {
    // Lay the 9 jars in 3 clusters of 3 across the counter.
    const out: { x: number; line: LineColor; en: string }[] = []
    let gi = 0
    for (const line of LINES) {
      const ps = allPairs.filter((p) => p.line === line)
      ps.forEach((p, li) => {
        const gx = (gi - 4) * 0.8 + (li - 1) * 0.72
        out.push({ x: gx, line, en: p.en })
        gi++
      })
    }
    return out
  }, [allPairs])

  useFrame((state, dt) => {
    t.current += dt
    const mesh = meshRef.current
    const bloom = bloomRef.current
    if (!mesh || !bloom) return
    positions.forEach((pos, i) => {
      const isMatched = !!matches[pos.en]
      const isSel = selected === pos.en
      const isWrong = wrongEn === pos.en
      const isActive = pos.line === activeLine
      // Jar body
      const sc = isSel && !reducedMotion ? 1 + Math.sin(t.current * 6) * 0.03 : isWrong && !reducedMotion ? 1 + Math.sin(t.current * 18) * 0.02 : 1
      _obj.position.set(pos.x, 1.15, -0.1)
      _obj.scale.set(sc, sc, sc)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      const colStr = isMatched ? GREEN : isWrong ? ROSE : isSel ? '#fff' : isActive ? JAR_COLORS[pos.line][0] : '#4a5568'
      _col.set(colStr)
      mesh.setColorAt(i, _col)
      // Glow bloom disc under matched jars (high tier)
      _obj.position.set(pos.x, 0.97, -0.1)
      _obj.scale.set(isMatched ? 0.9 : 0.001, 1, 0.9)
      _obj.rotation.set(-Math.PI / 2, 0, 0)
      _obj.updateMatrix()
      bloom.setMatrixAt(i, _obj.matrix)
      _col.set(isMatched ? '#34D399' : '#000')
      bloom.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    bloom.instanceMatrix.needsUpdate = true
    bloom.instanceColor!.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, positions.length]} castShadow>
        <cylinderGeometry args={[0.3, 0.25, 0.55, 12]} />
        <meshStandardMaterial vertexColors roughness={0.6} metalness={0.1} />
      </instancedMesh>
      {/* Bloom glow discs under matched jars */}
      <instancedMesh ref={bloomRef} args={[undefined, undefined, positions.length]} frustumCulled={false}>
        <circleGeometry args={[0.5, 12]} />
        <meshStandardMaterial vertexColors emissive="#34D399" emissiveIntensity={0.6} transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
      {/* Bouquet tufts — one sphere per jar */}
      {positions.map((pos, i) => {
        const isActive = pos.line === activeLine
        const isMatched = !!matches[pos.en]
        return (
          <mesh key={i} position={[pos.x, 1.62, -0.1]}>
            <sphereGeometry args={[0.28, 10, 8]} />
            <meshStandardMaterial
              color={isMatched ? GREEN : isActive ? JAR_COLORS[pos.line][1] : '#2d3748'}
              roughness={0.85}
              flatShading
            />
          </mesh>
        )
      })}
    </group>
  )
}

function Lanterns({ highFx, reducedMotion }: { highFx: boolean; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const N = 7
  const positions = useMemo(() => {
    return Array.from({ length: N }, (_, i) => ({
      x: -3 + i * 1.0,
      y: 2.85 + Math.sin(i * 0.7) * 0.12,
    }))
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    positions.forEach((p, i) => {
      _obj.position.set(p.x, p.y, -0.2)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1.2, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || !highFx || reducedMotion) return
    const mat = mesh.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.75 + Math.sin(state.clock.elapsedTime * 5.5) * 0.15
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[0.13, 10, 8]} />
      <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.8} roughness={0.5} />
    </instancedMesh>
  )
}

function Background({ highFx }: { highFx: boolean }) {
  return (
    <group>
      {/* Far-back Hush-grey wall */}
      <mesh position={[0, 2.2, -4]} receiveShadow>
        <boxGeometry args={[14, 5.5, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* Cobblestone floor */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial color="#3d6470" roughness={0.95} />
      </mesh>
      {/* Warm lantern point on high */}
      {highFx && (
        <pointLight position={[0, 3.2, 0.5]} color={palette.lanternAmber} intensity={0.9} distance={12} decay={2} />
      )}
    </group>
  )
}

// ── DOM overlay helpers ───────────────────────────────────────────────────────
function btnBase(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: `rgba(255,179,71,0.16)`, border: `1px solid ${AMBER_STR}66`,
    color: AMBER_STR, fontFamily: 'ui-monospace,monospace', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

// ── Main component ────────────────────────────────────────────────────────────
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

export default function Matching3D({
  puzzle,
  vocab,
  onSessionComplete,
  quality,
  reducedMotion,
  fullscreen,
}: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle ────────────────────────────────────────────────────────
  const activePuzzle = useMemo<MatchingPuzzle>(() => {
    const p = puzzle as MatchingPuzzle | undefined
    if (p && Array.isArray(p.pairs) && p.pairs.length >= 3) return p
    if (vocab && vocab.length >= 3) {
      const gen = generateMatching(
        vocab.map((v) => ({ word: v.word, word_pl: v.word_pl ?? '' })),
        { pairsPerLine: 3, seed: 0x5a11 },
      )
      if (gen.pairs.length >= 3) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])

  const allPairs: Pair[] = activePuzzle.pairs as Pair[]

  // ── Line-at-a-time stages (mirrors the 2D shell) ──────────────────────────
  const linesInOrder = useMemo<LineColor[]>(() => {
    const seen = new Set<LineColor>()
    const out: LineColor[] = []
    for (const p of allPairs) {
      if (!seen.has(p.line)) { seen.add(p.line); out.push(p.line) }
    }
    return out
  }, [allPairs])
  const [stageIdx, setStageIdx] = useState(0)
  const activeLine = linesInOrder[stageIdx] ?? linesInOrder[0]
  const stagePairs = useMemo(() => allPairs.filter((p) => p.line === activeLine), [allPairs, activeLine])
  const totalStages = linesInOrder.length

  // ── Interaction state ─────────────────────────────────────────────────────
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<{ side: 'en' | 'pl'; value: string } | null>(null)
  const [wrongEn, setWrongEn] = useState<string | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintPair, setHintPair] = useState<Pair | null>(null)
  const [live, setLive] = useState('')
  const fired = useRef(false)
  const startMs = useRef(performance.now())
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stageMatched = Object.keys(matches).length === stagePairs.length && stagePairs.length > 0
  const allDone = stageIdx + 1 >= totalStages && stageMatched
  const correctCount = allPairs.filter((p) => !!matches[p.en]).length
  const bajlaVariant: 'idle' | 'celebrate' = allDone ? 'celebrate' : 'idle'

  // Shuffled PL list per stage — stable for the stage.
  const shuffledPl = useMemo(() => {
    const seed = activeLine.length * 7 + stageIdx * 13 + 3
    return [...stagePairs].map((p) => p.pl).sort((a, b) => ((a.charCodeAt(0) * seed) % 97) - ((b.charCodeAt(0) * seed) % 97))
  }, [stagePairs, activeLine, stageIdx])

  // ── Pair selection (no-fail) ──────────────────────────────────────────────
  const pick = useCallback((side: 'en' | 'pl', value: string) => {
    // Already matched — ignore.
    const alreadyMatched = side === 'en' ? !!matches[value] : Object.values(matches).includes(value)
    if (alreadyMatched) return
    if (!selected) { setSelected({ side, value }); return }
    if (selected.side === side) { setSelected({ side, value }); return }
    const en = side === 'en' ? value : selected.value
    const pl = side === 'pl' ? value : selected.value
    const correct = stagePairs.find((p) => p.en === en)?.pl === pl
    if (correct) {
      setMatches((m) => ({ ...m, [en]: pl }))
      setSelected(null)
      setLive(`Correct — ${en} matched.`)
    } else {
      // No-fail: shake briefly, re-ask gently.
      setWrongEn(en)
      setSelected(null)
      setLive(`Not quite — look at the colour on the jar. Try again.`)
      if (wrongTimer.current) clearTimeout(wrongTimer.current)
      wrongTimer.current = setTimeout(() => setWrongEn(null), 700)
    }
  }, [matches, selected, stagePairs])

  // ── Hint ──────────────────────────────────────────────────────────────────
  const HINT_MAX = 3
  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX) return
    const next = stagePairs.find((p) => !matches[p.en])
    if (!next) return
    setHintPair(next)
    setHintsUsed((h) => h + 1)
    setLive(`Hint: ${next.en} goes with ${next.pl}`)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintPair(null), 1600)
  }, [hintsUsed, stagePairs, matches])

  // ── Auto-advance stages ───────────────────────────────────────────────────
  useEffect(() => {
    if (!stageMatched) return
    if (stageIdx + 1 >= totalStages) return // final stage — wait for session fire
    if (advTimer.current) clearTimeout(advTimer.current)
    advTimer.current = setTimeout(() => {
      setStageIdx((i) => i + 1)
      setMatches({})
      setSelected(null)
      setWrongEn(null)
      setHintPair(null)
      setLive('Line complete — next line loading.')
    }, 1000)
    return () => { if (advTimer.current) clearTimeout(advTimer.current) }
  }, [stageMatched, stageIdx, totalStages])

  // ── Session complete (single fire) ────────────────────────────────────────
  useEffect(() => {
    if (!allDone) return
    if (fired.current) return
    fired.current = true
    setLive('All bouquets matched. The stall is ready.')
    const result: SessionResult = {
      correctCount,
      totalQuestions: allPairs.length,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'matching',
    }
    onSessionComplete?.(result)
  }, [allDone, correctCount, allPairs.length, onSessionComplete])

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setStageIdx(0); setMatches({}); setSelected(null)
    setWrongEn(null); setHintPair(null); setHintsUsed(0); setLive('')
  }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); useHint(); }
      if (e.key === 'Escape') { e.preventDefault(); setSelected(null); }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [useHint])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (wrongTimer.current) clearTimeout(wrongTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    if (advTimer.current) clearTimeout(advTimer.current)
  }, [])

  // ── DOM overlay ───────────────────────────────────────────────────────────
  const lineColor = LINE_HEX[activeLine]

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      {/* Screen-reader live region */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header: district + progress */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>Saffron Market</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: lineColor }}>Flora&apos;s Bouquets</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${lineColor}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: lineColor }}>Line {stageIdx + 1}</span>
          <span style={{ opacity: 0.6 }}> / {totalStages}</span>
          <span style={{ marginLeft: 12, color: GREEN }}>{Object.keys(matches).length}</span>
          <span style={{ opacity: 0.6 }}>/{stagePairs.length}</span>
        </div>
      </div>

      {/* Hint flash */}
      {hintPair && (
        <div role="status" aria-live="polite" style={{
          position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(14,10,26,0.9)', border: `1px solid ${lineColor}88`, borderRadius: 10,
          padding: '8px 18px', fontSize: 14, pointerEvents: 'none',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 9, letterSpacing: '0.18em', color: lineColor }}>HINT</span>
          <strong>{hintPair.en}</strong>
          <span style={{ opacity: 0.6 }}>↔</span>
          <strong style={{ fontStyle: 'italic' }}>{hintPair.pl}</strong>
        </div>
      )}

      {/* EN word-tags (the exercise — crisp DOM, legible) */}
      <div style={{
        position: 'absolute', bottom: 110, left: 14, right: 14,
        display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
        pointerEvents: 'auto',
      }}>
        {stagePairs.map((pair) => {
          const isMatched = !!matches[pair.en]
          const isSel = selected?.side === 'en' && selected.value === pair.en
          const isWrong = wrongEn === pair.en
          return (
            <button
              key={pair.en}
              type="button"
              onClick={() => !isMatched && pick('en', pair.en)}
              disabled={isMatched}
              aria-pressed={isSel}
              aria-label={`English word ${pair.en}${isMatched ? ', matched' : isSel ? ', selected' : ''}`}
              style={{
                minHeight: 44, padding: '8px 14px', borderRadius: 8,
                background: isMatched ? `${lineColor}33` : isSel ? lineColor : 'rgba(14,10,26,0.88)',
                border: `2px solid ${isWrong ? ROSE : isSel ? lineColor : `${lineColor}55`}`,
                color: isMatched ? lineColor : isSel ? INK : CREAM,
                fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
                cursor: isMatched ? 'default' : 'pointer', touchAction: 'manipulation',
                transition: reduce ? 'none' : 'all 180ms',
                animation: isWrong && !reduce ? 'mxShake 0.35s ease' : 'none',
                textDecoration: isMatched ? 'line-through' : 'none', opacity: isMatched ? 0.7 : 1,
              }}
            >{pair.en}</button>
          )
        })}
      </div>

      {/* PL translation chips */}
      <div style={{
        position: 'absolute', bottom: 60, left: 14, right: 14,
        display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
        pointerEvents: 'auto',
      }}>
        {shuffledPl.map((pl) => {
          const isMatched = Object.values(matches).includes(pl)
          const isSel = selected?.side === 'pl' && selected.value === pl
          const isWrong = wrongEn != null && stagePairs.find((p) => p.en === wrongEn)?.pl === pl
          return (
            <button
              key={pl}
              type="button"
              onClick={() => !isMatched && pick('pl', pl)}
              disabled={isMatched}
              aria-pressed={isSel}
              aria-label={`Polish ${pl}${isMatched ? ', matched' : isSel ? ', selected' : ''}`}
              style={{
                minHeight: 44, padding: '8px 14px', borderRadius: 8,
                background: isMatched ? `${lineColor}33` : isSel ? lineColor : 'rgba(14,10,26,0.72)',
                border: `1px solid ${isWrong ? ROSE : isSel ? lineColor : `${lineColor}44`}`,
                color: isMatched ? lineColor : isSel ? INK : CREAM,
                fontSize: 12, fontStyle: 'italic',
                cursor: isMatched ? 'default' : 'pointer', touchAction: 'manipulation',
                transition: reduce ? 'none' : 'all 180ms',
                animation: isWrong && !reduce ? 'mxShake 0.35s ease' : 'none',
                opacity: isMatched ? 0.7 : 1,
              }}
            >{pl}</button>
          )
        })}
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 10, left: 14, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX} style={btnBase(hintsUsed >= HINT_MAX)} aria-label={`Hint — ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
        <button onClick={reset} style={btnBase()} aria-label="Reset">↻ RESET</button>
      </div>

      {/* Completion card */}
      {allDone && (
        <div role="dialog" aria-label="Flora's Bouquets complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          background: `radial-gradient(ellipse, ${lineColor}22, rgba(10,5,24,0.78))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_STR }}>All bouquets matched.</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>The stall is ready. <strong style={{ color: GREEN }}>{correctCount}</strong> / {allPairs.length} pairs</div>
          <button onClick={reset} style={{ ...btnBase(), background: AMBER_STR, color: '#2A1604', borderColor: AMBER_STR }}>Run again →</button>
        </div>
      )}

      <style>{`@keyframes mxShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}`}</style>
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Flora's Bouquets — match the English flower names to the right bouquet"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 3.2, 7.8]}
        cameraFov={44}
        overlay={overlay}
      >
        <StallScene
          activeLine={activeLine}
          matches={matches}
          selected={selected?.side === 'en' ? selected.value : null}
          wrongEn={wrongEn}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
          allPairs={allPairs}
        />
      </CityStage>
    </div>
  )
}
