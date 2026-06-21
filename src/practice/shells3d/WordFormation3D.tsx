// WordFormation3D — "The Mason's Yard" (WordFormation district).
//
// A three.js re-skin of the canonical 2D WordFormation shell
// (src/practice/shells/WordFormation.tsx). The MECHANIC is unchanged: a
// sentence with a gap appears, plus a BASE word stamped on a raw stone block
// (e.g. BRAVE); the player chisels (types) the right derived form to fit the
// gap — adding prefixes (un-, dis-) or suffixes (-tion, -ness, -ly) and the
// target part of speech (noun / verb / adjective / adverb). A wrong form
// reveals the correct chiselled word (no-fail; still advances). A hint reveals
// the first 1–2 letters (3 per session). Same puzzle in
// (ShellWordFormationPuzzle.items → {sentence, base_word, target_pos, answer,
// acceptedAnswers?, hint?, hint_pl}); same SessionResult out. Built on the
// GameKit.
//
// Scene: a dusk stonemason's yard. A great raw stone block carries the BASE
// word; a chisel rests on it; the block flashes amber when the form is chiselled
// right and rose when wrong — but all readable English (the sentence, the base,
// the input) lives in the crisp DOM overlay, never baked into a texture
// (contract rule 9). Bajla the mason's owl watches from the slab.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (type the form, Enter commit · H hint · S skip) + touch (≥44px);
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
const STONE = '#C8B698'      // raw block
const STONE_DARK = '#5C4D3A'

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
type WFPos = 'noun' | 'verb' | 'adj' | 'adv'
interface WFItem {
  id: string
  sentence: string
  base_word: string
  target_pos: WFPos
  answer: string
  acceptedAnswers?: string[]
  hint?: string
  hint_pl?: string
}
interface WFPuzzle { items: WFItem[] }

const POS_LABEL: Record<WFPos, string> = {
  noun: 'NOUN · rzeczownik', verb: 'VERB · czasownik', adj: 'ADJECTIVE · przymiotnik', adv: 'ADVERB · przysłówek',
}

// ── Built-in demo — original derivation items for anonymous play ──────────────
const DEMO: WFItem[] = [
  { id: 'wf-1', sentence: 'Her work shows great ___.', base_word: 'BRAVE', target_pos: 'noun', answer: 'bravery',
    hint: 'Add a noun-forming suffix.', hint_pl: 'Dodaj końcówkę -ery.' },
  { id: 'wf-2', sentence: 'She greeted us ___.', base_word: 'HAPPY', target_pos: 'adv', answer: 'happily',
    hint: 'Adjective → adverb. -y → -ily.', hint_pl: 'Przymiotnik → przysłówek.' },
  { id: 'wf-3', sentence: 'Her latest ___ was a tall iron lamp.', base_word: 'CREATE', target_pos: 'noun', answer: 'creation',
    hint: 'Verb → noun. -te → -tion.', hint_pl: 'Czasownik → rzeczownik.' },
  { id: 'wf-4', sentence: 'Drive ___ on this road.', base_word: 'CAREFUL', target_pos: 'adv', answer: 'carefully',
    hint: 'Adjective → adverb. + -ly.', hint_pl: 'Przymiotnik → przysłówek.' },
  { id: 'wf-5', sentence: 'The new tool was very ___.', base_word: 'USE', target_pos: 'adj', answer: 'useful',
    hint: 'Noun → adjective. + -ful.', hint_pl: 'Rzeczownik → przymiotnik.' },
  { id: 'wf-6', sentence: 'Please pass this ___ on to the team.', base_word: 'INFORM', target_pos: 'noun', answer: 'information',
    hint: 'Verb → noun. + -ation.', hint_pl: 'Czasownik → rzeczownik.' },
]

