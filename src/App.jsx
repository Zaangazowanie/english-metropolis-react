import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './LoginPage.jsx'
import StudentLayout from './StudentLayout.jsx'
import Dashboard from './views/Dashboard.jsx'
import Vocabulary from './views/Vocabulary.jsx'
import Lessons from './views/Lessons.jsx'
import Quiz from './views/Quiz.jsx'

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  )
}

export default App
