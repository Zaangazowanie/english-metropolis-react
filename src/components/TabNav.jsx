import { NavLink, useParams, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'

const TABS = [
  { slug: 'dashboard', icon: 'dashboard', key: 'nav.dashboard' },
  { slug: 'vocabulary', icon: 'translate', key: 'nav.vocabulary' },
  { slug: 'lessons', icon: 'menu_book', key: 'nav.lessons' },
  { slug: 'knowledge', icon: 'library_books', key: 'nav.knowledge' },
  { slug: 'practice', icon: 'sports_esports', key: 'nav.practice' },
]

export default function TabNav() {
  const { t } = useI18n()
  const params = useParams()
  const location = useLocation()
  const match = location.pathname.match(/^\/app\/([^\/]+)/)
  const prefix = match ? `/app/${match[1]}` : (location.pathname.startsWith('/app') ? '/app' : '')

  return (
    <nav aria-label="Primary" className="-mx-1">
      <div className="flex gap-1 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:gap-2 sm:overflow-visible scrollbar-hide" id="topTabNav">
        {TABS.map((tab) => (
          <NavLink
            key={tab.slug}
            to={`${prefix}/${tab.slug}`}
            className={({ isActive }) => `tab-chip shrink-0 whitespace-nowrap${isActive ? ' is-active' : ''}`}
          >
            <span className="material-symbols-outlined text-base sm:hidden">{tab.icon}</span>
            <span className="sm:hidden text-[11px]">{t(tab.key)}</span>
            <span className="hidden sm:inline">{t(tab.key)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