function isAnswer(typed: string, item: WFItem): boolean {
  const t = typed.trim().toLowerCase()
  if (t === item.answer.toLowerCase()) return true
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

type BlockState = 'idle' | 'correct' | 'wrong'
const _col = new Color()

// ── 3D scene — the dusk mason's yard ──────────────────────────────────────────
function YardScene({
  blockState, warmth, reducedMotion, bajlaVariant,
}: {
  blockState: BlockState
  warmth: number
  reducedMotion: boolean
  bajlaVariant: 'idle' | 'celebrate'
}) {
  const { tier } = useStageQuality()
  return (
    <group>
      <CameraRig reducedMotion={reducedMotion} />
      {tier !== 'low' && <fog attach="fog" args={[palette.duskHorizon, 12, 28]} />}
      {/* Ground */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshToonMaterial color="#2B5F6E" />
      </mesh>
      {/* Stone workbench / plinth the block rests on */}
      <mesh position={[0, 0.5, -0.1]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.0, 1.4]} />
        <meshToonMaterial color={STONE_DARK} />
      </mesh>
      {/* The raw stone block being chiselled (state-reactive) */}
      <Block state={blockState} reducedMotion={reducedMotion} />
      {/* A chisel + mallet resting on the bench */}
      <mesh position={[0.85, 1.06, 0.35]} rotation={[0, 0, Math.PI / 5]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.5, 6]} />
        <meshToonMaterial color="#7A6A52" />
      </mesh>
      <mesh position={[0.78, 1.18, 0.35]} castShadow>
        <boxGeometry args={[0.16, 0.16, 0.28]} />
        <meshToonMaterial color="#3A2A1E" />
      </mesh>
      {/* Two offcut blocks on the ground for yard flavour */}
      <mesh position={[-1.6, 0.22, 0.7]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.5, 0.44, 0.5]} /><meshToonMaterial color={STONE} />
      </mesh>
      <mesh position={[1.7, 0.16, 0.9]} rotation={[0, -0.3, 0]} castShadow>
        <boxGeometry args={[0.42, 0.32, 0.42]} /><meshToonMaterial color={STONE_DARK} />
      </mesh>
      {/* Warm yard lamp */}
      <group position={[-1.9, 0, -1.0]}>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.05, 0.07, 2.8, 6]} /><meshToonMaterial color={palette.brass} /></mesh>
        <mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.18, 10, 8]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.55 + warmth * 0.4} /></mesh>
      </group>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.4} position={[1.7, 0.85, 0.4]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 2.3 + bob, 6.0)
    cam.lookAt(0, 1.1, 0)
  })
  return null
}

// The raw stone block — colour lerps toward state colour + a tiny pop when correct.
function Block({ state, reducedMotion }: { state: BlockState; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  const target = state === 'correct' ? GREEN : state === 'wrong' ? ROSE : STONE
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color }
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 6)
    mat.color.lerp(_col, k)
    const want = state === 'correct' ? 1.06 : 1
    ref.current.scale.x += (want - ref.current.scale.x) * k
    ref.current.scale.y += (want - ref.current.scale.y) * k
  })
  return (
    <mesh ref={ref} position={[0, 1.28, 0.1]} castShadow>
      <boxGeometry args={[1.3, 0.72, 0.5]} />
      <meshBasicMaterial color={STONE} />
    </mesh>
  )
}

