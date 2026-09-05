import { Component, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ErrorInfo, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, NeutralToneMapping } from 'three'
import type { QualityTier } from '../types'
import { palette, duskSkyStops } from './palette'

// ─────────────────────────────────────────────────────────────────────
// Quality tiers — map the host-decided tier to concrete render settings.
// DPR is always clamped ≤ 1.5 (contract rule 7). Shadows: one cheap
// directional only on 'high'.
// ─────────────────────────────────────────────────────────────────────
export interface QualitySettings {
  tier: QualityTier
  /** [min, max] device-pixel-ratio passed to the Canvas; max ≤ 1.5. */
  dpr: [number, number]
  shadows: boolean
  /** Suggested particle density multiplier (0 = none) for scenes to scale. */
  particles: number
  antialias: boolean
}

function autodetectTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium'
  const cores = navigator.hardwareConcurrency || 4
  // deviceMemory is non-standard / not in lib.dom — read defensively.
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4
  if (cores <= 2 || mem <= 2) return 'low'
  if (cores >= 8 && mem >= 8) return 'high'
  return 'medium'
}

/** Resolve a tier (or autodetect) into concrete, budget-safe render settings. */
export function resolveQuality(quality?: QualityTier): QualitySettings {
  const tier = quality ?? autodetectTier()
  switch (tier) {
    case 'high':
      return { tier, dpr: [1, 1.5], shadows: true, particles: 1, antialias: true }
    case 'medium':
      return { tier, dpr: [1, 1.25], shadows: false, particles: 0.5, antialias: true }
    default:
      return { tier: 'low', dpr: [1, 1], shadows: false, particles: 0, antialias: false }
  }
}

let webglAvailable: boolean | undefined
/** Probe once and release it. Retaining a probe per game exhausts the browser's
 * context limit when a learner moves through several districts. */
export function hasWebGL(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (webglAvailable !== undefined) return webglAvailable
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    webglAvailable = !!context
    context?.getExtension('WEBGL_lose_context')?.loseContext()
    return webglAvailable
  } catch {
    webglAvailable = false
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────
// Stage quality context — child scene components read it to scale visuals.
// The Provider lives INSIDE the Canvas so consumers in the r3f tree resolve
// it without a context bridge.
// ─────────────────────────────────────────────────────────────────────
export interface StageQuality {
  tier: QualityTier
  settings: QualitySettings
  reducedMotion: boolean
}

const StageQualityContext = createContext<StageQuality | null>(null)

/** Read the active stage quality from inside a CityStage scene. Falls back to
 *  a safe medium default when used outside a CityStage (e.g. in tests). */
export function useStageQuality(): StageQuality {
  const ctx = useContext(StageQualityContext)
  if (ctx) return ctx
  return { tier: 'medium', settings: resolveQuality('medium'), reducedMotion: false }
}

// ─────────────────────────────────────────────────────────────────────
// Error boundary — any throw while mounting the 3D scene hands control back
// to the host via onError (which swaps in the canonical 2D shell).
// ─────────────────────────────────────────────────────────────────────
interface BoundaryProps {
  onError?: (error: Error) => void
  fallback: ReactNode
  children: ReactNode
}
interface BoundaryState {
  failed: boolean
}
class StageErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }
  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }
  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError?.(error)
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// ─────────────────────────────────────────────────────────────────────
// Default lights — warm dusk rig. Vertex/standard lighting; at most one cheap
// directional shadow (high tier only). Games may add their own.
// ─────────────────────────────────────────────────────────────────────
function StageLights({ settings, arcade }: { settings: QualitySettings; arcade: boolean }) {
  return (
    <>
      <hemisphereLight args={arcade ? ['#ffffff', '#112451', 1.05] : ['#d5e4ff', '#78648e', 1.4]} />
      <ambientLight intensity={arcade ? 0.35 : 0.9} color={arcade ? '#ffffff' : '#f3efff'} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={arcade ? 2 : 2.6}
        color={arcade ? '#ffffff' : palette.lanternCore}
        castShadow={settings.shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
    </>
  )
}

function ContextLifecycle({ onLost }: { onLost: () => void }) {
  const gl = useThree(state => state.gl)
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => { event.preventDefault(); onLost() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  return null
}

/** Development-only measurements for visual QA. They describe the previous
 * rendered frame, so inspecting a board does not require a second render. */
function RenderMeasurements() {
  const gl = useThree(state => state.gl)
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    elapsed.current += delta
    if (elapsed.current < 1) return
    elapsed.current = 0
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls)
    gl.domElement.dataset.triangles = String(gl.info.render.triangles)
    gl.domElement.dataset.pixelRatio = String(gl.getPixelRatio())
  })
  return null
}

