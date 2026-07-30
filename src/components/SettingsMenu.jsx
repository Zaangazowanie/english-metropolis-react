import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useTheme } from '../contexts/ThemeContext'

export default function SettingsMenu({ userName = 'Guest', userEmail = '' }) {
  const [open, setOpen] = useState(false)
  const { t, lang, setLang, supported } = useI18n()
  const { theme, setTheme } = useTheme()
  const rootRef = useRef(null)

  useEffect(() => {
    function onDown(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  const initials = (userName || 'U').split(' ').filter(Boolean).map(s => s[0]?.toUpperCase()).slice(0, 2).join('') || 'U'

  return (
    <div className="em-settings-menu-root" ref={rootRef}>
      <button
        type="button"
        className="em-settings-trigger"
        aria-label={t('header.menu.settings')}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className="em-avatar-circle">{initials}</span>
      </button>
      {open && (
        <div className="em-settings-pop" role="menu">
          <div className="em-settings-pop-head">
            <span className="em-avatar-circle em-avatar-lg">{initials}</span>
            <div className="em-settings-pop-name">
              <strong>{userName}</strong>
              {userEmail ? <small>{userEmail}</small> : null}
            </div>
          </div>
          <div className="em-settings-pop-section">
            <span className="em-settings-pop-label">{t('header.menu.language')}</span>
            <div className="em-settings-pop-row">
              {supported.map(code => (
                <button
                  key={code}
                  type="button"
                  className={`em-pop-chip ${lang === code ? 'is-active' : ''}`}
                  onClick={() => setLang(code)}
                >{t(`lang.short.${code}`)}</button>
              ))}
            </div>
          </div>
          <div className="em-settings-pop-section">
            <span className="em-settings-pop-label">{t('header.menu.theme')}</span>
            <div className="em-settings-pop-row">
              {['light', 'dark', 'system'].map(th => (
                <button
                  key={th}
                  type="button"
                  className={`em-pop-chip ${theme === th ? 'is-active' : ''}`}
                  onClick={() => setTheme(th)}
                >{t(`settings.appearance.theme.${th}`)}</button>
              ))}
            </div>
          </div>
          <div className="em-settings-pop-divider" />
          <Link to="/settings" className="em-pop-link" onClick={() => setOpen(false)}>
            <span className="material-symbols-outlined text-[16px]">tune</span>
            {t('header.menu.settings')}
          </Link>
          <Link to="/withdraw" className="em-pop-link" onClick={() => setOpen(false)}>
            <span className="material-symbols-outlined text-[16px]">assignment_return</span>
            {t('chrome.menu.withdraw')}
          </Link>
          <Link to="/logout" className="em-pop-link" onClick={() => setOpen(false)}>
            <span className="material-symbols-outlined text-[16px]">logout</span>
            {t('header.menu.logout')}
          </Link>
        </div>
      )}
    </div>
  )
}
