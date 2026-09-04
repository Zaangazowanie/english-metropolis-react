import { useState } from 'react'
import { Link } from 'react-router-dom'
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

function Icon({ name }) { return <span className="material-symbols-outlined" aria-hidden="true">{name}</span> }
export default function BajlaShowcase({ lang }) {
  const pl = lang === 'pl'
  const [index, setIndex] = useState(0)
  const example = EXAMPLES[index]
  const [eyebrow, title, description, query] = example[pl ? 'pl' : 'en']
  const wa = example.mode === 'whatsapp'
  const move = amount => setIndex(current => (current + amount + EXAMPLES.length) % EXAMPLES.length)
  return <section id="bajla" className="gh-section bj-showcase" aria-labelledby="gh-bajla-title">
    <div className="bj-showcase-copy">
      <div className="gh-kicker">{pl ? 'Poznaj Bajlę · w aplikacji i na WhatsAppie' : 'Meet Bajla · in the app and on WhatsApp'}</div>
      <h2 id="gh-bajla-title">{pl ? <>Twoje lekcje.<br/>{' '}Jej dobra pamięć.</> : <>Your lessons.<br/>{' '}Her long memory.</>}</h2>
      <p className="bj-showcase-intro">{pl ? 'Bajla to Twoja asystentka w English Metro. Pamięta materiał z lekcji, pomaga ćwiczyć i ogarnia rezerwacje. Napisz po polsku lub po angielsku — w aplikacji albo na WhatsAppie.' : 'Bajla is your English Metro assistant. She remembers your lesson material, helps you practise and takes care of bookings. Write in Polish or English, in the app or on WhatsApp.'}</p>
      <Link className="bj-showcase-link" to="/pricing">{pl ? 'W dodatku z analizą lekcji AI' : 'Included with the AI lesson analysis add-on'}<Icon name="arrow_forward"/></Link>
      <div className="bj-showcase-explanation" aria-live="polite" aria-atomic="true"><div key={`${index}-${lang}`} className="bj-showcase-explanation-content"><div className="bj-showcase-eyebrow"><span>{String(index + 1).padStart(2, '0')}</span>{eyebrow}</div><h3>{title}</h3><p>{description}</p><span className="bj-showcase-context"><Icon name={example.icon}/>{wa ? 'WhatsApp' : (pl ? 'Bajla w aplikacji' : 'Bajla in the app')}</span></div></div>
    </div>
    <div className="bj-showcase-stage" role="region" aria-roledescription={pl ? 'karuzela' : 'carousel'} aria-label={pl ? 'Bajla w działaniu' : 'Bajla in action'} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } }} tabIndex={0}>
      <div className="bj-showcase-toolbar"><div className="bj-showcase-modes" role="group" aria-label={pl ? 'Wybierz interfejs' : 'Choose interface'}><button onClick={() => setIndex(0)} aria-pressed={!wa}><Icon name="desktop_windows"/>Web</button><button onClick={() => setIndex(3)} aria-pressed={wa}><Icon name="chat"/>WhatsApp</button></div><span className="bj-showcase-preview-label">{pl ? 'Podgląd' : 'Preview'}</span></div>
      <BajlaWalkthrough key={`${index}-${lang}`} id={example.id} wa={wa} query={query} pl={pl}/>
      <div className="bj-showcase-controls"><span>{String(index + 1).padStart(2, '0')}<span> / {String(EXAMPLES.length).padStart(2, '0')}</span></span><div className="bj-showcase-steps">{EXAMPLES.map((item, i) => <button key={item.id} onClick={() => setIndex(i)} aria-label={`${pl ? 'Przykład' : 'Example'} ${i + 1}: ${item[pl ? 'pl' : 'en'][0]}`} aria-current={i === index ? 'true' : undefined}/>)}</div><div className="bj-showcase-arrows"><button onClick={() => move(-1)} aria-label={pl ? 'Poprzedni przykład Bajli' : 'Previous Bajla example'}><Icon name="arrow_back"/></button><button onClick={() => move(1)} aria-label={pl ? 'Następny przykład Bajli' : 'Next Bajla example'}><Icon name="arrow_forward"/></button></div></div>
      <p className="bj-showcase-caption">{pl ? 'Animowane przykłady. Zatrzymaj, powtórz lub wybierz dowolną opcję.' : 'Animated sample conversations. Pause, replay or choose an option.'}</p>
    </div>
  </section>
}
