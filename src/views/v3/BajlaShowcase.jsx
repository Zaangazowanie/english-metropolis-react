import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import { nextExample, PLAYBACK_RATE } from './bajla-tour.mjs'
import './bajla-showcase.css'
import BajlaWalkthrough from './BajlaWalkthrough.jsx'

// Fictional public examples. Presentation follows conversa-widget-v5.js;
// no authenticated profiles, live chat calls or microphone access are loaded.
const EXAMPLES = [
  { id: 'memory', mode: 'web', icon: 'history', en: ['Lesson memory', 'Correct your recurring mistakes.', 'Bajla finds mistakes that repeat across your lessons and gives you exercises to correct them.', 'What should I work on next?'], pl: ['Pamięć lekcji', 'Popraw błędy, które się powtarzają.', 'Bajla znajduje powtarzające się błędy w Twoich lekcjach i daje Ci ćwiczenia, które pomagają je poprawić.', 'Co powinnam teraz przećwiczyć?'] },
  { id: 'voice', mode: 'web', icon: 'mic', en: ['Pronunciation', 'Practise pronunciation with feedback.', 'Say a word from your lesson. Bajla shows which sounds to improve and gives you a native-speaker example.', 'Help me pronounce “berth”.'], pl: ['Wymowa', 'Ćwicz wymowę z konkretnymi wskazówkami.', 'Powiedz słowo z lekcji. Bajla wskaże dźwięki do poprawy i pokaże przykład wymowy native speakera.', 'Pomóż mi wymówić „berth”.'] },
  { id: 'grammar', mode: 'web', icon: 'spellcheck', en: ['Grammar', 'Understand and correct your mistakes.', 'See why a sentence is wrong, read the correction and try a short exercise.', 'Why is “depend of” wrong?'], pl: ['Gramatyka', 'Zrozum i popraw swoje błędy.', 'Sprawdź, dlaczego zdanie jest błędne, przeczytaj poprawkę i wykonaj krótkie ćwiczenie.', 'Dlaczego „depend of” jest błędne?'] },
  { id: 'booking', mode: 'whatsapp', icon: 'event_available', en: ['Bookings', 'Book, move or cancel lessons.', 'Ask Bajla for available times and manage your bookings in chat. She checks your teacher’s calendar.', 'Can I move my lesson to Friday at 18:00?'], pl: ['Rezerwacje', 'Rezerwuj, przenoś i odwołuj lekcje.', 'Zapytaj Bajlę o wolne terminy i zarządzaj rezerwacjami w rozmowie. Sprawdzi kalendarz Twojego lektora.', 'Mogę przenieść lekcję na piątek na 18:00?'] },
  { id: 'notes', mode: 'whatsapp', icon: 'description', en: ['Lesson notes', 'Get your lesson notes in chat.', 'Ask for the PDF from a lesson, then review the vocabulary with Bajla.', 'Send me the notes from my last lesson.'], pl: ['Notatki z lekcji', 'Odbierz notatki z lekcji w rozmowie.', 'Poproś o PDF z lekcji, a potem powtórz słownictwo z Bajlą.', 'Wyślij mi notatki z ostatniej lekcji.'] },
  { id: 'practice', mode: 'whatsapp', icon: 'style', en: ['Quick practice', 'Review your lesson vocabulary.', 'Choose flashcards, word quizzes or grammar exercises based on your lessons.', 'Give me something to practise.'], pl: ['Krótka powtórka', 'Powtórz słownictwo z lekcji.', 'Wybierz fiszki, quizy słowne lub ćwiczenia gramatyczne oparte na Twoich lekcjach.', 'Daj mi coś do przećwiczenia.'] },
  { id: 'word', mode: 'whatsapp', icon: 'hearing', en: ['Words in context', 'Hear your lesson words in context.', 'Get the meaning, an example sentence and a clip of a native speaker using the word.', 'Let me choose a word from my lesson.'], pl: ['Słowa w kontekście', 'Posłuchaj słów z lekcji w kontekście.', 'Poznaj znaczenie, przykład zdania i nagranie, w którym native speaker używa danego słowa.', 'Chcę wybrać słowo z mojej lekcji.'] },
]

