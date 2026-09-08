import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { METRICS, MetricLineChart } from '../../components/analytics/AnalyticsPrimitives.jsx'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import { REPORT_CHAPTERS, SAMPLE_SCORES, SAMPLE_PROGRESS, nextReportChapter, REPORT_STEP_MS } from './analysis-preview-data.mjs'
import { PREVIEW_CLIPS } from './preview-clips.mjs'
import './feature-previews.css'

function Icon({ name }) { return <span className="material-symbols-outlined" aria-hidden="true">{name}</span> }
const METRIC_PL = ['Słownictwo', 'Gramatyka', 'Płynność', 'Wymowa', 'Komunikacja']
const METRIC_EXPLANATIONS = [
  ['You used precise travel vocabulary. Next, bring the same range into longer answers.', 'Używasz precyzyjnego słownictwa podróżniczego. Teraz wykorzystaj je w dłuższych odpowiedziach.'],
  ['Your meaning stays clear. Prepositions and articles need more consistency when you speak quickly.', 'Sens wypowiedzi jest jasny. Przyimki i przedimki wymagają utrwalenia przy szybszym mówieniu.'],
  ['You connected ideas with examples. A few shorter pauses would make your story easier to follow.', 'Łączysz myśli z przykładami. Krótsze pauzy ułatwią śledzenie Twojej historii.'],
  ['Most words were clear. Keep practising the vowel in “berth” and the stress in longer words.', 'Większość słów brzmi wyraźnie. Ćwicz samogłoskę w „berth” i akcent w dłuższych słowach.'],
  ['You explained your preferences and checked your partner understood your point.', 'Wyjaśniasz swoje preferencje i upewniasz się, że rozmówca rozumie Twoją myśl.'],
]

function SampleDrill({ pl, onInteract }) {
  const [answer, setAnswer] = useState('')
  return <div className="em-report-drill">
    <p>{pl ? 'Spróbuj ćwiczenia z tej poprawki' : 'Try a drill from this correction'}</p>
    <h4>It depends <span>___</span> the weather.</h4>
    <div className="em-report-answers" role="group" aria-label={pl ? 'Wybierz przyimek' : 'Choose the preposition'}>{['of', 'on', 'from'].map(option => <button key={option} aria-pressed={answer === option} className={answer === option ? (option === 'on' ? 'is-correct' : 'is-retry') : ''} onClick={() => { onInteract(); setAnswer(option) }}>{option}</button>)}</div>
    <div className="em-report-feedback" role="status">{answer ? (answer === 'on' ? (pl ? 'Tak! Zapamiętaj całe wyrażenie: depend on.' : 'Exactly. Keep the whole expression together: depend on.') : (pl ? 'Spróbuj jeszcze raz. Po angielsku mówimy „depend on”.' : 'Try again. In English, we say “depend on”.')) : (pl ? 'Jedno zdanie. Krótka powtórka. Konkretna informacja zwrotna.' : 'One sentence. A quick attempt. Useful feedback.')}</div>
  </div>
}

