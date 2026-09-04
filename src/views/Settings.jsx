import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useTheme } from '../contexts/ThemeContext'
import { useStudentAuth } from '../contexts/StudentAuthContext.jsx'

const PREFS_KEY = 'em.settings.prefs'
function readPrefs() {
  try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') } catch { return {} }
}
function writePrefs(patch) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch })) } catch { /* storage blocked */ }
}

function Section({ title, children }) {
  return (
    <section className="em-settings-section">
      <h2 className="em-settings-section-title">{title}</h2>
      <div className="em-settings-section-body">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }) {
  return (
    <label className="em-settings-row">
      <div className="em-settings-row-text">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="em-settings-row-control">{children}</div>
    </label>
  )
}

function SegChoice({ value, options, onChange }) {
  return (
    <div className="em-seg">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`em-seg-btn ${value === opt.value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >{opt.label}</button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`em-toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export default function Settings() {
  const { t, lang, setLang, supported } = useI18n()
  const { theme, setTheme, fontSize, setFontSize, motion, setMotion, dyslexicFont, setDyslexicFont } = useTheme()
  const { studentUser } = useStudentAuth()

  // Profile is the school record (read-only here). Preferences with no
  // backend yet persist on this device only, and the page says so.
  const profile = { name: studentUser?.name || '', email: studentUser?.email || studentUser?.googleEmail || '' }
  const [notif, setNotif] = useState(() => ({ emailDigest: false, studyReminders: true, ...(readPrefs().notif || {}) }))
  const [audio, setAudio] = useState(() => ({ autoplay: true, ...(readPrefs().audio || {}) }))
  const [savedBanner, setSavedBanner] = useState(false)
  const flashSaved = () => { setSavedBanner(true); setTimeout(() => setSavedBanner(false), 2000) }
  const updateNotif = (patch) => setNotif(n => { const next = { ...n, ...patch }; writePrefs({ notif: next }); flashSaved(); return next })
  const updateAudio = (patch) => setAudio(a => { const next = { ...a, ...patch }; writePrefs({ audio: next }); flashSaved(); return next })

  return (
    <div className="em-settings-page">
      <header className="em-settings-header">
        <h1>{t('settings.title')}</h1>
        {savedBanner && <span className="em-settings-saved">{t('settings.savedAll')}</span>}
      </header>

      <Section title={t('settings.section.profile')}>
        <div className="em-settings-form">
          <Row label={t('settings.profile.name')}>
            <input type="text" className="em-input" value={profile.name} readOnly aria-readonly="true"/>
          </Row>
          <Row label={t('settings.profile.email')} hint={t('settings.profile.managedHint')}>
            <input type="email" className="em-input" value={profile.email} readOnly aria-readonly="true"/>
          </Row>
        </div>
      </Section>

      <Section title={t('settings.section.appearance')}>
        <Row label={t('settings.appearance.theme')}>
          <SegChoice
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: t('settings.appearance.theme.light') },
              { value: 'dark', label: t('settings.appearance.theme.dark') },
              { value: 'system', label: t('settings.appearance.theme.system') },
            ]}
          />
        </Row>
        <Row label={t('settings.appearance.fontSize')}>
          <SegChoice
            value={fontSize}
            onChange={setFontSize}
            options={[
              { value: 'small', label: t('settings.appearance.fontSize.small') },
              { value: 'regular', label: t('settings.appearance.fontSize.regular') },
              { value: 'large', label: t('settings.appearance.fontSize.large') },
            ]}
          />
        </Row>
        <Row label={t('settings.appearance.animation')}>
          <SegChoice
            value={motion}
            onChange={setMotion}
            options={[
              { value: 'full', label: t('settings.appearance.animation.full') },
              { value: 'reduced', label: t('settings.appearance.animation.reduced') },
              { value: 'none', label: t('settings.appearance.animation.none') },
            ]}
          />
        </Row>
        <Row label={t('settings.appearance.dyslexicFont')}>
          <Toggle checked={dyslexicFont} onChange={setDyslexicFont} />
        </Row>
      </Section>

      <Section title={t('settings.section.language')}>
        <Row label={t('settings.language.label')}>
          <SegChoice
            value={lang}
            onChange={setLang}
            options={supported.map(code => ({ value: code, label: t(`lang.${code}`) }))}
          />
        </Row>
      </Section>

      <Section title={t('settings.section.notifications')}>
        <Row label={t('settings.notifications.emailDigest')} hint={t('settings.notifications.comingSoon')}>
          <Toggle checked={notif.emailDigest} onChange={v => updateNotif({ emailDigest: v })} />
        </Row>
        <Row label={t('settings.notifications.studyReminders')}>
          <Toggle checked={notif.studyReminders} onChange={v => updateNotif({ studyReminders: v })} />
        </Row>
      </Section>

      <Section title={t('settings.section.audio')}>
        <Row label={t('settings.audio.autoplay')}>
          <Toggle checked={audio.autoplay} onChange={v => updateAudio({ autoplay: v })} />
        </Row>
      </Section>

      <Section title={t('settings.section.contract')}>
        <div className="em-settings-row">
          <div className="em-settings-row-text">
            <strong>{t('settings.contract.withdraw')}</strong>
            <span>{t('settings.contract.withdrawHint')}</span>
          </div>
          <div className="em-settings-row-control">
            <Link to="/withdraw" className="em-btn em-btn-ghost">
              {t('settings.contract.open')}
            </Link>
          </div>
        </div>
      </Section>

      <Section title={t('settings.section.security')}>
        <div className="em-settings-row">
          <div className="em-settings-row-text">
            <strong>{t('settings.security.changePassword')}</strong>
            <span>{t('settings.security.resetHint')}</span>
          </div>
          <div className="em-settings-row-control">
            <Link to="/reset" className="em-btn em-btn-primary">{t('settings.security.resetLink')}</Link>
          </div>
        </div>
      </Section>

      <Section title={t('settings.section.data')}>
        <Row label={t('settings.data.downloadMyData')} hint={t('settings.data.requestHint')}>
          <a href="mailto:hello@englishmetro.com?subject=Data%20export" className="em-btn em-btn-ghost">{t('settings.data.requestExport')}</a>
        </Row>
        <Row label={t('settings.data.deleteAccount')} hint={t('settings.data.deleteAccountWarning')}>
          <a href="mailto:hello@englishmetro.com?subject=Delete%20my%20account" className="em-btn em-btn-danger">{t('settings.data.requestExport')}</a>
        </Row>
      </Section>
    </div>
  )
}
