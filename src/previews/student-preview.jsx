import React, { useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { I18nProvider, useI18n } from '../i18n'
import { ThemeProvider } from '../contexts/ThemeContext.jsx'
import { V3ThemeProvider, useV3Theme } from '../design/v3/ThemeProvider.jsx'
import { FONT } from '../design/v3/tokens.js'
import VocabularyV3 from '../views/v3/Vocabulary.jsx'
import LessonsV3 from '../views/v3/Lessons.jsx'
import { DEMO_LESSON_ID, DEMO_SLUG, LESSON_TOUR, studentDemoData } from './student-demo-data.mjs'
import '../index.css'

const options = new URLSearchParams(location.search)
const feature = options.get('feature') === 'analysis' ? 'analysis' : 'vocabulary'
if (!location.hash) history.replaceState(null, '', `${location.pathname}${location.search}#/app/${DEMO_SLUG}/${feature === 'analysis' ? `lessons?openLesson=${DEMO_LESSON_ID}` : 'vocabulary'}`)
const send = data => { if (window.parent !== window) window.parent.postMessage(data, location.origin) }

export function Preview() {
  const { lang, setLang } = useI18n(), { T, mode, setMode } = useV3Theme()
  const navigate = useNavigate(), route = useLocation()
  const data = useMemo(() => studentDemoData(lang), [lang])

  useEffect(() => {
    if (window.parent !== window) return
    const initialLang = options.get('lang'), initialMode = options.get('mode')
    if (initialLang === 'en' || initialLang === 'pl') setLang(initialLang)
    if (initialMode === 'day' || initialMode === 'night') setMode(initialMode)
  }, [setLang, setMode])
  useEffect(() => {
    document.body.style.background = T.bg0
    document.body.style.color = T.text
    document.body.style.fontFamily = FONT.body
  }, [T])
  useEffect(() => {
    let timer
    function locateStep(index) {
      const step = LESSON_TOUR[index]?.[0]
      if (!step) return
      if (!document.querySelector('[data-lesson-content]')) {
        navigate(`/app/${DEMO_SLUG}/lessons?openLesson=${DEMO_LESSON_ID}&tour=${Date.now()}`)
        timer = setTimeout(() => locateStep(index), 150)
        return
      }
      const disclosure = document.querySelector('[data-lesson-action="analysis"]')
      if (step !== 'keywords' && disclosure?.getAttribute('aria-expanded') !== 'true') disclosure.click()
      timer = setTimeout(() => {
        if (step === 'deeper') {
          const details = document.querySelector('[data-lesson-action="deeper"]')
          if (details && !details.parentElement.open) details.click()
        }
        const target = step === 'keywords' ? document.querySelector('[data-lesson-keyword]')
          : step === 'analysis' ? disclosure
          : step === 'deeper' ? document.querySelector('[data-lesson-action="deeper"]')
          : document.querySelector(`[data-lesson-section="${step}"]`)
        const scroll = document.querySelector('[data-lesson-scroll]')
        if (target && scroll) scroll.scrollTo({ top: target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 20,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
        send({ type: 'em-preview-step-complete', index })
      }, 80)
    }
    const onMessage = event => {
      if (event.origin !== location.origin || event.source !== window.parent) return
      if (event.data?.type === 'em-preview-config') {
        if (['en', 'pl'].includes(event.data.lang)) setLang(event.data.lang)
        if (['day', 'night'].includes(event.data.mode)) setMode(event.data.mode)
      }
      if (event.data?.type === 'em-preview-step') { clearTimeout(timer); locateStep(event.data.index) }
      if (event.data?.type === 'em-preview-reset') {
        navigate(`/app/${DEMO_SLUG}/${feature === 'analysis' ? `lessons?openLesson=${DEMO_LESSON_ID}&tour=${Date.now()}` : 'vocabulary'}`)
      }
    }
    const onInteraction = event => { if (event.isTrusted) send({ type: 'em-preview-interaction' }) }
    window.addEventListener('message', onMessage)
    document.addEventListener('pointerdown', onInteraction, true)
    document.addEventListener('wheel', onInteraction, { passive: true })
    document.addEventListener('keydown', onInteraction, true)
    send({ type: 'em-preview-ready', feature })
    return () => {
      clearTimeout(timer); window.removeEventListener('message', onMessage)
      document.removeEventListener('pointerdown', onInteraction, true)
      document.removeEventListener('wheel', onInteraction)
      document.removeEventListener('keydown', onInteraction, true)
    }
  }, [navigate, setLang, setMode])

  useEffect(() => {
    if (route.pathname.endsWith('/practice')) send({ type: 'em-preview-open-account' })
  }, [route.pathname])
  return <div data-student-feature={feature} data-v3-mode={mode} style={{ minHeight: '100vh', background: T.bg0, color: T.text, fontFamily: FONT.body }}>
    <Routes>
      <Route path="/app/:slug/vocabulary" element={<VocabularyV3 data={data} slug={DEMO_SLUG} basePath="/app"/>}/>
      <Route path="/app/:slug/lessons" element={<LessonsV3 data={data} slug={DEMO_SLUG} basePath="/app"/>}/>
      <Route path="*" element={<a href="/signup" target="_top">{lang === 'pl' ? 'Załóż konto' : 'Create your account'}</a>}/>
    </Routes>
  </div>
}
createRoot(document.getElementById('root')).render(<ThemeProvider><I18nProvider><V3ThemeProvider defaultMode="night"><HashRouter><Preview/></HashRouter></V3ThemeProvider></I18nProvider></ThemeProvider>)