export interface CityStageProps {
  /** The 3D scene — rendered inside the Canvas. */
  children?: ReactNode
  /** Crisp DOM/HTML overlay (English text, HUD, CTAs). Rendered as a sibling
   *  layer above the canvas — never baked into a 3D texture (contract rule 9).
   *  The overlay layer is pointer-transparent; give interactive controls
   *  `pointerEvents: 'auto'` so canvas input still works underneath. */
  overlay?: ReactNode
  quality?: QualityTier
  reducedMotion?: boolean
  fullscreen?: boolean
  /** Called when WebGL is unavailable or the scene throws — the host swaps to
   *  the canonical 2D shell. */
  onError?: (error: Error) => void
  cameraPosition?: [number, number, number]
  cameraFov?: number
  className?: string
  /** Embedded boards can choose their dimensions without global CSS overrides. */
  style?: CSSProperties
  minHeight?: number
  /** Neutral product lighting preserves the saturated enamel arcade materials. */
  arcade?: boolean
  fallback?: ReactNode
}

/**
 * CityStage — the shared Fluent City canvas wrapper. One single canvas per
 * game. Detects WebGL, clamps DPR ≤ 1.5, gates shadows by quality tier, paints
 * the dusk-sky gradient behind a transparent canvas, and wraps the scene in an
 * error boundary that hands back to the 2D shell on failure. The canvas is
 * `aria-hidden`; readable language content lives in the `overlay` DOM layer.
 */
export function CityStage({
  children,
  overlay,
  quality,
  reducedMotion = false,
  fullscreen = false,
  onError,
  cameraPosition = [0, 1.2, 6],
  cameraFov = 45,
  className,
  style,
  minHeight = 320,
  arcade = false,
  fallback,
}: CityStageProps) {
  const settings = useMemo(() => resolveQuality(quality), [quality])
  const webgl = useMemo(() => hasWebGL(), [])
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const [contextLost, setContextLost] = useState(false)
  const onLost = useMemo(() => () => setContextLost(true), [])

  useEffect(() => {
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '60px' })
    if (host.current) observer?.observe(host.current)
    const sync = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', sync)
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', sync) }
  }, [])

  useEffect(() => {
    if (!webgl || contextLost) {
      onError?.(new Error('WebGL unavailable — falling back to 2D shell'))
    }
  }, [webgl, contextLost, onError])

  const quality3d = useMemo<StageQuality>(
    () => ({ tier: settings.tier, settings, reducedMotion }),
    [settings, reducedMotion],
  )

  const gradient = arcade ? 'linear-gradient(180deg, #060b29, #132c70 70%, #072e52)' : `linear-gradient(180deg, ${duskSkyStops.join(', ')})`

  const wrapperStyle: CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden' }
    : {
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight,
        borderRadius: 14,
        overflow: 'hidden',
      }

  const layerStyle: CSSProperties = { position: 'absolute', inset: 0 }
  const skyStyle: CSSProperties = { ...layerStyle, background: gradient }
  const overlayStyle: CSSProperties = { ...layerStyle, pointerEvents: 'none' }

  return (
    <div ref={host} className={className} style={{ ...wrapperStyle, ...style }} data-three-stage={webgl && !contextLost ? 'ready' : 'fallback'}>
      {/* Decorative 3D layer — hidden from assistive tech (contract rule 10). */}
      <div aria-hidden="true" style={skyStyle}>
        <StageErrorBoundary onError={onError} fallback={fallback ?? <div style={skyStyle} />}>
          {webgl && !contextLost ? (
            <Canvas
              dpr={settings.dpr}
              shadows={settings.shadows}
              frameloop={visible && pageVisible ? 'always' : 'never'}
              camera={{ position: cameraPosition, fov: cameraFov }}
              gl={{ alpha: true, antialias: settings.antialias, powerPreference: 'high-performance', toneMapping: arcade ? NeutralToneMapping : ACESFilmicToneMapping, toneMappingExposure: 1 }}
              style={{ width: '100%', height: '100%' }}
            >
              <StageQualityContext.Provider value={quality3d}>
                <ContextLifecycle onLost={onLost} />
                {(import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV && <RenderMeasurements />}
                <StageLights settings={settings} arcade={arcade} />
                {children}
              </StageQualityContext.Provider>
            </Canvas>
          ) : (
            fallback ?? <div style={skyStyle} />
          )}
        </StageErrorBoundary>
      </div>

      {/* Readable language overlay — real DOM, screen-reader visible. */}
      {overlay != null && <div style={overlayStyle}>{overlay}</div>}
    </div>
  )
}

export default CityStage
