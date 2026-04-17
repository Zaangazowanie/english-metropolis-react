import { useI18n } from '../i18n'

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang, supported, t } = useI18n()
  return (
    <div className={`em-lang-switcher ${className}`} role="group" aria-label={t('header.menu.language')}>
      {supported.map((code) => (
        <button
          key={code}
          type="button"
          className={`em-lang-btn ${lang === code ? 'is-active' : ''}`}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
        >
          {t(`lang.short.${code}`)}
        </button>
      ))}
    </div>
  )
}
