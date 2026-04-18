import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from './ThemeContext'
import { FONTS, EASE } from './tokens'
import { Wordmark } from './primitives'

export function TopNav({ studentSlug, studentInitials = 'SK', onSignOut }) {
  const { T } = useTheme()
  const items = [
    { k: 'dashboard',  label: 'Dashboard',  path: `/app/${studentSlug}/dashboard` },
    { k: 'vocabulary', label: 'Vocabulary', path: `/app/${studentSlug}/vocabulary` },
    { k: 'lessons',    label: 'Lessons',    path: `/app/${studentSlug}/lessons` },
    { k: 'knowledge',  label: 'Knowledge',  path: `/app/${studentSlug}/knowledge` },
    { k: 'practice',   label: 'Practice',   path: `/app/${studentSlug}/practice` },
  ]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 32px', borderBottom: `1px solid ${T.ruleSoft}`,
      background: T.bg, position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <NavLink to={`/app/${studentSlug}/dashboard`}
          style={{ textDecoration: 'none' }}>
          <Wordmark size={18}/>
        </NavLink>
        <div style={{ display: 'flex', gap: 22 }}>
          {items.map(it => (
            <NavLink key={it.k} to={it.path} end
              style={({ isActive }) => ({
                textDecoration: 'none',
                padding: '4px 0',
                fontFamily: FONTS.label, fontSize: 11, fontWeight: 600,
                letterSpacing: '0.22em', textTransform: 'uppercase',
                color: isActive ? T.brand : T.textMute,
                borderBottom: isActive
                  ? `1px solid ${T.brand}`
                  : '1px solid transparent',
                transition: `color 200ms ${EASE.springFast}`,
              })}>
              {it.label}
            </NavLink>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <SearchPill/>
        <Avatar initials={studentInitials} slug={studentSlug} onSignOut={onSignOut}/>
      </div>
    </div>
  )
}

function SearchPill() {
  const { T } = useTheme()
  const [hover, setHover] = useState(false)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 280, padding: '8px 14px',
        background: T.panel, border: `1px solid ${hover ? T.rule : T.ruleSoft}`,
        fontFamily: FONTS.mono, fontSize: 11,
        color: T.textMute,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', transition: 'border-color 180ms',
      }}>
      <span>⌕  Search the Metropolis…</span>
      <span style={{
        padding: '1px 6px', border: `1px solid ${T.ruleSoft}`,
        fontSize: 9, letterSpacing: 0.5,
      }}>⌘K</span>
    </div>
  )
}

function Avatar({ initials, slug, onSignOut }) {
  const { T, mode, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: T.brand, color: T.bg, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 14, fontWeight: 500,
          cursor: 'pointer',
        }}>{initials}</button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 10px)', zIndex: 100,
          width: 220, background: T.panel, border: `1px solid ${T.rule}`,
          padding: 14, boxShadow: `0 30px 60px -20px rgba(0,0,0,0.5)`,
        }}>
          <div style={{
            fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: T.brand, marginBottom: 10,
          }}>Reading mode</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[['dark', 'Night'], ['light', 'Day']].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)}
                style={{
                  flex: 1, padding: '6px 10px',
                  background: mode === k ? T.brand : 'transparent',
                  color: mode === k ? T.bg : T.text,
                  border: `1px solid ${mode === k ? T.brand : T.ruleSoft}`,
                  fontFamily: FONTS.label, fontSize: 10, letterSpacing: '0.18em',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}>{l}</button>
            ))}
          </div>
          <div style={{ height: 1, background: T.ruleSoft, margin: '6px 0 10px' }}/>
          <a href={`/app/${slug}/settings`}
            style={{
              display: 'block', padding: '6px 0',
              fontFamily: FONTS.body, fontStyle: 'italic', fontSize: 13,
              color: T.text, textDecoration: 'none',
            }}>Preferences →</a>
          <button onClick={() => { setOpen(false); onSignOut?.() }}
            style={{
              display: 'block', padding: '6px 0', width: '100%', textAlign: 'left',
              background: 'none', border: 'none',
              fontFamily: FONTS.body, fontStyle: 'italic', fontSize: 13,
              color: T.accent, cursor: 'pointer',
            }}>Sign out →</button>
        </div>
      )}
    </div>
  )
}
