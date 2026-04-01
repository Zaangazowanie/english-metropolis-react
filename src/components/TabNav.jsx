import { NavLink } from 'react-router-dom'

const tabs = [
  { label: 'Dashboard', to: '/dashboard', target: 'page-dashboard' },
  { label: 'Vocabulary', to: '/vocabulary', target: 'page-vocabulary' },
  { label: 'Lessons', to: '/lessons', target: 'page-lessons' },
  { label: 'Quiz', to: '/quiz', target: 'page-quiz' },
]

export default function TabNav() {
  return (
    <nav aria-label="Primary" className="-mx-1 overflow-x-auto">
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-4" id="topTabNav">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            data-section-target={tab.target}
            className={({ isActive }) => `tab-chip${isActive ? ' is-active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
