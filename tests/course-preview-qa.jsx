// Local interface QA: real student views with anonymous public teaching data.
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { V3ThemeProvider, useV3Theme } from '../src/design/v3/ThemeProvider.jsx'
import { I18nProvider, useI18n } from '../src/i18n'
import LessonsV3 from '../src/views/v3/Lessons.jsx'
import NextCourseLesson from '../src/views/v3/NextCourseLesson.jsx'
import { studentDemoData, DEMO_SLUG } from '../src/previews/student-demo-data.mjs'
import '../src/index.css'

function QA() {
  const { T, mode, setMode } = useV3Theme()
  const { lang, setLang } = useI18n()
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => { fetch('/api/console/student/next-lesson').then(r => r.json()).then(d => setPreview(d.lesson)) }, [])
  const data = { ...studentDemoData(lang), coursePreview: preview, coursePreviewError: error, refresh: () => setError(false) }
  return <main style={{ background: T.bg0, color: T.text, minHeight: '100vh', padding: '24px clamp(14px,4vw,56px)' }}>
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 15, marginBottom: 30 }}>
        <strong style={{ fontSize: 21, marginRight: 'auto' }}>English Metro.</strong>
        <small>Anonymous interface test</small>
        <button onClick={() => setLang(lang === 'en' ? 'pl' : 'en')}>{lang === 'en' ? 'Polski' : 'English'}</button>
        <button onClick={() => setMode(mode === 'day' ? 'night' : 'day')}>{mode === 'day' ? 'Night mode' : 'Day mode'}</button>
        <button onClick={() => { setPreview(null); setError(true) }}>Test retry</button>
      </div>
      {new URLSearchParams(location.search).get('compact') === '1'
        ? <NextCourseLesson data={data}/>
        : <LessonsV3 data={data} slug={DEMO_SLUG} basePath="/app"/>}
    </div>
  </main>
}
createRoot(document.getElementById('root')).render(<I18nProvider><V3ThemeProvider defaultMode="day"><BrowserRouter><QA/></BrowserRouter></V3ThemeProvider></I18nProvider>)
