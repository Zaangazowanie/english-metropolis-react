// Floating AI chat widget — restored for v3 chrome (replaces the legacy
// /students/conversa-widget-v4g.js script). Posts to /api/conversa/chat which
// is proxied by nginx to the local Conversa backend on :8800.
//
// Behaviour highlights:
//  - Hidden on /auth/* and /login routes.
//  - Only renders when a student is authenticated (real session OR legacy
//    slug-based fallback). Mirrors useStudentAuth().hasStudentAccess.
//  - Day / night palette is driven by useV3Theme() to match the rest of the
//    chrome.
//  - On a backend failure we show a clearly-labelled "backend not connected"
//    placeholder instead of failing silently — flagged as a known fragile path
//    in deploy_discipline_em memory.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStudentAuth } from '../contexts/StudentAuthContext.jsx'
import { useV3Theme } from '../design/v3/ThemeProvider.jsx'
import { EASE, FONT, G } from '../design/v3/tokens.js'

const CHAT_API = '/api/conversa/chat'
const MAX_HISTORY = 16

function readVoice() {
  try { return localStorage.getItem('tts_voice') || 'af_heart' } catch { return 'af_heart' }
}

export default function ChatWidget() {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const location = useLocation()
  const { hasStudentAccess, resolvedSlug } = useStudentAuth()

  const hideForRoute = /^\/(auth|login|signup|forgot)/i.test(location.pathname)
  const enabled = hasStudentAccess && !hideForRoute

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your English coach. Ask me anything — vocabulary, grammar, pronunciation, or just chat to practice." },
  ])
  const scrollRef = useRef(null)

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!enabled) return null

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const next = [...messages, { role: 'user', text }]
    setMessages(next)
    setBusy(true)
    const history = next
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))
    try {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 25000)
      const r = await fetch(CHAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          student_id: resolvedSlug || 'guest',
          message: text,
          history: history.slice(0, -1), // drop the just-sent user msg from history
          voice: readVoice(),
        }),
      })
      window.clearTimeout(timer)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const reply = data?.reply || data?.text || data?.message
      if (reply) {
        setMessages(m => [...m, { role: 'assistant', text: reply }])
      } else {
        setMessages(m => [...m, { role: 'system', text: 'Chat backend returned no reply yet — TODO: wire response shape.' }])
      }
    } catch (err) {
      // Known fragile: /api/conversa/chat may be down. Keep the UI honest.
      setMessages(m => [...m, {
        role: 'system',
        text: 'Chat backend not yet connected (TODO). Your message was captured but no reply was generated.',
      }])
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const panelBg = isDay
    ? 'linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%)'
    : 'linear-gradient(180deg, rgba(28,18,58,0.98), rgba(14,9,32,0.98))'

  return (
    <div data-component="chat-widget" style={{ position: 'fixed', right: 20,
      bottom: 'calc(20px + env(safe-area-inset-bottom))', zIndex: 60 }}>
      {open && (
        <div role="dialog" aria-label="AI chat" style={{
          position: 'absolute', right: 0, bottom: 72,
          width: 'min(380px, calc(100vw - 32px))',
          height: 'min(560px, calc(100vh - 140px))',
          background: panelBg,
          border: `1px solid ${T.borderHi}`, borderRadius: 20,
          boxShadow: T.shadow,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: `chatPanelIn 220ms ${EASE.springSoft}`,
        }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', gap: 10,
            background: isDay ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.03)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: G.brand,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: T.ringBrand }}>
              <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 18 }}>auto_awesome</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 600,
                color: T.text, letterSpacing: '-0.01em' }}>English Coach</div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 1 }}>
                Conversa AI · powered by your voice selection
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                color: T.textDim, padding: 4, display: 'flex', borderRadius: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto',
            padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => {
              if (m.role === 'system') {
                return (
                  <div key={i} style={{
                    alignSelf: 'center', maxWidth: '90%',
                    padding: '8px 12px', borderRadius: 12,
                    background: isDay ? 'rgba(217,70,239,0.08)' : 'rgba(217,70,239,0.16)',
                    border: `1px dashed ${T.borderHi}`,
                    fontSize: 11, color: T.textSoft, fontStyle: 'italic',
                    fontFamily: FONT.body, lineHeight: 1.45,
                  }}>{m.text}</div>
                )
              }
              const isUser = m.role === 'user'
              return (
                <div key={i} style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  padding: '9px 13px', borderRadius: 14,
                  background: isUser
                    ? G.brand
                    : (isDay ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.05)'),
                  color: isUser ? '#fff' : T.text,
                  fontFamily: FONT.body, fontSize: 13, lineHeight: 1.5,
                  border: isUser ? 'none' : `1px solid ${T.border}`,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{m.text}</div>
              )
            })}
            {busy && (
              <div style={{ alignSelf: 'flex-start', padding: '8px 12px',
                color: T.textDim, fontSize: 12, display: 'inline-flex',
                alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16,
                  animation: 'chatPulse 1.4s ease-in-out infinite' }}>more_horiz</span>
                thinking…
              </div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: `1px solid ${T.border}`,
            display: 'flex', gap: 6, alignItems: 'flex-end',
            background: isDay ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.02)' }}>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message…"
              rows={1}
              style={{ flex: 1, resize: 'none', maxHeight: 120,
                padding: '9px 12px', borderRadius: 12,
                background: isDay ? '#fff' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${T.border}`, color: T.text,
                fontFamily: FONT.body, fontSize: 13, lineHeight: 1.4,
                outline: 'none' }}/>
            <button onClick={send} disabled={busy || !input.trim()} aria-label="Send"
              style={{ flexShrink: 0, width: 38, height: 38, border: 'none',
                cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: busy || !input.trim() ? 0.5 : 1,
                borderRadius: 12, background: G.brand, color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: T.shadowSm,
                transition: `transform 160ms ${EASE.springFast}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)} aria-label={open ? 'Close chat' : 'Open AI chat'}
        style={{ width: 56, height: 56, borderRadius: '50%', border: 'none',
          cursor: 'pointer', background: G.brand, color: '#fff',
          boxShadow: '0 14px 40px -10px rgba(217,70,239,0.55), 0 6px 16px -6px rgba(0,0,0,0.4)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: `transform 220ms ${EASE.springSoft}`,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 26 }}>
          {open ? 'expand_more' : 'forum'}
        </span>
      </button>

      <style>{`
        @keyframes chatPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes chatPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )
}
