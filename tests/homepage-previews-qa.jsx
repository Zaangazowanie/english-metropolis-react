// Isolated component QA. No App, accounts, backend calls or production writes.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import AnalysisPreviewShowcase from '../src/views/v3/AnalysisPreviewShowcase.jsx'
import NativeWordClip from '../src/views/v3/NativeWordClip.jsx'
import { PREVIEW_CLIPS } from '../src/views/v3/preview-clips.mjs'

const nativeMatchMedia = window.matchMedia.bind(window)
const listeners = new Set()
let reduce = false
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  get matches() { return reduce }, media: query,
  addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
} : nativeMatchMedia(query)

function App() {
  const [revision, setRevision] = useState(0), [reduced, setReduced] = useState(false), [failed, setFailed] = useState(false)
  return <MemoryRouter><div className="gh-root" style={{ '--gh-text': '#f4f0ff', '--gh-text-soft': '#bdb0d4', '--gh-border-hi': '#68528370', '--gh-glass-strong-bg': '#140d22', background: '#0a0718', color: '#f4f0ff', padding: 20 }}>
    <div style={{ display: 'flex', gap: 16, position: 'sticky', top: 0, zIndex: 20, background: '#fff', padding: 14, color: '#111' }}>
      <button onClick={() => { reduce = !reduce; setReduced(reduce); listeners.forEach(fn => fn({ matches: reduce })) }}>{reduced ? 'Use normal motion' : 'Use reduced motion'}</button>
      <button onClick={() => { setFailed(value => !value); setRevision(0) }}>{failed ? 'Restore clip source' : 'Simulate unavailable clip'}</button>
      <output>Reduced motion: {String(reduced)}</output>
    </div>
    <AnalysisPreviewShowcase lang="en"/>
    <div style={{ maxWidth: 580, margin: '40px auto' }}><NativeWordClip key={String(failed)} clip={failed ? { ...PREVIEW_CLIPS.mural, word: 'unavailable-qa-clip' } : PREVIEW_CLIPS.mural} active={revision > 0} revision={revision} onPlayRequest={() => setRevision(value => value + 1)}/></div>
  </div></MemoryRouter>
}
createRoot(document.getElementById('root')).render(<App/>);
