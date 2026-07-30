import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useTheme } from '../contexts/ThemeContext'

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

  const [profile, setProfile] = useState({ name: '', email: '' })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [notif, setNotif] = useState({ emailDigest: false, studyReminders: true })
  const [audio, setAudio] = useState({ autoplay: true })
  const [savedBanner, setSavedBanner] = useState(false)

  function onSaveProfile(e) {
    e.preventDefault()
    setSavedBanner(true)
    setTimeout(() => setSavedBanner(false), 2000)
  }

  function onChangePassword(e) {
    e.preventDefault()
    setSavedBanner(true)
    setTimeout(() => setSavedBanner(false), 2000)
  }

  return (
    <div className="em-settings-page">
      <header className="em-settings-header">
        <h1>{t('settings.title')}</h1>
        {savedBanner && <span className="em-settings-saved">{t('settings.savedAll')}</span>}
      </header>

      <Section title={t('settings.section.profile')}>
        <form onSubmit={onSaveProfile} className="em-settings-form">
          <Row label={t('settings.profile.name')}>
            <input
              type="text"
              className="em-input"
              value={profile.name}
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
              placeholder="—"
            />
          </Row>
          <Row label={t('settings.profile.email')}>
            <input
              type="email"
              className="em-input"
              value={profile.email}
              onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
              placeholder="you@englishmetro.com"
            />
          </Row>
          <button type="submit" className="em-btn em-btn-primary">{t('common.save')}</button>
        </form>
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
        <Row label={t('settings.notifications.emailDigest')}>
          <Toggle checked={notif.emailDigest} onChange={v => setNotif(n => ({ ...n, emailDigest: v }))} />
        </Row>
        <Row label={t('settings.notifications.studyReminders')}>
          <Toggle checked={notif.studyReminders} onChange={v => setNotif(n => ({ ...n, studyReminders: v }))} />
        </Row>
      </Section>

      <Section title={t('settings.section.audio')}>
        <Row label={t('settings.audio.autoplay')}>
          <Toggle checked={audio.autoplay} onChange={v => setAudio(a => ({ ...a, autoplay: v }))} />
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
        <form onSubmit={onChangePassword} className="em-settings-form">
          <Row label={t('settings.security.currentPassword')}>
            <input type="password" className="em-input" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
          </Row>
          <Row label={t('settings.security.newPassword')}>
            <input type="password" className="em-input" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} />
          </Row>
          <Row label={t('settings.security.confirmPassword')}>
            <input type="password" className="em-input" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
          </Row>
          <button type="submit" className="em-btn em-btn-primary">{t('settings.security.updatePassword')}</button>
        </form>
      </Section>

      <Section title={t('settings.section.data')}>
        <Row label={t('settings.data.downloadMyData')}>
          <button type="button" className="em-btn em-btn-ghost">{t('common.save')}</button>
        </Row>
        <Row label={t('settings.data.deleteAccount')} hint={t('settings.data.deleteAccountWarning')}>
          <button type="button" className="em-btn em-btn-danger">{t('settings.data.deleteAccount')}</button>
        </Row>
      </Section>
    </div>
  )
}