function ReportContent({ id, pl, onInteract, go }) {
  const [metric, setMetric] = useState(1), [selectedWord, setSelectedWord] = useState('mural'), [flipped, setFlipped] = useState(false)
  const t = (en, polish) => pl ? polish : en
  if (id === 'overview') return <>
    <div className="em-report-lesson-heading"><div><small>{t('Sample lesson · 60 minutes', 'Przykładowa lekcja · 60 minut')}</small><h3>{t('A weekend in a new city', 'Weekend w nowym mieście')}</h3><p>{t('Travel · Culture · Explaining your preferences', 'Podróże · Kultura · Wyrażanie preferencji')}</p></div><div className="em-report-cefr"><strong>B2</strong><span>{t('sample estimate', 'przykładowa ocena')}</span></div></div>
    <div className="em-report-score-grid" role="group" aria-label={t('Explore the five skill scores', 'Poznaj pięć wyników umiejętności')}>
      {METRICS.map((item, index) => <button key={item.key} aria-pressed={metric === index} onClick={() => { onInteract(); setMetric(index) }}><Icon name={item.icon}/><strong>{SAMPLE_SCORES[item.key]}<small>/100</small></strong><span>{pl ? METRIC_PL[index] : item.shortLabel}</span></button>)}
    </div>
    <div className="em-report-observation"><Icon name={METRICS[metric].icon}/><div><h4>{pl ? METRIC_PL[metric] : METRICS[metric].label}</h4><p>{METRIC_EXPLANATIONS[metric][pl ? 1 : 0]}</p></div></div>
    <p className="em-report-fineprint">{t('Illustrative AI feedback from a fictional lesson. Scores and CEFR estimates are learning guidance, not an exam result.', 'Przykładowa informacja zwrotna AI z fikcyjnej lekcji. Wyniki i szacowany CEFR to wskazówki do nauki, nie wynik egzaminu.')}</p>
  </>
  if (id === 'summary') return <>
    <div className="em-report-topic-list"><span>{t('Travel plans', 'Plany podróży')}</span><span>{t('Art & culture', 'Sztuka i kultura')}</span><span>{t('Giving reasons', 'Podawanie powodów')}</span></div>
    <h3>{t('The lesson, in your own context', 'Lekcja w Twoim kontekście')}</h3>
    <ul className="em-report-points"><li>{t('You compared two ways to spend a weekend and explained why you would choose an overnight train.', 'Porównujesz dwa pomysły na weekend i wyjaśniasz, dlaczego wybierasz nocny pociąg.')}</li><li>{t('You described a street mural and discussed how public art changes the feeling of a neighbourhood.', 'Opisujesz mural i rozmawiasz o tym, jak sztuka zmienia charakter dzielnicy.')}</li><li>{t('You practised giving reasons with “because”, “although” and “it depends on”.', 'Ćwiczysz uzasadnianie opinii za pomocą „because”, „although” i „it depends on”.')}</li></ul>
    <details className="em-report-details" onToggle={event => { if (event.currentTarget.open) onInteract() }}><summary>{t('Open the deeper analysis', 'Otwórz pogłębioną analizę')}<Icon name="expand_more"/></summary><p>{t('Your extended answers were easy to follow when you started with a clear preference. Under time pressure, Polish preposition patterns sometimes returned. The next lesson can revisit the same language in a new travel situation.', 'Dłuższe odpowiedzi były czytelne, gdy zaczynały się od wyraźnej preferencji. Pod presją czasu czasem wracały polskie wzorce przyimków. Na kolejnej lekcji możesz przećwiczyć te same zwroty w nowej sytuacji podróżniczej.')}</p></details>
  </>
  if (id === 'vocabulary') return <>
    <p className="em-report-lead">{t('Meaning, pronunciation and a sentence you can make your own.', 'Znaczenie, wymowa i zdanie, które możesz wykorzystać.')}</p>
    <div className="em-report-word-tabs" role="group" aria-label={t('Lesson vocabulary', 'Słownictwo z lekcji')}>{Object.keys(PREVIEW_CLIPS).map(word => <button key={word} aria-pressed={selectedWord === word} onClick={() => { onInteract(); setSelectedWord(word); setFlipped(false) }}>{word}</button>)}</div>
    <button className={`em-report-flashcard${flipped ? ' is-flipped' : ''}`} onClick={() => { onInteract(); setFlipped(value => !value) }} aria-label={t('Flip sample flashcard', 'Odwróć przykładową fiszkę')}><small>{flipped ? t('Meaning in Polish', 'Znaczenie') : t('Your lesson word', 'Twoje słowo z lekcji')}</small><strong>{flipped ? PREVIEW_CLIPS[selectedWord].meaning : selectedWord}</strong><span>{PREVIEW_CLIPS[selectedWord].ipa}</span><span className="em-report-flash-hint"><Icon name="replay"/>{t('Click to flip', 'Kliknij, aby odwrócić')}</span></button>
    <a className="em-preview-text-link" href="#words-in-context">{t('Hear these words in the clips above', 'Posłuchaj tych słów w klipach powyżej')}<Icon name="north_east"/></a>
  </>
  if (id === 'strengths') return <>
    <p className="em-report-lead">{t('Specific things to keep doing, with evidence from the conversation.', 'Konkretne rzeczy, które warto kontynuować, z przykładami z rozmowy.')}</p>
    <div className="em-report-evidence"><Icon name="check_circle"/><div><h4>{t('Explaining a preference', 'Wyjaśnianie preferencji')}</h4><p>“I’d choose the train because I can sleep on the way and arrive in the city centre.”</p><small>{t('A clear choice, a reason and a practical detail.', 'Jasny wybór, powód i praktyczny szczegół.')}</small></div></div>
    <div className="em-report-evidence"><Icon name="check_circle"/><div><h4>{t('Keeping the conversation moving', 'Podtrzymywanie rozmowy')}</h4><p>“What about you? Would you rather visit a gallery or explore the neighbourhood?”</p><small>{t('A follow-up question invites a longer exchange.', 'Pytanie zachęca do dłuższej wymiany zdań.')}</small></div></div>
  </>
  if (id === 'improvements') return <>
    <p className="em-report-lead">{t('A short, focused list tied to what happened in your lesson.', 'Krótka lista priorytetów wynikająca z Twojej lekcji.')}</p>
    <button className="em-report-priority" onClick={() => go('corrections')}><span>01</span><div><h4>{t('Keep prepositions inside the phrase', 'Ucz się przyimków razem z wyrażeniem')}</h4><p>{t('“Depend on” and “interested in” still need conscious attention in quick answers.', '„Depend on” i „interested in” wciąż wymagają uwagi przy szybkich odpowiedziach.')}</p><strong>{t('See the correction', 'Zobacz poprawkę')} →</strong></div></button>
    <button className="em-report-priority" onClick={() => go('practice')}><span>02</span><div><h4>{t('Bring the word stress into longer sentences', 'Przenieś akcent wyrazowy do dłuższych zdań')}</h4><p>{t('“Pescatarian” was clearer on its own than in a complete sentence.', '„Pescatarian” brzmiało wyraźniej osobno niż w pełnym zdaniu.')}</p><strong>{t('Open practice advice', 'Otwórz plan ćwiczeń')} →</strong></div></button>
  </>
  if (id === 'corrections') return <>
    <div className="em-report-correction"><div><small>{t('You said', 'Twoja wypowiedź')}</small><p>It depends <s>of</s> the weather.</p></div><Icon name="arrow_downward"/><div><small>{t('A more natural version', 'Poprawna wersja')}</small><p>It depends <mark>on</mark> the weather.</p></div><p className="em-report-rule">{t('Polish “zależy od” uses a different preposition. In English, learn the complete phrase “depend on”.', 'Polskie „zależy od” ma inny przyimek. Po angielsku zapamiętaj całe wyrażenie „depend on”.')}</p></div>
    <SampleDrill pl={pl} onInteract={onInteract}/>
  </>
  if (id === 'practice') return <>
    <div className="em-report-practice-plan"><article><span>2 min</span><div><h4>{t('Retrieve the phrase', 'Przypomnij sobie wyrażenie')}</h4><p>{t('Complete three sentences with “depend on”, then make one about your own plans.', 'Uzupełnij trzy zdania z „depend on”, a potem ułóż jedno o swoich planach.')}</p><button onClick={() => go('corrections')}>{t('Try the sample drill', 'Spróbuj przykładowego ćwiczenia')}<Icon name="arrow_forward"/></button></div></article><article><span>3 min</span><div><h4>{t('Listen, repeat, use it', 'Posłuchaj, powtórz, użyj')}</h4><p>{t('Replay “pescatarian”, copy the stress, then say what you would order at a restaurant.', 'Odtwórz „pescatarian”, powtórz akcent, a potem powiedz, co zamówisz w restauracji.')}</p><a href="#words-in-context">{t('Open the word clips', 'Otwórz klipy ze słowami')}<Icon name="north_east"/></a></div></article><article><span>1 min</span><div><h4>{t('Tell a short story', 'Opowiedz krótką historię')}</h4><p>{t('Describe a city you would like to visit. Include one reason and one new word.', 'Opisz miasto, które chcesz odwiedzić. Podaj jeden powód i użyj nowego słowa.')}</p></div></article></div>
  </>
  if (id === 'recommendations') return <>
    <p className="em-report-lead">{t('Chosen for this fictional learner’s interest in art and travel. Each recommendation explains why it fits and what to do with it.', 'Dobór dla przykładowej osoby zainteresowanej sztuką i podróżami. Każda rekomendacja wyjaśnia, dlaczego pasuje i jak z niej skorzystać.')}</p>
    <a className="em-report-recommendation" href="https://www.youtube.com/watch?v=sNFh9bL5yzg" target="_blank" rel="noopener noreferrer"><Icon name="smart_display"/><div><small>{t('Watch · Art History School', 'Obejrzyj · Art History School')}</small><h4>The Surreal World of René Magritte</h4><p><b>{t('Why it fits:', 'Dlaczego pasuje:')}</b> {t('Continue the art conversation with clear visual context.', 'Rozwiń rozmowę o sztuce dzięki wyraźnemu kontekstowi wizualnemu.')}</p><p><b>{t('Try this:', 'Spróbuj:')}</b> {t('Watch two minutes, choose a painting and describe it in three sentences.', 'Obejrzyj dwie minuty, wybierz obraz i opisz go w trzech zdaniach.')}</p><span className="em-report-focus-words">mural · artist · perspective</span></div><Icon name="open_in_new"/></a>
    <a className="em-report-recommendation" href="https://www.gutenberg.org/ebooks/103" target="_blank" rel="noopener noreferrer"><Icon name="menu_book"/><div><small>{t('Read · Jules Verne', 'Przeczytaj · Jules Verne')}</small><h4>Around the World in Eighty Days</h4><p><b>{t('Why it fits:', 'Dlaczego pasuje:')}</b> {t('A travel story to stretch your reading beyond lesson sentences.', 'Historia podróży, która pozwala wyjść poza zdania z lekcji.')}</p><p><b>{t('Try this:', 'Spróbuj:')}</b> {t('Read a short passage. Keep three useful phrases and retell the scene in your own words.', 'Przeczytaj krótki fragment. Wybierz trzy zwroty i opowiedz scenę własnymi słowami.')}</p><span className="em-report-focus-words">journey · departure · destination</span></div><Icon name="open_in_new"/></a>
  </>
  if (id === 'progress') return <>
    <div className="em-report-progress-heading"><div><small>{t('Grammatical accuracy · six sample lessons', 'Poprawność gramatyczna · sześć przykładowych lekcji')}</small><h3>58 <span>→</span> 68<small>/100</small></h3></div><Icon name="trending_up"/></div>
    <div className="em-report-chart" role="img" aria-label={t('Illustrative grammar scores across six lessons: 58, 61, 60, 65, 66, 68.', 'Przykładowe wyniki gramatyki z sześciu lekcji: 58, 61, 60, 65, 66, 68.')}><MetricLineChart metric={METRICS[1]} analyses={SAMPLE_PROGRESS} height={205} compact/></div>
    <div className="em-report-observation"><Icon name="history"/><div><h4>{t('Patterns matter more than a single score', 'Wzorce znaczą więcej niż pojedynczy wynik')}</h4><p>{t('Some lessons are harder than others. Look across your lessons, revisit recurring errors and see which practice to return to next.', 'Niektóre lekcje są trudniejsze. Porównuj lekcje, wracaj do powtarzających się błędów i wybieraj kolejne ćwiczenia.')}</p></div></div>
    <p className="em-report-fineprint">{t('Example data to demonstrate the report. Individual progress varies.', 'Przykładowe dane pokazujące raport. Postępy każdej osoby są inne.')}</p>
  </>
  return <>
    <div className="em-report-document"><div><strong>ENGLISH METRO</strong><span>{t('SAMPLE LESSON', 'PRZYKŁADOWA LEKCJA')}</span></div><h3>{t('A weekend in a new city', 'Weekend w nowym mieście')}</h3><p>{t('Your lesson recap', 'Twoje podsumowanie lekcji')}</p><h4>{t('Words to keep', 'Słowa do zapamiętania')}</h4><p>mural · berth · pescatarian</p><h4>{t('A phrase to practise', 'Wyrażenie do przećwiczenia')}</h4><p>It depends <strong>on</strong> the weather.</p><h4>{t('Your next step', 'Twój kolejny krok')}</h4><p>{t('Describe your next trip using two lesson words and a reason for your choice.', 'Opisz kolejną podróż, używając dwóch słów z lekcji i uzasadniając swój wybór.')}</p></div>
    <div className="em-report-download-copy"><Icon name="description"/><p>{t('In your account, revisit published materials and download your lesson notes and analysis PDF. Ask Bajla for your notes on WhatsApp, too.', 'W swoim koncie wracaj do materiałów i pobieraj notatki oraz analizę lekcji w PDF. Możesz też poprosić Bajlę o notatki na WhatsApp.')}</p></div>
  </>
}

