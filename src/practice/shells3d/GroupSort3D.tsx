// GroupSort3D — "The Post Office" district.
//
// A three.js re-skin of the canonical 2D GroupSort shell
// (src/practice/shells/GroupSort.tsx). The MECHANIC is unchanged: a deck of
// word "envelopes" must be sorted into the correct category "sorting window"
// (route). A correct drop latches (the window fills, like an ink-stamp); a
// wrong drop is returned to sender — it bounces back to the tray so the player
// retries (no-fail). A hint flashes one envelope's correct window (3 per
// session). Same puzzle in (GroupSortPuzzle {title, groups[{id,name,color}],
// items[{word,group}]}); same SessionResult out. Built on the GameKit.
//
// Scene: a dusk post office. Wood-framed sorting windows along the back wall —
// one per category, each lit in its route colour and filling as mail is sorted
// correctly — a counter, a pendant lamp, and postmaster Bajla. The readable
// English (route names + the word on each envelope) lives in the crisp DOM
// overlay, never baked into a 3D texture (contract rule 9).
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (1–9 pick envelope · Q/W/E/R drop in window · H hint · S stamp the
// rest) + touch (≥44px); procedural geometry + basic materials only (no GLB,
// no external URLs, no new deps); no per-frame allocations.

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
const WOOD = '#6E5236'
const WOOD_DARK = '#3A2A1E'

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
interface GSGroup { id: string; name: string; color: string }
interface GSItem { word: string; group: string }
interface GSPuzzle { title?: string; groups: GSGroup[]; items: GSItem[] }

// ── Built-in demo — original city mail-sort for anonymous play ────────────────
const DEMO: GSPuzzle = {
  title: 'Sort the mail by route · Posortuj pocztę',
  groups: [
    { id: 'place', name: 'PLACES · miejsca', color: '#7DD3FC' },
    { id: 'action', name: 'ACTIONS · czynności', color: '#34D399' },
    { id: 'describe', name: 'DESCRIBERS · opisy', color: '#FBBF24' },
  ],
  items: [
    { word: 'bridge', group: 'place' },
    { word: 'station', group: 'place' },
    { word: 'harbour', group: 'place' },
    { word: 'cross', group: 'action' },
    { word: 'deliver', group: 'action' },
    { word: 'arrive', group: 'action' },
    { word: 'foggy', group: 'describe' },
    { word: 'narrow', group: 'describe' },
    { word: 'golden', group: 'describe' },
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

const BIN_KEYS = ['q', 'w', 'e', 'r']

// ── 3D scene — the dusk post office ───────────────────────────────────────────
interface BinView { color: string; fill: number; flash: 'wrong' | 'hint' | null }
const _col = new Color()

function PostOfficeScene({
  bins, warmth, reducedMotion, bajlaVariant,
}: {
  bins: BinView[]
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  const k = bins.length
  const span = Math.max(2, k) * 1.9
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 12, 30]} />}
      {/* Ground */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Back wall (wood panel) */}
      <mesh position={[0, 2.0, -1.4]} receiveShadow>
        <boxGeometry args={[span + 1.4, 4.0, 0.2]} />
        <meshToonMaterial color={WOOD} />
      </mesh>
      {/* Counter */}
      <mesh position={[0, 0.7, 0.9]} castShadow receiveShadow>
        <boxGeometry args={[span + 1.0, 0.5, 0.7]} />
        <meshToonMaterial color={WOOD_DARK} />
      </mesh>
      {/* Sorting windows (one per category) */}
      {bins.map((b, i) => (
        <Window key={i} x={(i - (k - 1) / 2) * 1.9} view={b} reducedMotion={reducedMotion} />
      ))}
      {/* Pendant lamp over the counter */}
      <mesh position={[0, 3.4, 0.4]}>
        <cylinderGeometry args={[0.03, 0.03, 0.7, 5]} />
        <meshToonMaterial color={WOOD_DARK} />
      </mesh>
      <mesh position={[0, 3.0, 0.4]}>
        <coneGeometry args={[0.34, 0.4, 12, 1, true]} />
        <meshToonMaterial color={palette.brass} />
      </mesh>
      <mesh position={[0, 2.86, 0.4]}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshBasicMaterial color={palette.lanternCore} transparent opacity={0.6 + warmth * 0.4} />
      </mesh>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.42} position={[-(span / 2 + 0.4), 1.2, 0.9]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.04
    cam.position.set(0, 2.6 + bob, 7.2)
    cam.lookAt(0, 1.7, 0)
  })
  return null
}

