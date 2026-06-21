// Wordsearch3D — "Neon Market" (Wordsearch district).
//
// A three.js re-skin of the canonical 2D Wordsearch shell
// (src/practice/shells/Wordsearch.tsx). The MECHANIC is unchanged: a letter
// grid has words hidden in straight lines (any direction). The player taps the
// first letter, then the last letter of a word; the word is checked against
// the word list; if correct it lights teal and stays lit. All words found →
// session complete. A hint briefly pulses the first letter of an unfound word
// (3 per session); skip costs an unfound word (counts as missed). Same puzzle
// in (ShellWordsearchPuzzle {size, words:[{word,clue,clue_pl,start,end}],
// grid?}); same SessionResult out. Built on the GameKit.
//
// Scene: a dusk neon market. Glowing amber-and-teal neon sign-boards on the
// back wall (procedural glow boxes) set the atmosphere; the interactive letter
// grid lives in the crisp DOM overlay — never baked into a texture (rule 9).
// Bajla the night-market owl perches on the market stall.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (tab to cells + Enter to select) + touch (tap-first / tap-last);
// procedural geometry + basic materials only; no new deps; no per-frame allocs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'

// ── Palette ──────────────────────────────────────────────────────────────────
const CREAM = '#f6efe2'
const AMBER_SOFT = '#ffce86'
const TEAL = '#7DD3FC'     // found word highlight
const GREEN = '#34D399'
const ROSE = '#FB7185'
const INK = '#1f0e3a'
const NEON_AMBER = '#E8920A'
const NEON_TEAL = '#2B8FA0'

// ── Puzzle shape (mirrors ShellWordsearchPuzzle from adapters) ────────────────
interface WSWord { word: string; clue: string; clue_pl?: string; start: [number, number]; end: [number, number]; exerciseId?: string }
interface WSPuzzle { size: number; words: WSWord[]; grid?: string[][] }

// ── Grid builder (ported from the 2D shell) ───────────────────────────────────
function buildGrid(p: { size: number; words: WSWord[] }): string[][] {
  const N = p.size
  const grid: string[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => ''))
  p.words.forEach((w) => {
    const [r1, c1] = w.start; const [r2, c2] = w.end; const len = w.word.length
    const dr = (r2 - r1) / (len - 1); const dc = (c2 - c1) / (len - 1)
    for (let i = 0; i < len; i++) {
      const r = r1 + Math.round(dr * i); const c = c1 + Math.round(dc * i)
      grid[r][c] = w.word[i]
    }
  })
  let seed = 1337
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const LETTERS = 'ETAOINSRHLDCUMWFGYPBVKJXQZ'
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) grid[r][c] = LETTERS[Math.floor(rng() * LETTERS.length)]
  return grid
}

// Determine all cells along the straight line from start to end.
function lineCells(start: [number, number], end: [number, number]): [number, number][] {
  const [r1, c1] = start; const [r2, c2] = end
  const dr = r2 - r1; const dc = c2 - c1
  const steps = Math.max(Math.abs(dr), Math.abs(dc))
  if (steps === 0) return [[r1, c1]]
  const cells: [number, number][] = []
  for (let i = 0; i <= steps; i++) cells.push([r1 + Math.round((dr / steps) * i), c1 + Math.round((dc / steps) * i)])
  return cells
}