const EXAMPLE_LABELS = {
  memory: ['Lesson memory', 'Pamięć lekcji'],
  voice: ['Pronunciation', 'Wymowa'],
  grammar: ['Grammar', 'Gramatyka'],
  booking: ['Bookings', 'Rezerwacje'],
  notes: ['Lesson notes', 'Notatki z lekcji'],
  practice: ['Quick practice', 'Krótka powtórka'],
  word: ['Words in context', 'Słowa w kontekście'],
}

function Icon({ name }) { return <span className="material-symbols-outlined" aria-hidden="true">{name}</span> }
export default function BajlaShowcase({ lang }) {
  const pl = lang === 'pl'
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(!reduced)
  const [currentStep, setCurrentStep] = useState(null)
  const example = EXAMPLES[index]
  const [, title, description, query] = example[pl ? 'pl' : 'en']
  const wa = example.mode === 'whatsapp'
  const selectExample = nextIndex => {
    setIndex(nextIndex)
    setPlaying(true)
  }
  const move = useCallback(amount => setIndex(current => nextExample(current, EXAMPLES.length, amount)), [])
  const continueTour = useCallback(() => move(1), [move])
  const stepCaption = currentStep?.id === example.id ? currentStep.caption : ''
  return (
    <section id="bajla" className="gh-section bj-showcase" aria-labelledby="gh-bajla-title" style={{ '--bj-playback-rate': PLAYBACK_RATE }}>
      <header className="bj-showcase-heading">
        <div className="bj-showcase-copy">
          <div className="bj-showcase-kicker"><span aria-hidden="true"/>{pl ? 'Poznaj Bajlę' : 'Meet Bajla'}</div>
          <h2 id="gh-bajla-title">{pl ? 'Twoja partnerka do nauki angielskiego' : 'Your English practice companion'}</h2>
        </div>
        <div className="bj-showcase-lead">
          <p className="bj-showcase-intro">{pl ? 'Bajla pamięta Twoje lekcje, wyjaśnia błędy i pomaga ćwiczyć słownictwo oraz wymowę. Poproś ją o notatki, rezerwację, zmianę lub odwołanie lekcji. W aplikacji lub na WhatsAppie, po polsku i angielsku.' : 'Bajla remembers your lessons, explains mistakes and helps you practise vocabulary and pronunciation. Ask her for notes or to book, move or cancel a lesson. In the app or on WhatsApp, in Polish or English.'}</p>
          <Link className="bj-showcase-link" to="/pricing?addon=1">{pl ? 'Wybierz pakiet z Bajlą i analizą AI' : 'Get Bajla with AI lesson analysis'}<Icon name="arrow_forward"/></Link>
        </div>
      </header>

      {/* Bento (2026-09-07): four boxes in two columns. Left: where she lives,
          what she does, what is playing now. Right: the auto-playing preview,
          untouched (BajlaWalkthrough + bajla-tour.mjs own the choreography). */}
      <div className="bj-bento">
        <div className="bj-box bj-box--where gh-glass">
          <div className="bj-box-head"><span className="bj-box-num">01</span>{pl ? 'Gdzie z nią rozmawiasz' : 'Where you talk to her'}</div>
          <div className="bj-where" role="group" aria-label={pl ? 'Wybierz interfejs' : 'Choose interface'}>
            <button type="button" onClick={() => selectExample(wa ? 0 : index)} aria-pressed={!wa}>
              <span className="bj-where-icon"><Icon name="desktop_windows"/></span>
              <span><b>{pl ? 'W aplikacji' : 'In the app'}</b><small>{pl ? 'Pamięć lekcji, wymowa, gramatyka' : 'Lesson memory, pronunciation, grammar'}</small></span>
            </button>
            <button type="button" onClick={() => selectExample(wa ? index : 3)} aria-pressed={wa}>
              <span className="bj-where-icon bj-where-icon--wa"><Icon name="chat"/></span>
              <span><b>WhatsApp</b><small>{pl ? 'Rezerwacje, notatki, szybka powtórka' : 'Bookings, notes, quick practice'}</small></span>
            </button>
          </div>
        </div>

        <div className="bj-box bj-box--what gh-glass">
          <div className="bj-box-head">
            <span className="bj-box-num">02</span>{pl ? 'Co potrafi' : 'What she can do'}
            <em>{EXAMPLES.filter(item => item.mode === example.mode).length} {pl ? 'z 7 przykładów' : 'of 7 examples'}</em>
          </div>
          <div className="bj-showcase-examples" role="group" aria-label={pl ? 'Wybierz przykład' : 'Choose an example'}>
            {EXAMPLES.map((item, i) => item.mode === example.mode && (
              <button type="button" key={item.id} onClick={() => selectExample(i)} aria-pressed={i === index} aria-controls="bj-showcase-preview">
                <Icon name={item.icon}/><span>{EXAMPLE_LABELS[item.id][pl ? 1 : 0]}</span><Icon name="arrow_forward"/>
              </button>
            ))}
          </div>
        </div>

        <div className="bj-box bj-box--now gh-glass" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
          <div className="bj-box-head">
            <span className="bj-box-num">03</span>{pl ? 'Teraz na ekranie' : 'Now showing'}
            <em className={`bj-now-state${playing ? ' is-playing' : ''}`}><i aria-hidden/>{playing ? (pl ? 'odtwarzanie' : 'playing') : (pl ? 'pauza' : 'paused')}</em>
          </div>
          <div key={`${index}-${lang}`} className="bj-showcase-explanation-content">
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <div className="bj-now-steps" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => <span key={i} className={currentStep?.id === example.id && i <= currentStep.step ? 'done' : ''}/>)}
          </div>
          <div className="bj-now-caption"><Icon name={example.icon}/><span>{stepCaption || EXAMPLE_LABELS[example.id][pl ? 1 : 0]}</span></div>
        </div>

        <div id="bj-showcase-preview" className="bj-box bj-box--stage gh-glass bj-showcase-stage" role="region" aria-roledescription={pl ? 'karuzela' : 'carousel'} aria-label={pl ? 'Bajla w działaniu' : 'Bajla in action'} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } }} tabIndex={0}>
          <div className="bj-showcase-toolbar">
            <span className="bj-showcase-preview-label"><span className="bj-live-dot" aria-hidden/>{pl ? 'Przykładowa rozmowa' : 'Example conversation'}</span>
            <span className="bj-showcase-counter">{String(index + 1).padStart(2, '0')}<span> / {String(EXAMPLES.length).padStart(2, '0')}</span></span>
          </div>
          <BajlaWalkthrough key={`${index}-${lang}`} id={example.id} wa={wa} query={query} pl={pl} auto={playing} setAuto={setPlaying} onComplete={continueTour} onStepChange={setCurrentStep}/>
          <div className="bj-showcase-controls">
            <p className="bj-showcase-caption">{pl ? 'Zatrzymaj pokaz lub wybierz przykład, aby wypróbować dostępne opcje.' : 'Pause the tour or choose an example to explore the available options.'}</p>
            <div className="bj-showcase-arrows">
              <button type="button" onClick={() => move(-1)} aria-label={pl ? 'Poprzedni przykład Bajli' : 'Previous Bajla example'}><Icon name="arrow_back"/></button>
              <button type="button" onClick={() => move(1)} aria-label={pl ? 'Następny przykład Bajli' : 'Next Bajla example'}><Icon name="arrow_forward"/></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
