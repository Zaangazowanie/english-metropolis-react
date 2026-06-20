// useWorldAudio — the English Metro sound layer, fully synthesized via the
// native Web Audio API. NO audio files, NO new deps, NO external URLs, ZERO
// asset bytes (nothing under public/). Everything is generated at runtime:
//   • a low, breathing dusk ambient drone (a root + a fifth, gently detuned)
//   • a warm two-partial "chime" when a stamp is earned (the pager's soft chime)
//   • a soft rising tone when an errand opens
//
// Autoplay policy: an AudioContext starts suspended and must resume on a user
// gesture. We create/resume it from the "Begin" click (and the mute toggle),
// both of which are gestures — so audio never fights the browser.
//
// Mute is persisted (localStorage 'em-muted'). Default: on (soft). All nodes
// are torn down on unmount. No per-frame work (the audio graph runs itself).

import { useCallback, useEffect, useRef, useState } from 'react'

const MUTE_KEY = 'em-muted'

function loadMuted(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1' }
  catch { return false }
}
function saveMuted(m: boolean): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, m ? '1' : '0') }
  catch { /* private mode — silent */ }
}

interface Ambient { stop: () => void }

export interface WorldAudioApi {
  muted: boolean
  toggleMute: () => void
  /** Start the ambient drone (call from a user gesture, e.g. Begin). */
  startAmbient: () => void
  stopAmbient: () => void
  /** Warm bell — the stamp "chime". */
  chime: () => void
  /** Soft rising tone — errand opening. */
  portalTone: () => void
  /** Soft low thud — a single footstep (call on stride beats while walking). */
  footstep: () => void
  /** Rising three-note arpeggio — the "lamp relights" moment. */
  relight: () => void
}

export function useWorldAudio(): WorldAudioApi {
  const ctxRef = useRef<AudioContext | null>(null)
  const ambientRef = useRef<Ambient | null>(null)
  const [muted, setMuted] = useState<boolean>(loadMuted)
  const mutedRef = useRef(muted)
  useEffect(() => { mutedRef.current = muted }, [muted])

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      try { ctxRef.current = new AC() } catch { return null }
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch(() => {})
    return ctxRef.current
  }, [])

  const startAmbient = useCallback(() => {
    const ctx = ensureCtx()
    if (!ctx || mutedRef.current || ambientRef.current) return

    const master = ctx.createGain()
    master.gain.value = 0.0001
    master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.5) // gentle fade-in

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    lp.Q.value = 0.6
    lp.connect(master)
    master.connect(ctx.destination)

    // Root + fifth + soft octave, slightly detuned for warmth.
    const specs: Array<[OscillatorType, number, number, number]> = [
      ['sine', 55.0, -4, 0.6],
      ['sine', 82.4, +5, 0.4],
      ['triangle', 110.0, +2, 0.18],
    ]
    const oscs = specs.map(([type, freq, detune, g]) => {
      const o = ctx.createOscillator()
      o.type = type; o.frequency.value = freq; o.detune.value = detune
      const og = ctx.createGain(); og.gain.value = g
      o.connect(og); og.connect(lp); o.start()
      return o
    })

    // Slow "breathing" LFO on the master gain.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.018
    lfo.connect(lfoGain); lfoGain.connect(master.gain); lfo.start()

    ambientRef.current = {
      stop: () => {
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setValueAtTime(master.gain.value, t)
        master.gain.linearRampToValueAtTime(0.0001, t + 0.6)
        const all = [...oscs, lfo]
        window.setTimeout(() => { all.forEach((o) => { try { o.stop() } catch { /* already */ } }) }, 700)
      },
    }
  }, [ensureCtx])

  const stopAmbient = useCallback(() => {
    ambientRef.current?.stop()
    ambientRef.current = null
  }, [])

  const chime = useCallback(() => {
    const ctx = ensureCtx()
    if (!ctx || mutedRef.current) return
    const t = ctx.currentTime
    const out = ctx.createGain()
    out.gain.value = 0.0001
    out.gain.exponentialRampToValueAtTime(0.13, t + 0.012)
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    out.connect(ctx.destination)
    // Warm two-partial bell (amber major-ish).
    ;[880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator()
      o.type = 'sine'; o.frequency.value = f
      const g = ctx.createGain(); g.gain.value = i === 0 ? 1 : 0.4
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.75)
    })
  }, [ensureCtx])

  const portalTone = useCallback(() => {
    const ctx = ensureCtx()
    if (!ctx || mutedRef.current) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(440, t)
    o.frequency.exponentialRampToValueAtTime(660, t + 0.22)
    const g = ctx.createGain()
    g.gain.value = 0.0001
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.36)
  }, [ensureCtx])

  const footstep = useCallback(() => {
    const ctx = ensureCtx()
    if (!ctx || mutedRef.current) return
    const t = ctx.currentTime
    // A soft, short low "tok" — a quick pitch-dropping sine through a lowpass.
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(70, t + 0.09)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 320
    const g = ctx.createGain()
    g.gain.value = 0.0001
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(lp); lp.connect(g); g.connect(ctx.destination)
    o.start(t); o.stop(t + 0.14)
  }, [ensureCtx])

  const relight = useCallback(() => {
    const ctx = ensureCtx()
    if (!ctx || mutedRef.current) return
    // Three rising notes played in quick succession: E4 → G#4 → B4
    // (a warm major-triad arpeggio — the lamp "lighting up").
    const notes = [330, 415, 494]
    notes.forEach((freq, i) => {
      const t0 = ctx.currentTime + i * 0.12
      const o = ctx.createOscillator()
      o.type = 'sine'; o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.value = 0.0001
      g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.018)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45)
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.5)
    })
  }, [ensureCtx])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      saveMuted(next)
      mutedRef.current = next
      if (next) stopAmbient()
      else startAmbient()  // toggle is a gesture → ctx resumes
      return next
    })
  }, [startAmbient, stopAmbient])

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      ambientRef.current?.stop()
      ambientRef.current = null
      const ctx = ctxRef.current
      if (ctx) window.setTimeout(() => { try { ctx.close() } catch { /* already */ } }, 800)
    }
  }, [])

  return { muted, toggleMute, startAmbient, stopAmbient, chime, portalTone, footstep, relight }
}
