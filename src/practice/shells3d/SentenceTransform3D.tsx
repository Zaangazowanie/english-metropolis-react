// SentenceTransform3D — "The Translator's Booth" (SentenceTransform district).
//
// A three.js re-skin of the canonical 2D SentenceTransform shell
// (src/practice/shells/SentenceTransform.tsx). The MECHANIC is unchanged: a
// Cambridge "key-word transformation" — a source sentence is shown plus a key
// word that must appear unchanged; the player rewrites the sentence to the same
// meaning using that key word. A right transform lights the booth gold; a wrong
// one reveals the model answer (no-fail; still advances). A hint reveals the
// first few words of the model (3/session); skip shows the model. Same puzzle in
// (ShellSentenceTransformPuzzle.items → {original, key_word, target_form,
// acceptedAnswers?, hint, hint_pl}); same SessionResult out. Built on GameKit.
//
// Scene: a dusk UN interpreter's booth. A desk with two angled screens (the
// left shows the source, the right warms gold when the rewrite matches) and a
// mic whose glow shifts violet → gold on a correct transform — but all readable
// English (source, key word, the typed transform) lives in the crisp DOM
// overlay, never baked into a texture (contract rule 9). Bajla the interpreter
// owl perches on the desk.
//
// Contract: single CityStage canvas (DPR clamped, aria-hidden); all readable
// English in the DOM overlay; quality tiers + reducedMotion honoured; full
// keyboard (type the transform, Enter commit · H hint · S skip) + touch (≥44px;
// native keyboard for input); procedural geometry + basic materials only; no
// new deps; no per-frame allocations.

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
const VIOLET = '#A78BFA'   // booth idle glow
const SCREEN_DIM = '#23323a'
const DESK = '#2A2030'

// ── Puzzle shape (mirrors the 2D shell) ──────────────────────────────────────
interface STItem {
  id: string
  original: string
  key_word: string
  target_form: string
  acceptedAnswers?: string[]
  hint?: string
  hint_pl?: string
}
interface STPuzzle { items: STItem[] }

// ── Built-in demo — original Cambridge-style transforms ───────────────────────
const DEMO: STItem[] = [
  { id: 'st-1', original: 'My brother is taller than me.', key_word: 'as', target_form: 'I am not as tall as my brother.',
    acceptedAnswers: ["i'm not as tall as my brother."], hint: 'Use "as ... as" in the negative.', hint_pl: 'Konstrukcja "as ... as" w przeczeniu.' },
  { id: 'st-2', original: 'You must wear a helmet here.', key_word: 'should', target_form: 'You should wear a helmet here.',
    hint: 'Swap "must" for the weaker "should".', hint_pl: 'Użyj "should" zamiast "must".' },
  { id: 'st-3', original: 'Shakespeare wrote Hamlet.', key_word: 'was', target_form: 'Hamlet was written by Shakespeare.',
    hint: 'Rewrite in the passive voice with "was".', hint_pl: 'Strona bierna z "was".' },
  { id: 'st-4', original: 'It might rain tomorrow.', key_word: 'possible', target_form: 'It is possible that it will rain tomorrow.',
    acceptedAnswers: ['it is possible it will rain tomorrow.'], hint: 'Begin "It is possible that ...".', hint_pl: 'Zacznij od "It is possible that ...".' },
  { id: 'st-5', original: 'The film was so good that I watched it twice.', key_word: 'such', target_form: 'It was such a good film that I watched it twice.',
    hint: 'Use "such a ... that".', hint_pl: 'Konstrukcja "such a ... that".' },
]

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')
}
function isTransform(typed: string, item: STItem): boolean {
  const t = norm(typed)
  if (t.length === 0) return false
  if (t === norm(item.target_form)) return true
  return item.acceptedAnswers?.some((a) => norm(a) === t) ?? false
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

type BoothState = 'idle' | 'correct' | 'wrong'
const _col = new Color()

// ── 3D scene — the dusk translator's booth ────────────────────────────────────
function BoothScene({ boothState, warmth, reducedMotion, bajlaVariant }: {
  boothState: BoothState; warmth: number; reducedMotion: boolean; bajlaVariant: 'idle' | 'celebrate'
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
      {/* Booth desk */}
      <mesh position={[0, 0.66, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.14, 1.4]} />
        <meshToonMaterial color={DESK} />
      </mesh>
      {/* Booth back wall */}
      <mesh position={[0, 2.0, -1.5]}>
        <boxGeometry args={[4.0, 3.0, 0.2]} />
        <meshToonMaterial color="#1f1830" />
      </mesh>
      {/* Left screen — source (steady teal-violet) */}
      <mesh position={[-0.95, 1.5, -1.35]} rotation={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[1.5, 0.95, 0.06]} />
        <meshBasicMaterial color={VIOLET} transparent opacity={0.5} />
      </mesh>
      {/* Right screen — output (warms gold on correct) */}
      <OutputScreen state={boothState} reducedMotion={reducedMotion} />
      {/* Mic on a short stand (glow shifts violet → gold on correct) */}
      <mesh position={[0, 0.9, 0.35]} castShadow><cylinderGeometry args={[0.025, 0.03, 0.5, 6]} /><meshToonMaterial color="#3a3450" /></mesh>
      <MicHead state={boothState} reducedMotion={reducedMotion} />
      {/* Headphones resting on the desk (band + 2 cups) */}
      <mesh position={[1.2, 0.78, 0.2]}><boxGeometry args={[0.06, 0.28, 0.42]} /><meshToonMaterial color="#15101f" /></mesh>
      <mesh position={[1.2, 0.74, 0.0]}><sphereGeometry args={[0.1, 8, 6]} /><meshToonMaterial color="#15101f" /></mesh>
      <mesh position={[1.2, 0.74, 0.4]}><sphereGeometry args={[0.1, 8, 6]} /><meshToonMaterial color="#15101f" /></mesh>
      {/* Warm booth lamp */}
      <group position={[-1.7, 0, -1.0]}>
        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.04, 0.06, 2.8, 6]} /><meshToonMaterial color={palette.brass} /></mesh>
        <mesh position={[0, 2.85, 0]}><sphereGeometry args={[0.16, 10, 8]} /><meshBasicMaterial color={palette.lanternCore} transparent opacity={0.55 + warmth * 0.4} /></mesh>
      </group>
      <Bajla variant={bajlaVariant} reducedMotion={reducedMotion} scale={0.36} position={[1.6, 0.95, 0.5]} />
    </group>
  )
}

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current += dt
    const cam = state.camera
    const bob = reducedMotion ? 0 : Math.sin(t.current * 0.5) * 0.03
    cam.position.set(0, 2.2 + bob, 5.8)
    cam.lookAt(0, 1.3, 0)
  })
  return null
}

