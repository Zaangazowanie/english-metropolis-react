import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStudentAuth } from '../../contexts/StudentAuthContext.jsx'
import { EASE, FONT, G } from './tokens.js'
import { useV3Theme } from './ThemeProvider.jsx'
import { Avatar, Glass, Skyline } from './primitives.jsx'
import { PageTransition, TabInk } from './motion/index.js'
import VoiceSelector from '../../components/VoiceSelector.jsx'
import { useI18n } from '../../i18n'

// EN/PL pill toggle — restored to v3 chrome topbar (was lost in the v3 redesign).
// Reads + writes through the existing useI18n() context, so the en/pl JSON
// dictionaries (~500 keys) plug in immediately. Storage key: em.lang.
function V3LanguageToggle({ T, EASE }) {
  const { lang, setLang, supported, t, englishLevel, setEnglishLevel } = useI18n()
  return (
    <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
      <div data-component="language-toggle" role="group" aria-label={t('chrome.aria.languageGroup')}
        style={{
          display: 'inline-flex',
          border: `1px solid ${T.border}`,
          background: T.surface,
          borderRadius: 999,
          padding: 2,
          height: 38,
          transition: `all 180ms ${EASE.springFast}`,
        }}>
        {supported.map((code) => {
          const active = lang === code
          return (
            <button
              key={code}
              type="button"
              data-em-touch-target="lang-pill"
              onClick={() => {
                setLang(code)
                // Mark this as a manual choice so the auto-default-by-CEFR
                // logic in App.jsx leaves the language alone going forward.
                try { window.localStorage.setItem('em.lang.userExplicit', 'true') } catch { /* storage blocked */ }
              }}
              aria-pressed={active}
              title={code === 'pl' ? 'Polski' : 'English'}
              style={{
                minWidth: 36, height: 32,
                padding: '0 12px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                background: active ? T.brandInk || T.brand : 'transparent',
                color: active ? '#FFFFFF' : T.textSoft,
                fontFamily: FONT.body,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.08em',
                transition: `all 160ms ${EASE.springFast}`,
              }}
              className="em-press em-focus">
              {code.toUpperCase()}
            </button>
          )
        })}
      </div>
      {/* Simple-English level toggle — only visible when lang=en. Lets the
          student flip between B2 full-fidelity English (the original
          lessonSummary, ruleExplanation, etc.) and A2-simple English
          (lessonSummaryENSimple, ruleExplanationENSimple). Auto-defaulted
          to "simple" for A1/A2/B1 students in App.jsx. */}
      {lang === 'en' && (
        <button
          type="button"
          data-em-touch-target="english-level-toggle"
          onClick={() => {
            setEnglishLevel(englishLevel === 'simple' ? 'full' : 'simple')
            // Mark this as a manual choice so the auto-default-by-CEFR
            // in App.jsx doesn't override on next mount.
            try { window.localStorage.setItem('em.englishLevel.userExplicit', 'true') } catch { /* storage blocked */ }
          }}
          aria-pressed={englishLevel === 'simple'}
          title={englishLevel === 'simple' ? t('chrome.englishLevel.toFull') : t('chrome.englishLevel.toSimple')}
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 999,
            border: `1px solid ${T.border}`,
            background: englishLevel === 'simple' ? T.brandInk || T.brand : T.surface,
            color: englishLevel === 'simple' ? '#FFFFFF' : T.textSoft,
            cursor: 'pointer',
            fontFamily: FONT.body,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.04em',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            transition: `all 160ms ${EASE.springFast}`,
          }}
          className="em-press em-focus">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {englishLevel === 'simple' ? 'auto_awesome' : 'school'}
          </span>
          {englishLevel === 'simple'
            ? t('chrome.englishLevel.simpleLabel')
            : t('chrome.englishLevel.fullLabel')}
        </button>
      )}
    </div>
  )
}

// Tab definitions — labels resolved at render time via t('chrome.tab.*')
// so they update live when the EN/PL toggle flips. Key drives both the
// route segment and the i18n key (chrome.tab.<k>).
const TABS = [
  { k: 'dashboard', icon: 'dashboard' },
  { k: 'calendar', icon: 'calendar_month' },
  { k: 'vocabulary', icon: 'menu_book' },
  { k: 'lessons', icon: 'school' },
  { k: 'knowledge', icon: 'psychology' },
  { k: 'practice', icon: 'fitness_center' },
]