// =========================================================================
// WordFormation3D — default export
// =========================================================================
export default function WordFormation3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // ── Resolve puzzle ──────────────────────────────────────────────────────────
  const items = useMemo<WFItem[]>(() => {
    const p = puzzle as WFPuzzle | undefined
    if (p && Array.isArray(p.items) && p.items.length > 0) return p.items
    return DEMO
  }, [puzzle])
  const total = items.length

  // ── State ───────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(0)
  const [typed, setTyped] = useState('')
  const [verdict, setVerdict] = useState<'correct' | 'wrong' | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [seen, setSeen] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintText, setHintText] = useState('')
  const [live, setLive] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fired = useRef(false)
  const startMs = useRef(performance.now())

  const cur = items[idx]
  const done = seen >= total

  // Focus the input when a new item appears.
  useEffect(() => { if (!done) setTimeout(() => inputRef.current?.focus(), 0) }, [idx, done])

  // ── Session complete ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive('Every block is chiselled. The yard is quiet and warm.')
    const result: SessionResult = {
      correctCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'wordformation',
    }
    onSessionComplete?.(result)
  }, [done, correctCount, total, onSessionComplete])

  const commit = useCallback(() => {
    if (verdict !== null || done || !cur) return
    if (typed.trim().length === 0) return
    if (isAnswer(typed, cur)) {
      setVerdict('correct')
      setCorrectCount((c) => c + 1)
      setLive(`Correct — "${cur.answer}" fits the gap.`)
    } else {
      setVerdict('wrong')
      setLive(`Not quite — the form is "${cur.answer}".`)
    }
  }, [verdict, done, cur, typed])

  const advance = useCallback(() => {
    setVerdict(null)
    setTyped('')
    setHintText('')
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  const skip = useCallback(() => {
    if (done) return
    if (verdict !== null) { advance(); return }
    setVerdict('wrong')
    setLive(`Skipped — the form was "${cur?.answer}".`)
    setTimeout(() => advance(), 1700)
  }, [done, verdict, cur, advance])

  const useHint = useCallback(() => {
    if (verdict !== null || done || hintsUsed >= 3 || !cur) return
    setHintsUsed((h) => h + 1)
    // Reveal the first 1–2 letters of the target form (per the 2D mechanic).
    const reveal = cur.answer.slice(0, Math.min(2, cur.answer.length))
    setHintText(`Starts with "${reveal}…"${cur.hint ? ` — ${cur.hint}` : ''}`)
    setLive(`Hint — the form starts with ${reveal}.`)
  }, [verdict, done, hintsUsed, cur])

  // ── Keyboard (global; input handles its own Enter) ──────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return
      if (e.target === inputRef.current) {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        return
      }
      const k = e.key.toLowerCase()
      if (verdict !== null && (k === 'enter' || k === ' ')) { e.preventDefault(); advance(); return }
      if (k === 'h') { e.preventDefault(); useHint(); return }
      if (k === 's') { e.preventDefault(); skip(); return }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [done, verdict, commit, advance, useHint, skip])

  const reset = useCallback(() => {
    fired.current = false
    startMs.current = performance.now()
    setIdx(0); setTyped(''); setVerdict(null); setCorrectCount(0); setSeen(0); setHintsUsed(0); setHintText(''); setLive('')
  }, [])

  const warmth = total > 0 ? correctCount / total : 0
  const blockState: BlockState = verdict === 'correct' ? 'correct' : verdict === 'wrong' ? 'wrong' : 'idle'
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : verdict === 'correct' ? 'celebrate' : 'idle'

  // Split the sentence around the ___ gap for display.
  const [pre, post] = useMemo(() => {
    if (!cur) return ['', '']
    const parts = cur.sentence.split('___')
    return [parts[0] ?? '', parts.slice(1).join('___') ?? '']
  }, [cur])

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Mason's Yard</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Chisel the right form</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{correctCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} carved</span>
        </div>
      </div>

      {cur && !done && (
        <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 'min(600px, 94vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* BASE word + target POS */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, letterSpacing: '0.1em',
              color: INK, background: STONE, borderRadius: 8, padding: '6px 16px',
              boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.2)',
            }}>{cur.base_word}</span>
            <span style={{ fontSize: 16, opacity: 0.6 }}>→</span>
            <span style={{ fontSize: 11, color: AMBER_SOFT, letterSpacing: '0.06em', border: `1px solid ${AMBER_SOFT}66`, borderRadius: 999, padding: '4px 10px' }}>
              {POS_LABEL[cur.target_pos]}
            </span>
          </div>

          {/* Sentence with the gap (the input sits inline) */}
          <div style={{
            background: 'rgba(14,10,26,0.84)', borderRadius: 12, border: `1px solid ${AMBER_SOFT}44`,
            padding: '18px 20px', marginBottom: 14, fontFamily: 'Georgia, serif', fontSize: 18, lineHeight: 1.5, color: CREAM,
          }}>
            <span>{pre}</span>
            {verdict === null ? (
              <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
                aria-label={`Type the ${cur.target_pos} form of ${cur.base_word}`} placeholder="…"
                style={{
                  display: 'inline-block', minWidth: 110, maxWidth: 220,
                  background: 'rgba(255,206,134,0.12)', border: `2px solid ${AMBER_SOFT}`, borderRadius: 6,
                  color: CREAM, fontFamily: 'Georgia, serif', fontSize: 18, padding: '2px 10px', margin: '0 4px',
                  outline: 'none', textAlign: 'center',
                }} />
            ) : (
              <span style={{
                display: 'inline-block', margin: '0 4px', padding: '2px 10px', borderRadius: 6, fontWeight: 700,
                color: verdict === 'correct' ? GREEN : ROSE,
                background: verdict === 'correct' ? `${GREEN}22` : `${ROSE}18`,
                border: `1px solid ${verdict === 'correct' ? GREEN : ROSE}`,
                textDecoration: verdict === 'wrong' ? 'line-through' : 'none',
              }}>{verdict === 'correct' ? cur.answer : (typed.trim() || '—')}</span>
            )}
            <span>{post}</span>
          </div>

          {/* Wrong → reveal the answer */}
          {verdict === 'wrong' && (
            <div style={{ fontSize: 13, color: AMBER_SOFT, marginBottom: 12 }}>
              ✎ The form is <strong style={{ color: GREEN }}>{cur.answer}</strong>
            </div>
          )}
          {/* Hint chip */}
          {verdict === null && hintText && (
            <div style={{ fontSize: 12, color: AMBER_SOFT, marginBottom: 12, fontStyle: 'italic', opacity: 0.9 }}>📐 {hintText}</div>
          )}

          {/* Actions */}
          {verdict === null ? (
            <button onClick={commit} style={nextBtn}>Chisel it →</button>
          ) : (
            <button onClick={advance} style={nextBtn}>{idx + 1 >= total ? 'Close the yard →' : 'Next block →'}</button>
          )}
        </div>
      )}

      {/* Footer */}
      {!done && (
        <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={skip} style={skipBtn}>SKIP →</button>
            <button onClick={useHint} disabled={verdict !== null || hintsUsed >= 3} style={hintBtn(verdict !== null || hintsUsed >= 3)}>HINT · {3 - hintsUsed}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>type the form · Enter chisel · H hint · S skip</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Mason's yard complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The blocks are carved.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every word chiselled to form.<br />
            <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} carved right.
          </div>
          <button onClick={reset} style={nextBtn}>Carve again →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Word formation — chisel the base word into the correct derived form to fit the sentence"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.3, 6.0]} cameraFov={46} overlay={overlay}>
        <YardScene
          blockState={blockState}
          warmth={warmth}
          reducedMotion={reduce}
          bajlaVariant={bajlaVariant}
        />
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