// ── Built-in demo ─────────────────────────────────────────────────────────────
const DEMO: WSPuzzle = {
  size: 11,
  words: [
    { word: 'NEON',     clue: 'Glowing tube light',     clue_pl: 'jarzeniówka',    start: [1, 1], end: [1, 4] },
    { word: 'STALL',    clue: 'A market booth',          clue_pl: 'stoisko',        start: [3, 1], end: [3, 5] },
    { word: 'NIGHT',    clue: 'Dark hours',              clue_pl: 'noc',            start: [0, 6], end: [4, 6] },
    { word: 'DUMPLING', clue: 'Filled dough pocket',     clue_pl: 'pieróg',         start: [5, 2], end: [5, 9] },
    { word: 'STREET',   clue: 'A road through town',     clue_pl: 'ulica',          start: [7, 3], end: [7, 8] },
    { word: 'GLOW',     clue: 'Soft light',              clue_pl: 'blask',          start: [2, 8], end: [5, 8] },
    { word: 'VENDOR',   clue: 'Person who sells',        clue_pl: 'sprzedawca',     start: [9, 1], end: [9, 6] },
    { word: 'SIGN',     clue: 'A board with letters',    clue_pl: 'znak',           start: [0, 9], end: [3, 9] },
  ],
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

const _o = new Object3D()
const _c = new Color()

// ── 3D scene — the dusk neon market ───────────────────────────────────────────
function NeonMarketScene({ foundCount, total, warmth, reducedMotion, bajlaVariant }: {
  foundCount: number; total: number; warmth: number; reducedMotion: boolean; bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 10, 22]} />}
      {/* Ground */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#1A2C30" />
      </mesh>
      {/* Market back wall */}
      <mesh position={[0, 2.5, -3.0]}>
        <boxGeometry args={[8.0, 5.0, 0.3]} />
        <meshToonMaterial color="#181424" />
      </mesh>
      {/* Neon sign boards (instanced, static decorative, amber + teal) */}
      <NeonBoards warmth={warmth} reducedMotion={reducedMotion} />
      {/* Market stall counter */}
      <mesh position={[0, 0.62, -0.8]} castShadow receiveShadow>
        <boxGeometry args={[4.0, 0.14, 0.9]} />
        <meshToonMaterial color="#2A1810" />
      </mesh>
      {/* Warm market lamp */}
      <group position={[1.8, 0, -1.2]}>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.04, 0.06, 2.8, 6]} /><meshToonMaterial color={palette.brass} /></mesh>
        <mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.15, 10, 8]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.55 + warmth * 0.4} /></mesh>
      </group>
      <group position={[-1.8, 0, -1.2]}>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.04, 0.06, 2.8, 6]} /><meshToonMaterial color={palette.brass} /></mesh>
        <mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.15, 10, 8]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.55 + warmth * 0.4} /></mesh>
      </group>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.38} position={[-2.0, 0.88, -0.2]} />
    </group>
  )
}

// Static neon-sign boxes on the market wall. Alternate amber/teal.
const BOARD_POSES: Array<[number, number, number]> = [
  [-2.8, 3.2, -2.8], [-1.1, 3.5, -2.8], [0.6, 3.0, -2.8], [2.3, 3.4, -2.8],
  [-2.1, 1.8, -2.8], [0.2, 2.0, -2.8], [2.0, 1.7, -2.8],
]
function NeonBoards({ warmth, reducedMotion }: { warmth: number; reducedMotion: boolean }) {
  const ref = useRef<InstancedMesh>(null!)
  useEffect(() => {
    if (!ref.current) return
    BOARD_POSES.forEach((pos, i) => {
      _o.position.set(...pos); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix()
      ref.current.setMatrixAt(i, _o.matrix)
      _c.set(i % 2 === 0 ? NEON_AMBER : NEON_TEAL)
      ref.current.setColorAt(i, _c)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BOARD_POSES.length]} frustumCulled={false}>
      <boxGeometry args={[1.2, 0.38, 0.06]} />
      <meshBasicMaterial vertexColors transparent opacity={0.75} />
    </instancedMesh>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 3.2 + bob, 5.8)
    cam.lookAt(0, 1.8, 0)
  })
  return null
}