export default function AnalysisPreviewShowcase({ lang }) {
  const pl = lang === 'pl', reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0), [auto, setAuto] = useState(true), [visible, setVisible] = useState(false), [pageVisible, setPageVisible] = useState(!document.hidden)
  const host = useRef(null), panel = useRef(null)
  const chapter = REPORT_CHAPTERS[index], running = auto && visible && pageVisible && !reduced
  const t = (en, polish) => pl ? polish : en
  function select(next) { setAuto(false); setIndex(next) }
  function go(id) { select(REPORT_CHAPTERS.findIndex(item => item[0] === id)) }
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .25 })
    observer.observe(host.current)
    const change = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', change) }
  }, [])
  useEffect(() => {
    if (!running) return
    const revealMore = setTimeout(() => {
      const view = panel.current
      if (view && view.scrollHeight > view.clientHeight + 12) view.scrollTo({ top: view.scrollHeight - view.clientHeight, behavior: 'smooth' })
    }, REPORT_STEP_MS / 2)
    const timer = setTimeout(() => { if (index === REPORT_CHAPTERS.length - 1) setAuto(false); else setIndex(value => nextReportChapter(value)) }, REPORT_STEP_MS)
    return () => { clearTimeout(timer); clearTimeout(revealMore) }
  }, [running, index])
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0
    const tabs = host.current?.querySelector('.em-report-chapters')
    const selected = tabs?.querySelector('[aria-selected=true]')
    if (tabs && selected && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft += selected.getBoundingClientRect().left - tabs.getBoundingClientRect().left - 14
  }, [index])
  function keyNavigate(event) {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!direction && !['Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? REPORT_CHAPTERS.length - 1 : nextReportChapter(index, direction)
    select(next)
    host.current.querySelector(`#em-report-tab-${REPORT_CHAPTERS[next][0]}`)?.focus()
  }
  return <section ref={host} className="gh-section em-feature-preview em-analysis-showcase" id="lesson-analysis-preview" aria-labelledby="em-analysis-title" data-running={running}>
    <div className="em-preview-heading"><h2 id="em-analysis-title">{pl ? <>Zobacz swój angielski.<br/><span>I swój kolejny krok.</span></> : <>See your English.<br/><span>And your next step.</span></>}</h2><p>{t('Explore the rich analysis behind a lesson: what worked, what needs attention and what to practise next.', 'Poznaj szczegółową analizę lekcji: co działa, co wymaga uwagi i co warto przećwiczyć dalej.')}</p><Link className="em-preview-text-link" to="/pricing">{t('Available with the optional AI lesson analysis add-on', 'Dostępne z opcjonalnym dodatkiem analizy lekcji AI')}<Icon name="arrow_forward"/></Link></div>
    <div className="em-report-shell gh-glass">
      <div className="em-report-topbar"><div><Icon name="analytics"/><strong>{t('Inside your lesson analysis', 'W środku analizy Twojej lekcji')}</strong></div><span>{t('Interactive sample', 'Interaktywny przykład')}</span></div>
      <div className="em-report-layout">
        <div className="em-report-chapters" role="tablist" aria-label={t('Analysis sections', 'Sekcje analizy')} onKeyDown={keyNavigate}>
          {REPORT_CHAPTERS.map((item, position) => <button key={item[0]} role="tab" id={`em-report-tab-${item[0]}`} aria-controls="em-report-panel" aria-selected={position === index} tabIndex={position === index ? 0 : -1} onClick={() => select(position)}><Icon name={item[1]}/><span>{item[pl ? 3 : 2]}</span><small>{String(position + 1).padStart(2, '0')}</small></button>)}
        </div>
        <div className="em-report-stage">
          <div className="em-report-caption"><span>{String(index + 1).padStart(2, '0')} / {REPORT_CHAPTERS.length}</span><h3>{chapter[pl ? 5 : 4]}</h3></div>
          <div className="em-report-panel" ref={panel} id="em-report-panel" role="tabpanel" aria-labelledby={`em-report-tab-${chapter[0]}`} tabIndex={0} onWheel={() => setAuto(false)} onTouchStart={() => setAuto(false)} onFocusCapture={() => setAuto(false)}>
            <div className="em-report-page" key={chapter[0]}><ReportContent id={chapter[0]} pl={pl} onInteract={() => setAuto(false)} go={go}/></div>
          </div>
          <div className="em-report-transport">
            <p>{t('Fictional lesson. Real report features.', 'Fikcyjna lekcja. Prawdziwe funkcje raportu.')}</p>
            <div><button onClick={() => select(nextReportChapter(index, -1))} aria-label={t('Previous analysis section', 'Poprzednia sekcja analizy')}><Icon name="chevron_left"/></button><button aria-pressed={auto && !reduced} onClick={() => { if (reduced) select(nextReportChapter(index)); else { if (!auto && index === REPORT_CHAPTERS.length - 1) setIndex(0); setAuto(value => !value) } }} aria-label={reduced ? t('Advance analysis tour', 'Przejdź dalej w analizie') : auto ? t('Pause analysis tour', 'Wstrzymaj przegląd analizy') : t('Play analysis tour', 'Odtwórz przegląd analizy')}><Icon name={auto && !reduced ? 'pause' : 'play_arrow'}/></button><button onClick={() => select(nextReportChapter(index))} aria-label={t('Next analysis section', 'Następna sekcja analizy')}><Icon name="chevron_right"/></button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
}