function TopBar({ slug, basePath = '', firstName = 'Student' }) {
  const { T, mode, setMode, isMobile } = useV3Theme()
  const location = useLocation()
  const navigate = useNavigate()
  const isDay = mode === 'day'
  const { studentLogout, isAdminStudentView } = useStudentAuth()
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const navRef = useRef(null)
  // Track <=480px so the avatar popover can pin to the viewport's right edge
  // (rather than the avatar's right edge, which bleeds offscreen on narrow
  // phones). Separate from the theme-context isMobile (which trips at 720px).
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 480px)').matches
  })

  useEffect(() => {
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    function onEsc(e) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 480px)')
    const handler = (e) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const currentTab = TABS.find(t => location.pathname.includes(`/${t.k}`))?.k || 'dashboard'
  const tabBase = slug ? `${basePath}/${slug}` : (basePath || '')

  const barBg = isDay ? 'rgba(255,255,255,0.82)' : 'rgba(6,4,16,0.72)'
  const initials = (firstName || 'St').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'ST'

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 40,
      background: barBg, backdropFilter: 'blur(18px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
      borderBottom: `1px solid ${T.border}`,
      paddingTop: 'max(env(safe-area-inset-top), 0px)' }}>
      <div style={{ maxWidth: 1840, margin: '0 auto',
        padding: isMobile ? '12px 16px' : '14px 28px',
        display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16,
        justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
        <Link to={`${tabBase}/dashboard`} aria-label={t('chrome.aria.home')} className="em-focus" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          textDecoration: 'none', color: T.text, flexShrink: 0 }}>
          {/* Brand mark — Chubby Bajla replaces the Skyline mark in the
              navbar permanently per Mike 2026-05-04. The original skyline
              still appears as the login-page silhouette + the Lessons-PDF
              wordmark chip; this swap is navbar-only. */}
          <img src="/brand/em-bajla-icon.webp" alt="" style={{
            height: 28, width: 28, borderRadius: 7, display: 'block',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}/>
          {/* Wordmark hides on mobile — the mascot alone carries the brand so the
              control cluster (lang / level / theme / avatar) fits without clipping. */}
          {!isMobile && (
          <span style={{ fontFamily: FONT.display, fontWeight: 600,
            fontSize: 18,
            letterSpacing: '-0.02em' }}>
            English<span style={{ background: G.brand, WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
            <span style={{ color: T.ember }}>.</span>
            <span style={{ fontSize: 13, color: T.textDim, marginLeft: -2 }}>com</span>
          </span>
          )}
        </Link>

        {/* Desktop: top horizontal nav. Mobile: hidden — navigation lives in
            <MobileTabBar> fixed at bottom instead. */}
        {!isMobile && (
          <nav ref={navRef} style={{ flex: 1, display: 'flex', gap: 4, overflowX: 'auto',
            scrollbarWidth: 'none', justifyContent: 'center', position: 'relative' }}
            className="v3-nav-scroll" aria-label={t('chrome.aria.primaryNav')}>
            {/* Sliding ink: one clipped layer behind the buttons glides to the
                active tab (clip-path, compositor-only). */}
            <TabInk navRef={navRef} activeKey={currentTab}
              background={isDay ? 'rgba(162,28,175,0.10)' : 'rgba(217,70,239,0.14)'}
              boxShadow={isDay ? 'none' : 'inset 0 0 0 1px rgba(217,70,239,0.18)'}/>
            {TABS.map(tab => {
              const active = currentTab === tab.k
              return (
                <button key={tab.k} data-tab={tab.k} onClick={() => navigate(`${tabBase}/${tab.k}`)}
                  aria-current={active ? 'page' : undefined}
                  className="em-press"
                  style={{
                    position: 'relative', zIndex: 1,
                    padding: '10px 16px', minHeight: 40,
                    border: 'none', cursor: 'pointer', borderRadius: 999,
                    background: 'transparent',
                    color: active ? (isDay ? T.brand : T.text) : T.textSoft,
                    fontFamily: FONT.body, fontSize: 13, fontWeight: active ? 600 : 500,
                    letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    transition: `color 180ms ${EASE.springFast}`,
                  }}>
                  <span className="material-symbols-outlined"
                    style={{ fontSize: 18, opacity: active ? 1 : 0.75,
                      fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                      transition: 'opacity 180ms ease, font-variation-settings 180ms ease' }}>{tab.icon}</span>
                  {t(`chrome.tab.${tab.k}`)}
                </button>
              )
            })}
          </nav>
        )}

        {/* Language toggle — EN / PL pair, surface on the topbar next to theme. */}
        <V3LanguageToggle T={T} EASE={EASE}/>

        {/* Theme toggle — surface on the topbar (was buried in avatar dropdown). */}
        <button
          data-component="theme-toggle"
          data-em-touch-target="theme-toggle"
          onClick={() => setMode(isDay ? 'night' : 'day')}
          aria-label={isDay ? t('chrome.theme.toNight') : t('chrome.theme.toDay')}
          title={isDay ? t('chrome.theme.night') : t('chrome.theme.day')}
          className="em-press em-focus"
          style={{
            flexShrink: 0,
            width: 38, height: 38, borderRadius: 12,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.textSoft,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: `all 180ms ${EASE.springFast}`,
          }}>
          <span key={mode} className="material-symbols-outlined em-content-in" style={{
            fontSize: 20,
            color: isDay ? T.amber : T.brandInk,
            fontVariationSettings: "'FILL' 1",
          }}>{isDay ? 'dark_mode' : 'light_mode'}</span>
        </button>

        {/* Voice selector — restored to the header (was missing from v3 chrome). */}
        {!isMobile && (
          <div data-component="voice-selector" style={{ flexShrink: 0,
            display: 'inline-flex', alignItems: 'center' }}>
            <VoiceSelector />
          </div>
        )}

        <div style={{ position: 'relative', flexShrink: 0 }} ref={menuRef} data-em-touch-target="avatar-wrap">
          <Avatar initials={initials} size={36} onClick={() => setMenuOpen(o => !o)}/>
          {menuOpen && (
            // Narrow-viewport (<=480px): pin the popover to the viewport's right
            // edge with an 8px margin so it never bleeds past the screen.
            // Wider: anchor to the avatar's right (parent-relative) as before.
            <div className="em-pop" role="menu" style={isNarrow
              ? { position: 'fixed', right: 8, top: 60, left: 'auto',
                  maxWidth: 'calc(100vw - 16px)', minWidth: 240,
                  background: isDay ? '#FFFFFF' : 'rgba(17,9,42,0.96)',
                  border: `1px solid ${T.borderHi}`, borderRadius: 16,
                  boxShadow: T.shadow, padding: 12, zIndex: 50 }
              : { position: 'absolute', right: 0, top: 48, minWidth: 240,
                  background: isDay ? '#FFFFFF' : 'rgba(17,9,42,0.96)',
                  border: `1px solid ${T.borderHi}`, borderRadius: 16,
                  boxShadow: T.shadow, padding: 12, zIndex: 50 }}>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`,
                marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{firstName}</div>
                <div style={{ fontSize: 13, color: T.textDim, marginTop: 2,
                  letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t('chrome.menu.studentLabel')}</div>
              </div>
              <div style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: T.textDim }}>{t('chrome.menu.themeHeader')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
                padding: '0 6px 8px' }}>
                {['night', 'day'].map(m => (
                  <button key={m} onClick={() => setMode(m)} className="em-press em-focus"
                    style={{ padding: '10px 8px', minHeight: 40, border: 'none', cursor: 'pointer',
                      borderRadius: 10, fontFamily: FONT.body, fontSize: 13,
                      textTransform: 'capitalize', fontWeight: 600,
                      background: mode === m ? G.brand : T.surface,
                      color: mode === m ? '#fff' : T.textSoft,
                      transition: `all 160ms ${EASE.springFast}` }}>
                    {m === 'night' ? t('chrome.theme.nightShort') : t('chrome.theme.dayShort')}
                  </button>
                ))}
              </div>
              <div style={{ height: 1, background: T.border, margin: '4px 0 6px' }} />
              <Link
                to={`${tabBase}/settings`}
                onClick={() => setMenuOpen(false)} className="em-press em-focus"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 10px', minHeight: 44,
                  color: T.textSoft, fontFamily: FONT.body, fontSize: 13,
                  textDecoration: 'none', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
                {t('header.menu.settings')}
              </Link>
              {/* Withdrawal is reached from Settings → Contract, and from the
                  public /withdraw page that needs no sign-in. Regulamin
                  § 11 ust. 4-5 requires the function to exist in the Service and
                  its location to be disclosed — the checkout consent text and the
                  legal pages do the disclosing. It does not have to sit next to
                  Log out on every screen. */}
              <button onClick={() => { studentLogout(); if (!isAdminStudentView) window.location.href = '/login' }} className="em-press em-focus"
                style={{ width: '100%', padding: '12px 10px', minHeight: 44, border: 'none',
                  cursor: 'pointer', background: 'transparent',
                  color: T.textSoft, fontFamily: FONT.body, fontSize: 13,
                  textAlign: 'left', borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
                  {isAdminStudentView ? 'End student view' : t('chrome.menu.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Bottom tab bar — mobile only. 5 primary destinations, fixed bottom, safe-area-
// aware. Replaces the horizontal chip strip that used to live inside TopBar on
// narrow viewports.
// Mobile tab labels live in i18n under chrome.mobile.<i18nKey>; keys are
// shorter than desktop chrome.tab.* so they fit the bottom bar pill width.
const MOBILE_TABS = [
  { k: 'dashboard', i18nKey: 'home', icon: 'dashboard' },
  { k: 'lessons', i18nKey: 'lessons', icon: 'history_edu' },
  { k: 'vocabulary', i18nKey: 'vocab', icon: 'menu_book' },
  { k: 'practice', i18nKey: 'practice', icon: 'mic' },
  { k: 'knowledge', i18nKey: 'library', icon: 'auto_stories' },
]

function MobileTabBar({ slug, basePath = '' }) {
  const { T, mode } = useV3Theme()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const tabBase = slug ? `${basePath}/${slug}` : (basePath || '')
  const currentTab = MOBILE_TABS.find(tab => location.pathname.includes(`/${tab.k}`))?.k || 'dashboard'
  return (
    <nav aria-label={t('chrome.aria.primaryMobileNav')} style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45,
      background: isDay ? 'rgba(255,252,248,0.92)' : 'rgba(12,8,28,0.88)',
      backdropFilter: 'blur(24px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
      borderTop: `1px solid ${T.border}`,
      paddingBottom: 'max(env(safe-area-inset-bottom), 6px)',
      paddingTop: 6,
      boxShadow: isDay
        ? '0 -10px 30px -12px rgba(100,50,180,0.08)'
        : '0 -10px 30px -12px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${MOBILE_TABS.length}, 1fr)`, position: 'relative' }}>
        {/* One indicator slides between columns (translateX, not re-mounted). */}
        <span aria-hidden style={{ position: 'absolute', top: 0, left: 0,
          width: `${100 / MOBILE_TABS.length}%`, height: 3, pointerEvents: 'none',
          transform: `translateX(${Math.max(0, MOBILE_TABS.findIndex(tab => tab.k === currentTab)) * 100}%)`,
          transition: `transform 320ms ${EASE.springFast}`,
          display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 24, height: 3, borderRadius: 3, background: G.brand,
            boxShadow: isDay ? 'none' : '0 0 10px rgba(217,70,239,0.6)' }}/>
        </span>
        {MOBILE_TABS.map(tab => {
          const active = currentTab === tab.k
          return (
            <button key={tab.k} onClick={() => navigate(`${tabBase}/${tab.k}`)}
              aria-current={active ? 'page' : undefined}
              className="em-press"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '8px 2px 6px', minHeight: 52, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
                color: active ? (isDay ? T.brand : T.text) : T.textDim,
                position: 'relative',
                transition: 'color 160ms' }}>
              <span className="material-symbols-outlined"
                style={{ fontSize: 22,
                  fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                  transform: active ? 'translateY(-1px)' : 'none',
                  transition: `font-variation-settings 180ms, transform 240ms ${EASE.springFast}` }}>
                {tab.icon}
              </span>
              <span style={{ fontSize: 13, fontFamily: FONT.body, lineHeight: 1.1,
                fontWeight: active ? 600 : 500, letterSpacing: 0, maxWidth: '100%',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t(`chrome.mobile.${tab.i18nKey}`)}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// iOS Safari only: 2.5s after first paint, prompt to "Add to Home Screen" so
// the PWA install flow is discoverable (iOS has no beforeinstallprompt). Once
// dismissed, stays dismissed via localStorage forever.
function InstallHint() {
  const { T, mode } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !/MSStream/.test(ua)
    const isStandalone = (window.navigator && window.navigator.standalone === true) ||
      window.matchMedia('(display-mode: standalone)').matches
    const dismissed = window.localStorage.getItem('em_install_hint_dismissed') === '1'
    if (isIOS && !isStandalone && !dismissed) {
      const id = window.setTimeout(() => setShow(true), 2500)
      return () => window.clearTimeout(id)
    }
  }, [])
  const dismiss = () => {
    setShow(false)
    window.localStorage.setItem('em_install_hint_dismissed', '1')
  }
  if (!show) return null
  return (
    <div style={{
      position: 'fixed', left: 12, right: 12,
      bottom: 'calc(78px + env(safe-area-inset-bottom))', zIndex: 55,
      background: isDay
        ? 'linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%)'
        : 'linear-gradient(180deg, rgba(28,18,58,0.98), rgba(14,9,32,0.98))',
      border: `1px solid ${T.borderHi}`, borderRadius: 18,
      padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start',
      boxShadow: isDay
        ? '0 20px 50px -12px rgba(100,50,180,0.25)'
        : '0 20px 50px -12px rgba(0,0,0,0.7), 0 0 40px -15px rgba(217,70,239,0.3)',
      animation: 'emModalIn 320ms cubic-bezier(0.2,1,0.3,1)',
    }}>
      <img src="/icon-apple-180.png?v=2" alt="" style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>
          {t('chrome.install.title')}
        </div>
        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.45 }}>
          {/* iOS Safari has no programmatic install API — instruct the user to use Safari's own
              share button at the bottom of the screen. The arrow + label make it explicit that
              the action lives outside this hint. */}
          <span style={{ color: T.brand, fontWeight: 700 }}>↓ {t('chrome.install.tapShare')} </span>
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: -2, color: T.brand }}>ios_share</span>
          <span style={{ color: T.brand, fontWeight: 700 }}> {t('chrome.install.shareButton')}</span>
          {t('chrome.install.then')} <strong style={{ color: T.textSoft }}>{t('chrome.install.addToHome')}</strong>.
        </div>
      </div>
      <button onClick={dismiss} aria-label={t('chrome.install.dismiss')}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer',
          color: T.textDim, padding: 4, display: 'flex' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
      </button>
    </div>
  )
}