function OutputScreen({ state, reducedMotion }: { state: BoothState; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color; opacity: number }
    const target = state === 'correct' ? AMBER_SOFT : state === 'wrong' ? ROSE : SCREEN_DIM
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 6)
    mat.color.lerp(_col, k)
    const targetOp = state === 'idle' ? 0.4 : 0.7
    mat.opacity += (targetOp - mat.opacity) * k
  })
  return (
    <mesh ref={ref} position={[0.95, 1.5, -1.35]} rotation={[0, -0.18, 0]} castShadow>
      <boxGeometry args={[1.5, 0.95, 0.06]} />
      <meshBasicMaterial color={SCREEN_DIM} transparent opacity={0.4} />
    </mesh>
  )
}

function MicHead({ state, reducedMotion }: { state: BoothState; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null!)
  useFrame((_, dt) => {
    if (!ref.current) return
    const mat = ref.current.material as unknown as { color: Color }
    const target = state === 'correct' ? AMBER_SOFT : state === 'wrong' ? ROSE : VIOLET
    _col.set(target)
    const k = reducedMotion ? 1 : Math.min(1, dt * 6)
    mat.color.lerp(_col, k)
  })
  return (
    <mesh ref={ref} position={[0, 1.2, 0.35]}>
      <sphereGeometry args={[0.09, 10, 8]} />
      <meshBasicMaterial color={VIOLET} />
    </mesh>
  )
}

