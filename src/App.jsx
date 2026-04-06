import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './LoginPage.jsx'
import StudentLayout from './StudentLayout.jsx'
import Dashboard from './views/Dashboard.jsx'
import Vocabulary from './views/Vocabulary.jsx'
import Lessons from './views/Lessons.jsx'
import Quiz from './views/Quiz.jsx'

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="text-center">
        <p className="font-headline text-6xl text-slate-300 mb-4">404</p>
        <h1 className="font-headline text-2xl text-slate-800 mb-2">Page not found</h1>
        <p className="text-slate-500 mb-6">The page you're looking for doesn't exist or has been moved.</p>
        <a
          href="/login"
          className="inline-block px-6 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 transition-colors"
        >
          Go to Login
        </a>
      </div>
    </div>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app/:slug" element={<StudentLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="vocabulary" element={<Vocabulary />} />
          <Route path="lessons" element={<Lessons />} />
          <Route path="quiz" element={<Quiz />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}

export default App