export default function Chrome({ slug, basePath, firstName, children }) {
  const { T, mode, isMobile } = useV3Theme()
  const location = useLocation()
  // Tab segment after the slug drives the page transition key, so a query
  // change inside a tab (filters, openLesson) does not replay the entrance.
  const routeKey = TABS.find(tab => location.pathname.includes(`/${tab.k}`))?.k
    || location.pathname.split('/').filter(Boolean).slice(-1)[0] || 'dashboard'
  return (
    <div style={{ minHeight: '100vh', background: T.pageBg, color: T.text,
      fontFamily: FONT.body, position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden style={{
        position: 'absolute', inset: '-20%', pointerEvents: 'none',
        background: mode === 'day' ? G.auroraDay : G.aurora,
        opacity: 1, filter: 'blur(40px)',
        animation: 'emAurora 22s ease-in-out infinite alternate' }}/>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <TopBar slug={slug} basePath={basePath} firstName={firstName}/>
        <main style={{ maxWidth: 1840, margin: '0 auto',
          padding: isMobile
            ? '16px 12px calc(80px + env(safe-area-inset-bottom))'
            : '24px 16px 80px',
          position: 'relative' }}>
          <PageTransition routeKey={routeKey}>{children}</PageTransition>
        </main>
      </div>
      {isMobile && <MobileTabBar slug={slug} basePath={basePath}/>}
      {isMobile && <InstallHint/>}
      {/* Floating AI chat — disabled in favour of the legacy
          /students/conversa-widget-v4g.js script (loaded from index.html),
          which renders the polished gradient pill ("Chat with your AI tutor").
          Re-enable only if the legacy script is removed and we want this
          minimal-circle FAB back. */}
      {/* The tutor widget is the injected /students/conversa-widget-v5.js (index.html); the React ChatWidget is not mounted. */}
    </div>
  )
}