// A wood-framed sorting window. The inner panel glows in its route colour and
// brightens as mail is sorted into it; flashes rose on a wrong drop, white on a
// hint. No per-frame allocations (module-scope _col).
function Window({ x, view, reducedMotion }: { x: number; view: BinView; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color; opacity: number }
    const targetHex = view.flash === 'wrong' ? ROSE : view.flash === 'hint' ? '#ffffff' : view.color
    _col.set(targetHex)
    const kk = reducedMotion ? 1 : Math.min(1, dt * 7)
    mat.color.lerp(_col, kk)
    const targetOpacity = view.flash ? 0.95 : 0.35 + view.fill * 0.6
    mat.opacity += (targetOpacity - mat.opacity) * kk
  })
  return (
    <group position={[x, 1.85, -1.28]}>
      {/* wood frame */}
      <mesh castShadow><boxGeometry args={[1.5, 1.7, 0.16]} /><meshToonMaterial color={WOOD_DARK} /></mesh>
      {/* glowing route panel */}
      <mesh ref={ref} position={[0, 0, 0.1]}>
        <planeGeometry args={[1.24, 1.42]} />
        <meshBasicMaterial color={view.color} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

// =========================================================================
// GroupSort3D — default export
// =========================================================================
export default function GroupSort3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle (accepts a single puzzle or a deck array) ────────────────
  const pz = useMemo<GSPuzzle>(() => {
    const p = puzzle as GSPuzzle | GSPuzzle[] | undefined
    const one = Array.isArray(p) ? p[0] : p
    if (one && Array.isArray(one.groups) && one.groups.length > 0 && Array.isArray(one.items) && one.items.length > 0) return one
    return DEMO
  }, [puzzle])
  const groups = pz.groups
  const items = pz.items
  const total = items.length

  // ── State ───────────────────────────────────────────────────────────────────
  // placed[word] = groupId, only for CORRECTLY sorted envelopes.
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [wrongBin, setWrongBin] = useState<number | null>(null)
  const [hintBin, setHintBin] = useState<number | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [live, setLive] = useState('')
  const wrongSet = useRef<Set<string>>(new Set())
  const fired = useRef(false)
  const startMs = useRef(performance.now())
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const placedCount = Object.keys(placed).length
  const done = placedCount >= total

  // Envelopes still in the tray (unsorted), original order.
  const tray = useMemo(() => items.filter((it) => !(it.word in placed)).map((it) => it.word), [items, placed])
  const current = selected && tray.includes(selected) ? selected : tray[0]

  useEffect(() => () => {
    if (wrongTimer.current) clearTimeout(wrongTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  // ── Session complete (single fire) ──────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('All the mail is sorted. The post office is warm and quiet.')
    const result: SessionResult = {
      correctCount: Math.max(0, total - wrongSet.current.size),
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'groupsort',
    }
    onSessionComplete?.(result)
  }, [done, total, onSessionComplete])

  const drop = useCallback((binIdx: number) => {
    if (done) return
    const word = current
    if (!word) return
    const item = items.find((it) => it.word === word)
    if (!item) return
    const g = groups[binIdx]
    if (!g) return
    if (g.id === item.group) {
      setPlaced((p) => ({ ...p, [word]: g.id }))
      setSelected(null)
      setHintBin(null)
      setLive(`Stamped — "${word}" routed to ${g.name}.`)
    } else {
      wrongSet.current.add(word)
      setSelected(null)
      setWrongBin(binIdx)
      setLive(`Return to sender — "${word}" doesn't belong there.`)
      if (wrongTimer.current) clearTimeout(wrongTimer.current)
      wrongTimer.current = setTimeout(() => setWrongBin(null), 460)
    }
  }, [done, current, items, groups])

  const useHint = useCallback(() => {
    if (done || hintsUsed >= 3 || !current) return
    const item = items.find((it) => it.word === current)
    if (!item) return
    const gi = groups.findIndex((g) => g.id === item.group)
    if (gi < 0) return
    setHintsUsed((h) => h + 1)
    setHintBin(gi)
    setLive(`Hint — "${current}" goes to ${groups[gi].name}.`)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintBin(null), 1600)
  }, [done, hintsUsed, current, items, groups])

  // Stamp the rest — auto-route remaining envelopes correctly (counts as missed).
  const stampRest = useCallback(() => {
    if (done) return
    setPlaced(() => {
      const next: Record<string, string> = {}
      items.forEach((it) => { next[it.word] = it.group; if (!(it.word in placed)) wrongSet.current.add(it.word) })
      return next
    })
    setSelected(null)
    setLive('Stamped the remaining mail.')
  }, [done, items, placed])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      const k = e.key.toLowerCase()
      const binIdx = BIN_KEYS.indexOf(k)
      if (binIdx >= 0 && binIdx < groups.length) { e.preventDefault(); drop(binIdx); return }
      if (k === 'h') { e.preventDefault(); useHint(); return }
      if (k === 's') { e.preventDefault(); stampRest(); return }
      const d = parseInt(k, 10)
      if (!Number.isNaN(d) && d >= 1 && d <= tray.length) { e.preventDefault(); setSelected(tray[d - 1]) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, groups, tray, drop, useHint, stampRest])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    wrongSet.current = new Set()
    setPlaced({}); setSelected(null); setWrongBin(null); setHintBin(null); setHintsUsed(0); setLive('')
  }, [])

  const warmth = total > 0 ? placedCount / total : 0
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : 'idle'

  // 3D bin views.
  const binViews: BinView[] = useMemo(() => groups.map((g, i) => {
    const groupTotal = items.filter((it) => it.group === g.id).length || 1
    const filled = Object.values(placed).filter((gid) => gid === g.id).length
    return { color: g.color, fill: filled / groupTotal, flash: wrongBin === i ? 'wrong' : hintBin === i ? 'hint' : null }
  }), [groups, items, placed, wrongBin, hintBin])

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Post Office</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>{pz.title ?? 'Sort the mail by route'}</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{placedCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} sorted</span>
        </div>
      </div>

      {!done && (
        <>
          {/* Sorting windows (drop targets) */}
          <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 'min(680px, 94vw)', display: 'flex', gap: 10, justifyContent: 'center', pointerEvents: 'auto', flexWrap: 'wrap' }}>
            {groups.map((g, i) => {
              const count = Object.values(placed).filter((gid) => gid === g.id).length
              const gtot = items.filter((it) => it.group === g.id).length
              const isHint = hintBin === i
              const isWrong = wrongBin === i
              return (
                <button key={g.id} onClick={() => drop(i)} aria-label={`Route ${g.name}, ${count} of ${gtot} sorted`}
                  style={windowBox(g.color, isHint, isWrong)}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>{g.name}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>{count} / {gtot} · key {BIN_KEYS[i]?.toUpperCase()}</div>
                </button>
              )
            })}
          </div>

          {/* Current envelope + tray */}
          <div style={{ position: 'absolute', bottom: 64, left: 14, right: 14, textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 8 }}>
              {current ? 'This envelope → tap its route window above' : 'All mail sorted'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {tray.map((word, n) => {
                const isCur = word === current
                return (
                  <button key={word} onClick={() => setSelected(word)} aria-label={`Envelope: ${word}${isCur ? ', selected' : ''}`}
                    style={envelopeTile(isCur)}>
                    <span style={{ fontSize: 9, opacity: 0.5, marginRight: 6 }}>{n + 1}</span>{word}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Footer controls */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={stampRest} style={skipBtn}>STAMP REST →</button>
            <button onClick={useHint} disabled={hintsUsed >= 3} style={hintBtn(hintsUsed >= 3)}>HINT · {3 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>1–9 pick · Q/W/E drop · H hint · S stamp rest</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Post office cleared" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 30, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The mail is sorted.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every envelope routed.<br />
            <strong style={{ color: GREEN }}>{Math.max(0, total - wrongSet.current.size)}</strong> / {total} sorted first time.
          </div>
          <button onClick={reset} style={nextBtn}>Sort again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Group sort — route each word envelope to its correct category window"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.6, 7.2]} cameraFov={48} overlay={overlay}>
        <PostOfficeScene
          bins={binViews}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
function windowBox(color: string, hint: boolean, wrong: boolean): React.CSSProperties {
  return {
    flex: '1 1 150px', minHeight: 64, maxWidth: 220, padding: '12px 12px', borderRadius: 10,
    background: wrong ? `${ROSE}22` : `${color}1c`,
    border: `2px solid ${wrong ? ROSE : hint ? '#ffffff' : color}`,
    color: CREAM, cursor: 'pointer', touchAction: 'manipulation',
    boxShadow: hint ? `0 0 18px ${color}aa` : 'none', transition: 'box-shadow 200ms ease, background 200ms ease',
  }
}
function envelopeTile(current: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '9px 14px', borderRadius: 8,
    background: current ? 'rgba(255,206,134,0.22)' : 'rgba(246,239,226,0.10)',
    border: `2px solid ${current ? AMBER_SOFT : `${CREAM}44`}`, color: CREAM,
    fontWeight: 600, fontSize: 14, fontFamily: 'Georgia, serif', cursor: 'pointer', touchAction: 'manipulation',
  }
}
const nextBtn: React.CSSProperties = {
  minHeight: 44, padding: '10px 22px', borderRadius: 9, background: AMBER_SOFT,
  color: INK, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
}
const skipBtn: React.CSSProperties = {
  minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
  border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.08em',
  cursor: 'pointer', touchAction: 'manipulation',
}
function hintBtn(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
    border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.08em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, touchAction: 'manipulation',
  }
}
