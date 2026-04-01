import { useEffect, useState } from 'react'

function flattenCollocations(collocations) {
  if (!collocations || typeof collocations !== 'object') return []

  return Object.values(collocations)
    .flatMap((entries) => (Array.isArray(entries) ? entries : []))
    .map((entry) => entry?.phrase || '')
    .filter(Boolean)
}

function shuffle(items) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }
  return copy
}

function clampIndex(index, length) {
  if (!length) return 0
  return Math.max(0, Math.min(length - 1, index))
}

export default function Vocabulary({ data }) {
  const lessons = data?.lessons || []
  const keywords = data?.keywords || []
  const [searchTerm, setSearchTerm] = useState('')
  const [lessonFilter, setLessonFilter] = useState('all')
  const [mode, setMode] = useState('browse')
  const [browseView, setBrowseView] = useState('compact')
  const [topicFilter, setTopicFilter] = useState('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [studyDeck, setStudyDeck] = useState([])
  const [reviewedIds, setReviewedIds] = useState([])

  const baseKeywords = (mode === 'study' ? studyDeck : keywords).filter((keyword) => {
    const matchesLesson = lessonFilter === 'all' || keyword.lessonId === lessonFilter
    const search = searchTerm.trim().toLowerCase()
    const matchesSearch = !search || keyword.searchText.includes(search)
    return matchesLesson && matchesSearch
  })

  const filteredKeywords = baseKeywords.filter((keyword) => {
    const matchesTopic = topicFilter === 'all' || keyword.topics.includes(topicFilter)
    return matchesTopic
  })

  const activeKeyword = filteredKeywords[activeIndex] || null
  const availableTopics = [...new Set(baseKeywords.flatMap((keyword) => keyword.topics))].slice(0, 8)
  const reviewedInDeck = reviewedIds.filter((id) => filteredKeywords.some((kw) => kw.id === id))
  const reviewedPercent = filteredKeywords.length ? Math.round((reviewedInDeck.length / filteredKeywords.length) * 100) : 0

  useEffect(() => {
    setStudyDeck(shuffle(keywords))
  }, [keywords])

  useEffect(() => {
    setActiveIndex(0)
    setIsFlipped(false)
  }, [searchTerm, lessonFilter, mode, topicFilter])

  useEffect(() => {
    setActiveIndex((current) => clampIndex(current, filteredKeywords.length))
  }, [filteredKeywords.length])

  useEffect(() => {
    if (!activeKeyword) return
    setReviewedIds((current) => (current.includes(activeKeyword.id) ? current : [...current, activeKeyword.id]))
  }, [activeKeyword?.id])

  useEffect(() => {
    function onKeyDown(event) {
      const tag = (event.target?.tagName || '').toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return

      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        setActiveIndex((current) => clampIndex(current + 1, filteredKeywords.length))
      } else if (event.key === ' ') {
        event.preventDefault()
        setIsFlipped((current) => !current)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filteredKeywords.length])

  return (
    <section
      className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow px-5 py-4 sm:px-6 sm:py-4"
      id="page-vocabulary"
    >
      <div aria-hidden="true" className="glass-accent-orb orb-section-violet"></div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Vocabulary</p>
            <h2 className="font-headline text-4xl text-slate-900 mt-2">Anki Flashcard Viewer</h2>
            <p className="text-slate-500 mt-2 max-w-3xl">
              Flip through one keyword at a time, switch into shuffled study mode, or browse the full archive in paginated batches without leaving the lesson context.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),220px] xl:min-w-[420px]">
            <label className="block">
              <span className="sr-only">Search flashcards</span>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                  id="lessonKeywordSearch"
                  type="search"
                  className="w-full rounded-2xl border-slate-200 bg-white py-3.5 pl-12 pr-4 text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-blue-400"
                  placeholder="Search words, definitions, examples, or lesson titles"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </label>
            <label className="block">
              <span className="sr-only">Filter by lesson</span>
              <select
                id="lessonPackFilter"
                className="w-full rounded-2xl border-slate-200 bg-white py-3.5 pl-4 pr-10 text-sm text-slate-800 shadow-sm focus:border-blue-400 focus:ring-blue-400"
                value={lessonFilter}
                onChange={(event) => setLessonFilter(event.target.value)}
              >
                <option value="all">All lessons</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
          <div className="space-y-4">
            <div className="liquid-glass-card rounded-[1.5rem] border border-slate-200/70 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Viewer Mode</p>
                  <p id="vocabularyFocusLabel" className="mt-2 text-sm text-slate-600">
                    {filteredKeywords.length
                      ? `${filteredKeywords.length} keyword cards ready.`
                      : data?.lessonsError || 'No keywords match the current filters.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    id="flashcardBrowseModeBtn"
                    className={`flashcard-mode-toggle rounded-full border border-slate-200 bg-white/90 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700${mode === 'browse' ? ' is-active' : ''}`}
                    onClick={() => setMode('browse')}
                  >
                    Browse All
                  </button>
                  <button
                    type="button"
                    id="flashcardStudyModeBtn"
                    className={`flashcard-mode-toggle rounded-full border border-slate-200 bg-white/90 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700${mode === 'study' ? ' is-active' : ''}`}
                    onClick={() => {
                      setStudyDeck(shuffle(keywords))
                      setMode('study')
                    }}
                  >
                    Study Mode
                  </button>
                </div>
              </div>
              <div id="flashcardTopicFilters" className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-[0.16em] ${topicFilter === 'all' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'}`}
                  onClick={() => setTopicFilter('all')}
                >
                  All topics
                </button>
                {availableTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-[0.16em] ${topicFilter === topic ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'}`}
                    onClick={() => setTopicFilter(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
            <div className="flashcard-stage liquid-glass-card rounded-[1.75rem] border border-slate-200/70 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  id="flashcardPrevBtn"
                  className="flashcard-nav-btn"
                  aria-label="Previous flashcard"
                  onClick={() => setActiveIndex((current) => clampIndex(current - 1, filteredKeywords.length))}
                  disabled={!filteredKeywords.length}
                >
                  <span className="material-symbols-outlined">arrow_back_ios_new</span>
                </button>
                <div className="min-w-0 text-center">
                  <p id="flashcardCounter" className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    {filteredKeywords.length ? `${activeIndex + 1} of ${filteredKeywords.length}` : '0 of 0'}
                  </p>
                  <p id="flashcardLessonLabel" className="mt-1 text-sm text-slate-500">{activeKeyword?.lessonTitle || 'Lesson title'}</p>
                </div>
                <button
                  type="button"
                  id="flashcardNextBtn"
                  className="flashcard-nav-btn"
                  aria-label="Next flashcard"
                  onClick={() => setActiveIndex((current) => clampIndex(current + 1, filteredKeywords.length))}
                  disabled={!filteredKeywords.length}
                >
                  <span className="material-symbols-outlined">arrow_forward_ios</span>
                </button>
              </div>
              <button
                type="button"
                id="flashcardFlipButton"
                className="flashcard-scene mt-4 w-full text-left"
                aria-pressed={isFlipped ? 'true' : 'false'}
                onClick={() => setIsFlipped((current) => !current)}
              >
                <span className="sr-only">Flip flashcard</span>
                <div id="flashcardInner" className={`flashcard-inner${isFlipped ? ' is-flipped' : ''}`}>
                  <div className="flashcard-face flashcard-face-front">
                    <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">Front</p>
                    <div className="mt-6">
                      <h3 id="flashcardWord" className="font-headline text-4xl leading-tight text-slate-900 sm:text-5xl">
                        {activeKeyword?.word || 'Word'}
                      </h3>
                      <div className="mt-3 flex items-center gap-3">
                        <p id="flashcardIpa" className="font-mono text-sm text-sky-700">{activeKeyword?.ipa || '/ipa/'}</p>
                        <div
                          id="flashcardSpeakerBtn"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-400 transition-colors cursor-not-allowed"
                          title="Pronunciation playback stays unchanged in this phase"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                          </svg>
                        </div>
                      </div>
                      <p id="flashcardRespelling" className="mt-2 text-sm text-slate-500 italic">
                        {activeKeyword ? `${activeKeyword.cefr_level} • ${activeKeyword.mastery_level}` : 'respelling'}
                      </p>
                      <p className="mt-8 text-sm text-slate-600">
                        Press <kbd className="flashcard-kbd">Space</kbd> to flip, or click the card.
                      </p>
                    </div>
                  </div>
                  <div className="flashcard-face flashcard-face-back" style={{ minHeight: '300px' }}>
                    <div className="space-y-4">
                      <div>
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: '#666' }}>Definition</p>
                        <p id="flashcardDefinition" className="mt-2 text-base leading-relaxed" style={{ color: '#1e293b' }}>
                          {activeKeyword?.definition || 'Definition'}
                        </p>
                      </div>
                      <div>
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] ">Polish</p>
                        <p id="flashcardTranslation" className="mt-2 text-base leading-relaxed" style={{ color: '#1e293b' }}>
                          {activeKeyword?.translation || 'Translation'}
                        </p>
                      </div>
                      <div>
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] ">Example</p>
                        <p id="flashcardExample" className="mt-2 text-sm italic leading-relaxed" style={{ color: '#1e293b' }}>
                          {activeKeyword?.example || 'Example sentence'}
                        </p>
                      </div>
                      <div>
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] ">Collocations</p>
                        <p id="flashcardCollocations" className="mt-2 text-sm leading-relaxed" style={{ color: '#1e293b' }}>
                          {activeKeyword ? flattenCollocations(activeKeyword.collocations).slice(0, 4).join(', ') || 'No collocations saved.' : 'Collocations'}
                        </p>
                      </div>
                      <div>
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.24em] ">Lesson</p>
                        <p id="flashcardLessonBack" className="mt-2 text-sm leading-relaxed" style={{ color: '#1e293b' }}>
                          {activeKeyword?.lessonTitle || 'Lesson'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">
                  <span>Cards Reviewed</span>
                  <span id="flashcardReviewedLabel">{reviewedPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    id="flashcardReviewedBar"
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${reviewedPercent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
          <aside className="space-y-4">
            <div className="liquid-glass-card rounded-[1.5rem] border border-slate-200/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Browse All</p>
                  <p id="flashcardBrowsePageLabel" className="mt-2 text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">
                    {filteredKeywords.length ? `${activeIndex + 1}/${filteredKeywords.length}` : '0/0'}
                  </p>
                </div>
                <label className="relative shrink-0">
                  <span className="sr-only">Choose flashcard browse view</span>
                  <select
                    id="flashcardBrowseViewSelect"
                    className="flashcard-browse-view-select"
                    value={browseView}
                    onChange={(event) => setBrowseView(event.target.value)}
                  >
                    <option value="compact">Focused Card</option>
                    <option value="grid">Full Grid</option>
                  </select>
                </label>
              </div>
              <div id="flashcardBrowseCompactShell" className={`mt-4 flex items-center gap-3${browseView === 'compact' ? '' : ' hidden'}`}>
                <button
                  type="button"
                  id="flashcardBrowsePrevPage"
                  className="flashcard-browse-btn"
                  aria-label="Previous keyword"
                  onClick={() => setActiveIndex((current) => clampIndex(current - 1, filteredKeywords.length))}
                >
                  ←
                </button>
                <div id="flashcardBrowseList" className="flashcard-browse-compact-card min-w-0 flex-1">
                  {activeKeyword ? (
                    <button
                      type="button"
                      className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 text-left"
                      onClick={() => setIsFlipped((current) => !current)}
                    >
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{activeKeyword.lessonTopic}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{activeKeyword.word}</p>
                      <p className="mt-2 text-sm text-slate-600">{activeKeyword.translation}</p>
                    </button>
                  ) : (
                    <p className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                      No keyword cards available.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  id="flashcardBrowseNextPage"
                  className="flashcard-browse-btn"
                  aria-label="Next keyword"
                  onClick={() => setActiveIndex((current) => clampIndex(current + 1, filteredKeywords.length))}
                >
                  →
                </button>
              </div>
              <div id="flashcardBrowseGridShell" className={`mt-4${browseView === 'grid' ? '' : ' hidden'}`}>
                <div id="flashcardBrowseGrid" className="flashcard-browse-grid">
                  {filteredKeywords.slice(0, 48).map((keyword, index) => (
                    <button
                      key={keyword.id}
                      type="button"
                      className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${activeKeyword?.id === keyword.id ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      onClick={() => {
                        setActiveIndex(index)
                        setIsFlipped(false)
                      }}
                    >
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{keyword.lessonTopic}</p>
                      <p className="mt-2 text-base font-semibold text-slate-900">{keyword.word}</p>
                      <p className="mt-2 text-sm text-slate-600">{keyword.translation}</p>
                      <p className="mt-2 text-xs text-slate-500">{keyword.definition}</p>
                      <div className="mt-3 flex items-center gap-2 text-[10px] font-label font-bold uppercase tracking-[0.16em] text-slate-400">
                        <span>{keyword.cefr_level}</span>
                        <span>{keyword.mastery_level}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="liquid-glass-card rounded-[1.5rem] border border-slate-200/70 p-4">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Keyboard</p>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p><kbd className="flashcard-kbd">←</kbd> Previous card</p>
                <p><kbd className="flashcard-kbd">→</kbd> Next card</p>
                <p><kbd className="flashcard-kbd">Space</kbd> Flip card</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
