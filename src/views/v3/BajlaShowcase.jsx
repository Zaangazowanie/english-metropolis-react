import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import { nextExample } from './bajla-tour.mjs'
import './bajla-showcase.css'
import BajlaWalkthrough from './BajlaWalkthrough.jsx'

// Fictional public examples. Presentation follows conversa-widget-v5.js;
// no authenticated profiles, live chat calls or microphone access are loaded.
const EXAMPLES = [
  { id: 'memory', mode: 'web', icon: 'history', en: ['A memory for your learning', 'She remembers what needs practice.', 'Bajla connects patterns across your lessons, so your next practice starts with the things that actually need attention.', 'What should I work on next?'], pl: ['Pamięć Twojej nauki', 'Pamięta, co warto przećwiczyć.', 'Bajla łączy powtarzające się błędy z Twoich lekcji. Kolejna powtórka zaczyna się od tego, co naprawdę wymaga uwagi.', 'Co powinnam teraz przećwiczyć?'] },
  { id: 'voice', mode: 'web', icon: 'mic', en: ['Pronunciation, made personal', 'Say it. Hear it. Try again.', 'Practise a word from your lesson, see the sounds that need attention, and get a clear tip for your next attempt.', 'Help me pronounce “berth”.'], pl: ['Wymowa dopasowana do Ciebie', 'Powiedz. Posłuchaj. Spróbuj ponownie.', 'Ćwicz słowo z lekcji, sprawdź, które dźwięki wymagają uwagi, i otrzymaj konkretną wskazówkę do kolejnej próby.', 'Pomóż mi wymówić „berth”.'] },
  { id: 'grammar', mode: 'web', icon: 'spellcheck', en: ['Your mistakes become practice', 'A small correction. A useful habit.', 'Clear explanations, highlighted corrections and a quick question help you use the right phrase next time.', 'Why is “depend of” wrong?'], pl: ['Twoje błędy stają się ćwiczeniami', 'Mała poprawka. Dobry nawyk.', 'Krótkie wyjaśnienia, wyróżnione poprawki i szybkie pytania pomagają następnym razem użyć właściwego zwrotu.', 'Dlaczego „depend of” jest błędne?'] },
  { id: 'booking', mode: 'whatsapp', icon: 'event_available', en: ['Your calendar, in the conversation', 'Make plans with one message.', 'Ask about available times, book a lesson or move an existing booking. Bajla works with your teacher’s live calendar.', 'Can I move my lesson to Friday at 18:00?'], pl: ['Kalendarz w Twojej rozmowie', 'Zaplanuj lekcję jedną wiadomością.', 'Zapytaj o wolne terminy, zarezerwuj lekcję lub zmień rezerwację. Bajla korzysta z aktualnego kalendarza Twojego lektora.', 'Mogę przenieść lekcję na piątek na 18:00?'] },
  { id: 'notes', mode: 'whatsapp', icon: 'description', en: ['Your lesson, ready to revisit', 'The notes find their way to you.', 'Get your lesson PDF in the chat, then move straight into a short revision of the words you learned.', 'Send me the notes from my last lesson.'], pl: ['Twoja lekcja zawsze pod ręką', 'Notatki trafiają prosto do Ciebie.', 'Odbierz PDF z lekcji w rozmowie i od razu przejdź do krótkiej powtórki poznanych słów.', 'Wyślij mi notatki z ostatniej lekcji.'] },
  { id: 'practice', mode: 'whatsapp', icon: 'style', en: ['A little practice, wherever you are', 'Your next drill is a tap away.', 'Choose flashcards, a word quiz or a grammar exercise. Bajla builds practice around your own lesson vocabulary and mistakes.', 'Give me something to practise.'], pl: ['Krótka powtórka, gdziekolwiek jesteś', 'Jedno kliknięcie do ćwiczenia.', 'Wybierz fiszki, quiz słowny lub ćwiczenie gramatyczne. Bajla przygotowuje powtórki z Twoich słów i błędów z lekcji.', 'Daj mi coś do przećwiczenia.'] },
  { id: 'word', mode: 'whatsapp', icon: 'hearing', en: ['Real words, real voices', 'Hear how a word lives in a sentence.', 'Pick a word from your lesson. Bajla brings back its meaning, an example and a native-speaker clip to hear it in context.', 'Let me choose a word from my lesson.'], pl: ['Prawdziwe słowa, prawdziwe głosy', 'Usłysz słowo w całym zdaniu.', 'Wybierz słowo z lekcji. Bajla pokaże znaczenie, przykład i nagranie native speakera, żeby usłyszeć je w kontekście.', 'Chcę wybrać słowo z mojej lekcji.'] },
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
    <section id="bajla" className="gh-section bj-showcase" aria-labelledby="gh-bajla-title">
      <header className="bj-showcase-heading">
        <div className="bj-showcase-copy">
          <div className="bj-showcase-kicker"><span aria-hidden="true"/>{pl ? 'Poznaj Bajlę' : 'Meet Bajla'}</div>
          <h2 id="gh-bajla-title">{pl ? <>Twoje lekcje.<br/>Zawsze pod ręką.</> : <>Your lessons.<br/>Always with you.</>}</h2>
        </div>
        <div className="bj-showcase-lead">
          <p className="bj-showcase-intro">{pl ? 'Ćwicz materiał z lekcji, wracaj do notatek i zarządzaj rezerwacjami z Bajlą, w aplikacji lub na WhatsAppie. Rozmawiaj po polsku lub po angielsku.' : 'Practise your lesson material, revisit notes and manage bookings with Bajla, in the app or on WhatsApp. Speak Polish or English.'}</p>
          <Link className="bj-showcase-link" to="/pricing">{pl ? 'W dodatku z analizą lekcji AI' : 'Included with the AI lesson analysis add-on'}<Icon name="arrow_forward"/></Link>
        </div>
      </header>

      <div className="bj-showcase-workspace">
        <div className="bj-showcase-explorer" onFocusCapture={() => setPlaying(false)} onPointerDownCapture={() => setPlaying(false)}>
          <div className="bj-showcase-nav-heading">
            <span>{pl ? 'Sprawdź, co potrafi' : 'See what she can do'}</span>
            <span>{pl ? '7 przykładów' : '7 examples'}</span>
          </div>
          <div className="bj-showcase-modes" role="group" aria-label={pl ? 'Wybierz interfejs' : 'Choose interface'}>
            <button type="button" onClick={() => selectExample(wa ? 0 : index)} aria-pressed={!wa}><Icon name="desktop_windows"/>{pl ? 'W aplikacji' : 'In the app'}</button>
            <button type="button" onClick={() => selectExample(wa ? index : 3)} aria-pressed={wa}><Icon name="chat"/>WhatsApp</button>
          </div>
          <div className="bj-showcase-examples" role="group" aria-label={pl ? 'Wybierz przykład' : 'Choose an example'}>
            {EXAMPLES.map((item, i) => item.mode === example.mode && (
              <button type="button" key={item.id} onClick={() => selectExample(i)} aria-pressed={i === index} aria-controls="bj-showcase-preview">
                <Icon name={item.icon}/><span>{EXAMPLE_LABELS[item.id][pl ? 1 : 0]}</span><Icon name="arrow_forward"/>
              </button>
            ))}
          </div>
          <div className="bj-showcase-explanation" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
            <div key={`${index}-${lang}`} className="bj-showcase-explanation-content">
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </div>
        </div>

        <div id="bj-showcase-preview" className="bj-showcase-stage" role="region" aria-roledescription={pl ? 'karuzela' : 'carousel'} aria-label={pl ? 'Bajla w działaniu' : 'Bajla in action'} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } }} tabIndex={0}>
          <div className="bj-showcase-toolbar">
            <span className="bj-showcase-preview-label">{pl ? 'Przykładowa rozmowa' : 'Example conversation'}</span>
            <span className="bj-showcase-counter">{String(index + 1).padStart(2, '0')}<span> / {String(EXAMPLES.length).padStart(2, '0')}</span></span>
          </div>
          <BajlaWalkthrough key={`${index}-${lang}`} id={example.id} wa={wa} query={query} pl={pl} auto={playing} setAuto={setPlaying} onComplete={continueTour} onStepChange={setCurrentStep}/>
          <div className="bj-showcase-controls">
            <span className="bj-showcase-context"><Icon name={example.icon}/><span>{stepCaption || EXAMPLE_LABELS[example.id][pl ? 1 : 0]}</span></span>
            <div className="bj-showcase-arrows">
              <button type="button" onClick={() => move(-1)} aria-label={pl ? 'Poprzedni przykład Bajli' : 'Previous Bajla example'}><Icon name="arrow_back"/></button>
              <button type="button" onClick={() => move(1)} aria-label={pl ? 'Następny przykład Bajli' : 'Next Bajla example'}><Icon name="arrow_forward"/></button>
            </div>
          </div>
          <p className="bj-showcase-caption">{pl ? 'Zatrzymaj pokaz lub wybierz przykład, aby wypróbować dostępne opcje.' : 'Pause the tour or choose an example to explore the available options.'}</p>
        </div>
      </div>
    </section>
  )
}
