import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './views/Dashboard.jsx'
import Vocabulary from './views/Vocabulary.jsx'
import Lessons from './views/Lessons.jsx'
import Quiz from './views/Quiz.jsx'

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vocabulary" element={<Vocabulary />} />
        <Route path="/lessons" element={<Lessons />} />
        <Route path="/quiz" element={<Quiz />} />
      </Routes>
    </div>
  )
}

export default App