// =========================================================================
// SentenceTransform3D — default export
// =========================================================================
export default function SentenceTransform3D({ puzzle, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const items = useMemo<STItem[]>(() => {
    const p = puzzle as STPuzzle | undefined
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

  useEffect(() => { if (!done) setTimeout(() => inputRef.current?.focus(), 0) }, [idx, done])

  useEffect(() => {
    if (!done || fired.current) return
    fired.current = true
    setLive("Every line interpreted. The booth falls quiet.")
    const r: SessionResult = {
      correctCount,
      totalQuestions: total,
      durationMs: Math.round(performance.now() - startMs.current),
      shellKey: 'sentencetransform',
    }
    onSessionComplete?.(r)
  }, [done, correctCount, total, onSessionComplete])

  const commit = useCallback(() => {
    if (verdict !== null || done || !cur) return
    if (typed.trim().length === 0) return
    if (isTransform(typed, cur)) {
      setVerdict('correct')
      setCorrectCount((c) => c + 1)
      setLive('Correct — the meaning holds.')
    } else {
      setVerdict('wrong')
      setLive(`Not quite — the model is: ${cur.target_form}`)
    }
  }, [verdict, done, cur, typed])

  const advance = useCallback(() => {
    setVerdict(null); setTyped(''); setHintText('')
    setSeen((s) => s + 1)
    setIdx((i) => Math.min(i + 1, total - 1))
  }, [total])

  const skip = useCallback(() => {
    if (done) return
    if (verdict !== null) { advance(); return }
    setVerdict('wrong')
    setLive(`Skipped — the model is: ${cur?.target_form}`)
    setTimeout(() => advance(), 1900)
  }, [done, verdict, cur, advance])

  const useHint = useCallback(() => {
    if (verdict !== null || done || hintsUsed >= 3 || !cur) return
    setHintsUsed((h) => h + 1)
    const words = cur.target_form.split(' ').slice(0, 3).join(' ')
    setHintText(`Start: "${words}…"${cur.hint ? ` — ${cur.hint}` : ''}`)
    setLive(`Hint — start with ${words}.`)
  }, [verdict, done, hintsUsed, cur])

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
  const boothState: BoothState = verdict === 'correct' ? 'correct' : verdict === 'wrong' ? 'wrong' : 'idle'
  const bajlaVariant: 'idle' | 'celebrate' = done ? 'celebrate' : verdict === 'correct' ? 'celebrate' : 'idle'

  // ── DOM overlay ───────────────────────────────────────────────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'ui-monospace,monospace', color: CREAM, pointerEvents: 'none' }}>
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>The Translator's Booth</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_SOFT }}>Rewrite — keep the meaning</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(14,10,26,0.75)', border: `1px solid ${AMBER_SOFT}55`, borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ color: GREEN }}>{correctCount}</span>
          <span style={{ opacity: 0.6 }}> / {total} interpreted</span>
        </div>
      </div>

      {cur && !done && (
        <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 'min(580px, 94vw)', textAlign: 'center', pointerEvents: 'auto' }}>
          {/* Source sentence */}
          <div style={{
            background: 'rgba(14,10,26,0.84)', borderRadius: 12, border: `1px solid ${VIOLET}55`,
            padding: '14px 18px', marginBottom: 12, fontFamily: 'Georgia, serif', fontSize: 17, color: CREAM,
          }}>{cur.original}</div>

          {/* Key word chip */}
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.1em', marginRight: 8 }}>KEY WORD</span>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: INK, background: AMBER_SOFT, borderRadius: 7, padding: '4px 14px' }}>{cur.key_word}</span>
          </div>

          {/* Transform input or verdict */}
          {verdict === null ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
                aria-label="Type your transformed sentence" placeholder="Rewrite the sentence…"
                style={{
                  flex: '1 1 320px', minWidth: 220, maxWidth: 440,
                  background: 'rgba(167,139,250,0.12)', border: `2px solid ${VIOLET}`, borderRadius: 9,
                  color: CREAM, fontFamily: 'Georgia, serif', fontSize: 16, padding: '10px 14px', outline: 'none', textAlign: 'center',
                }} />
              <button onClick={commit} style={nextBtn}>Send →</button>
            </div>
          ) : (
            <div>
              <div style={{
                display: 'inline-block', padding: '7px 14px', borderRadius: 9, marginBottom: 10,
                fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700,
                background: verdict === 'correct' ? `${GREEN}22` : `${ROSE}18`,
                border: `1px solid ${verdict === 'correct' ? GREEN : ROSE}`,
                color: verdict === 'correct' ? GREEN : CREAM,
              }}>
                {verdict === 'correct' ? cur.target_form : <>Model: <span style={{ color: AMBER_SOFT }}>{cur.target_form}</span></>}
              </div>
              <br />
              <button onClick={advance} style={nextBtn}>{idx + 1 >= total ? 'Leave the booth →' : 'Next line →'}</button>
            </div>
          )}

          {/* Hint chip */}
          {verdict === null && hintText && (
            <div style={{ fontSize: 12, color: AMBER_SOFT, marginTop: 12, fontStyle: 'italic', opacity: 0.92 }}>🎧 {hintText}</div>
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
          <div style={{ fontSize: 10, opacity: 0.5 }}>type the rewrite · Enter send · H hint · S skip</div>
        </div>
      )}

      {/* Completion */}
      {done && (
        <div role="dialog" aria-label="Booth session complete" style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: `radial-gradient(ellipse, ${AMBER_SOFT}22, rgba(10,5,24,0.82))`,
          backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 28, color: AMBER_SOFT, fontFamily: 'Georgia, serif' }}>The booth falls quiet.</div>
          <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            Every line interpreted.<br />
            <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} transformed.
          </div>
          <button onClick={reset} style={nextBtn}>Back to the booth →</button>
        </div>
      )}
    </div>
  )

  return (
    <div role="application" aria-label="Sentence transformation — rewrite each sentence to the same meaning using the key word"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <CityStage quality={quality} reducedMotion={reduce} fullscreen={fullscreen}
        cameraPosition={[0, 2.2, 5.8]} cameraFov={48} overlay={overlay}>
        <BoothScene boothState={boothState} warmth={warmth} reducedMotion={reduce} bajlaVariant={bajlaVariant} />
      </CityStage>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const nextBtn: React.CSSProperties = {
  minHeight: 44, padding: '10px 20px', borderRadius: 9, background: AMBER_SOFT,
  color: INK, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
}
const skipBtn: React.CSSProperties = {
  minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(167,139,250,0.14)',
  border: `1px solid ${VIOLET}55`, color: '#cbb8ff', fontSize: 11, letterSpacing: '0.1em',
  cursor: 'pointer', touchAction: 'manipulation',
}
function hintBtn(disabled: boolean): React.CSSProperties {
  return {
    minHeight: 44, padding: '8px 14px', borderRadius: 8, background: 'rgba(232,146,10,0.12)',
    border: `1px solid ${AMBER_SOFT}44`, color: AMBER_SOFT, fontSize: 11, letterSpacing: '0.1em',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, touchAction: 'manipulation',
  }
}
