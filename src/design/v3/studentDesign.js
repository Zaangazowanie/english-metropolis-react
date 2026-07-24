// studentDesign — the superadmin console's "Shared design" settings, read by the
// student dashboard.
//
// Published from Console → School → Student preview → Shared design, stored in
// the console's app_config, and served unauthenticated from
// /api/console/public/student-design (presentation keys only; the same config
// table also holds invoice and VAT settings, which that endpoint filters out).
//
// FAILURE IS NOT AN ERROR HERE. If the console API is down, slow, or the keys
// were never published, the dashboard must render exactly as it did before this
// existed. Every consumer therefore gets DEFAULTS synchronously on first paint
// and an update later only if the fetch succeeds — there is no loading state and
// no way for this to blank the page a student is looking at.

import { useEffect, useState } from 'react'

const ENDPOINT = '/api/console/public/student-design'
const TIMEOUT_MS = 2500

// These mirror what the dashboard actually renders. Card ids are the real
// blocks in views/v3/Dashboard.jsx, not invented names.
export const DEFAULT_STUDENT_DESIGN = {
  accent: '',                                     // '' = keep the built-in brand
  greeting: '',                                   // '' = keep the translated welcome line
  cards: ['upcoming', 'revise', 'latest', 'analytics'],
}

export const STUDENT_CARDS = [
  { id: 'upcoming', label: 'Next lesson' },
  { id: 'revise', label: 'Revise last lesson' },
  { id: 'latest', label: 'Latest lesson analysis' },
  { id: 'analytics', label: 'Progress breakdown' },
]

let cached = null           // one fetch per page load, shared by every consumer
let inflight = null

function normalise(raw) {
  const d = raw || {}
  const cards = Array.isArray(d.cards)
    ? d.cards.filter(c => STUDENT_CARDS.some(x => x.id === c))
    : parseCards(d.cards)
  return {
    accent: typeof d.accent === 'string' && /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : '',
    greeting: typeof d.greeting === 'string' ? d.greeting.slice(0, 120) : '',
    // An empty published list would hide the whole dashboard; treat it as
    // "nothing published" rather than "show nothing".
    cards: cards && cards.length ? cards : DEFAULT_STUDENT_DESIGN.cards,
  }
}

function parseCards(v) {
  if (typeof v !== 'string') return null
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : null } catch { return null }
}

export function fetchStudentDesign() {
  if (cached) return Promise.resolve(cached)
  if (inflight) return inflight
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => ctl?.abort(), TIMEOUT_MS)
  inflight = fetch(ENDPOINT, { signal: ctl?.signal })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { cached = normalise(j?.design); return cached })
    .catch(() => { cached = { ...DEFAULT_STUDENT_DESIGN }; return cached })
    .finally(() => { clearTimeout(timer); inflight = null })
  return inflight
}

export function useStudentDesign() {
  const [design, setDesign] = useState(cached || DEFAULT_STUDENT_DESIGN)
  useEffect(() => {
    let alive = true
    fetchStudentDesign().then(d => { if (alive) setDesign(d) })
    return () => { alive = false }
  }, [])
  return design
}

// "Cześć, {name}!" -> "Cześć, Szymon!". Returns null when nothing is published,
// so the caller keeps its own translated greeting.
export function applyGreeting(template, firstName) {
  if (!template) return null
  return template.includes('{name}')
    ? template.replace(/\{name\}/g, firstName || '')
    : template
}

// A published accent replaces the flat brand colour. The brand GRADIENT is left
// alone: deriving a three-stop gradient from one hex produced worse results than
// the designed one, so an accent tints the solid uses and the gradient stays.
export function accentOr(design, fallback) {
  return design?.accent || fallback
}
