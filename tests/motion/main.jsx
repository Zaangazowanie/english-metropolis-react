import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from '../../src/i18n/index.jsx'
import { V3ThemeProvider } from '../../src/design/v3/ThemeProvider.jsx'
import { ThemeProvider } from '../../src/contexts/ThemeContext.jsx'
import Fixture from './fixture.jsx'

createRoot(document.getElementById('root')).render(<StrictMode><I18nProvider><ThemeProvider><V3ThemeProvider defaultMode="day"><BrowserRouter><Fixture/></BrowserRouter></V3ThemeProvider></ThemeProvider></I18nProvider></StrictMode>)