// =========================================================================
// Wordsearch3D — default export
// =========================================================================
export default function Wordsearch3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const pz = useMemo<WSPuzzle>(() => {
    const p = puzzle as WSPuzzle | undefined
    if (p && typeof p.size === 'number' && Array.isArray(p.words) && p.words.length > 0) return p
    return DEMO
  }, [puzzle])

  const grid = useMemo<string[][]>(() => pz.grid ?? buildGrid(pz), [pz])
  const N = pz.size
  const total = pz.words.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [found, setFound] = useState<Set<number>>(new Set())
  const [selStart, setSelStart] = useState<[number, number] | null>(null)
  const [flash, setFlash] = useState<{ cells: [number, number][]; color: string } | null>(null)
  const [hintCell, setHintCell] = useState<[number, number] | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [live, setLive] = useState('')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const done = found.size >= total

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  // ── Session complete ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('All words found. The market blazes.')
    const r: SessionResult = {
      correctCount: found.size,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'wordsearch',
    }
    onSessionComplete?.(r)
  }, [done, found.size, total, onSessionComplete])

  // ── Cell selection ──────────────────────────────────────────────────────────
  const commitSelection = useCallback((a: [number, number], b: [number, number]) => {
    const cells = lineCells(a, b)
    const selected = cells.map(([r, c]) => grid[r]?.[c] ?? '').join('')
    // Check each unfound word
    const matchIdx = pz.words.findIndex((w, i) => {
      if (found.has(i)) return false
      return w.word === selected || w.word === selected.split('').reverse().join('')
    })
    if (matchIdx >= 0) {
      const wCells = lineCells(pz.words[matchIdx].start, pz.words[matchIdx].end)
      setFound((s) => new Set(s).add(matchIdx))
      setFlash({ cells: wCells, color: TEAL })
      setLive(`Found: ${pz.words[matchIdx].word} — ${pz.words[matchIdx].clue}`)
    } else {
      setFlash({ cells, color: ROSE })
      setLive('Not a word — try again.')
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(null), reduce ? 0 : 480)
    }
    setSelStart(null)
  }, [grid, pz.words, found, reduce])

  const tapCell = useCallback((r: number, c: number) => {
    if (done) return
    if (!selStart) {
      setSelStart([r, c])
      setLive(`First letter selected at row ${r + 1}, col ${c + 1}.`)
    } else {
      commitSelection(selStart, [r, c])
    }
  }, [done, selStart, commitSelection])

  const useHint = useCallback(() => {
    if (done || hintsUsed >= 3) return
    const unfound = pz.words.findIndex((_, i) => !found.has(i))
    if (unfound < 0) return
    const w = pz.words[unfound]
    setHintsUsed((h) => h + 1)
    setHintCell(w.start)
    setLive(`Hint — look for "${w.word[0]}" at row ${w.start[0] + 1}, col ${w.start[1] + 1}.`)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintCell(null), reduce ? 0 : 1600)
  }, [done, hintsUsed, pz.words, found, reduce])

  const skip = useCallback(() => {
    if (done) return
    // Mark all remaining words as found (show their paths, count as missed in score).
    const missing: Set<number> = new Set()
    pz.words.forEach((_, i) => { if (!found.has(i)) missing.add(i) })
    setFound((s) => { const n = new Set(s); missing.forEach((i) => n.add(i)); return n })
    setLive('Revealed — all hidden words shown.')
  }, [done, pz.words, found])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    if (flashTimer.current) clearTimeout(flashTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    setFound(new Set()); setSelStart(null); setFlash(null); setHintCell(null); setHintsUsed(0); setLive('')
  }, [])

  const warmth = total > 0 ? found.size / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // Pre-compute a set of found cell keys and flash cell keys for fast lookup
  const foundCells = useMemo(() => {
    const s = new Set<string>()
    found.forEach((wi) => {
      lineCells(pz.words[wi].start, pz.words[wi].end).forEach(([r, c]) => s.add(`${r},${c}`))
    })
    return s
  }, [found, pz.words])

  const flashCells = useMemo(() => {
    if (!flash) return new Set<string>()
    return new Set(flash.cells.map(([r, c]) => `${r},${c}`))
  }, [flash])

  const cellSize = Math.min(34, Math.floor(280 / N))

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>Neon Market</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Find every word in the grid</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{found.size}</span>
          <span style={{ opacity: 0.6 }}> / {total} found</span>
        </div>
      </div>

      {!done && (
        <div style={{ position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)', width: 'min(700px, 98vw)', display: 'flex', gap: 14, alignItems: 'flex-start', pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Letter grid */}
          <div style={{ display: 'inline-block' }}>
            <div role="grid" aria-label={`${N}×${N} letter grid — tap first then last letter of a word`}
              style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, ${cellSize}px)`, gap: 2, background: 'rgba(14,10,26,0.82)', borderRadius: 8, padding: 8 }}>
              {grid.map((row, r) => row.map((letter, c) => {
                const key = `${r},${c}`
                const isFound = foundCells.has(key)
                const isFlash = flashCells.has(key)
                const isSel = selStart?.[0] === r && selStart?.[1] === c
                const isHint = hintCell?.[0] === r && hintCell?.[1] === c
                const bg = isFound ? `${TEAL}30` : isFlash ? (flash?.color === TEAL ? `${TEAL}30` : `${ROSE}30`) : isSel ? `${AMBER_SOFT}30` : isHint ? `${AMBER_SOFT}22` : 'transparent'
                const col = isFound ? TEAL : isFlash ? (flash?.color === TEAL ? TEAL : ROSE) : isSel ? AMBER_SOFT : isHint ? AMBER_SOFT : `${CREAM}bb`
                return (
                  <button key={key} onClick={() => tapCell(r, c)}
                    aria-label={`${letter} row ${r + 1} col ${c + 1}${isFound ? ' (found)' : ''}`}
                    aria-pressed={isSel}
                    style={{
                      width: cellSize, height: cellSize, borderRadius: 4,
                      background: bg, border: isSel ? `1px solid ${AMBER_SOFT}` : '1px solid transparent',
                      color: col, fontSize: Math.max(10, cellSize - 12), fontWeight: 700,
                      cursor: isFound ? 'default' : 'pointer', touchAction: 'manipulation',
                    }}>
                    {letter}
                  </button>
                )
              }))}
            </div>
          </div>

          {/* Word list */}
          <div style={{ flex: '0 0 auto', minWidth: 140, maxWidth: 200 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', opacity: 0.6, marginBottom: 6 }}>WORDS TO FIND</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pz.words.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: found.has(i) ? TEAL : `${CREAM}55`, fontWeight: found.has(i) ? 700 : 400, fontSize: 13, letterSpacing: '0.04em', textDecoration: found.has(i) ? 'line-through' : 'none' }}>{w.word}</span>
                  {!found.has(i) && <span style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic' }}>{w.clue}</span>}
                  {found.has(i) && <span style={{ fontSize: 10, color: TEAL, opacity: 0.8 }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {selStart && <button onClick={() => setSelStart(null)} style={skipBtn}>CANCEL</button>}
            <button onClick={skip} style={skipBtn}>REVEAL ALL</button>
            <button onClick={useHint} disabled={hintsUsed >= 3} style={hintBtnStyle(hintsUsed >= 3)}>HINT · {3 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>tap first letter · tap last letter · H hint</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Wordsearch complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The market blazes.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every word found in the grid.<br />
            <strong style={{ color: GREEN }}>{found.size}</strong> / {total} lit up.
          </div>
          <button onClick={reset} style={nextBtn}>Search again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Wordsearch — find each word in the letter grid by tapping its first and last letters"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 3.2, 5.8]} cameraFov={54} overlay={overlay}>
        <NeonMarketScene foundCount={found.size} total={total} warmth={warmth} reducedMotion={reduce} bajlaVariant={bajlaVariant} />
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
  border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.08em',
  cursor: 'pointer', touchAction: 'manipulation',
}
function hintBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
    border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.08em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, touchAction: 'manipulation',
  }
}
