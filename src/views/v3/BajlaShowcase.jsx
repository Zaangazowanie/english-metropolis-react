import { useState } from 'react'
import { Link } from 'react-router-dom'
import './bajla-showcase.css'

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
function Stamp({ sent = false }) { return <small className="bj-demo-stamp">10:24{sent && <Icon name="done_all"/>}</small> }
function CardTitle({ children, detail }) { return <div className="bj-demo-card-title">{children}{detail && <b>{detail}</b>}</div> }

// Public, cached examples returned by /api/conversa/youglish/{word}.
const CLIPS = {
  mural: { video: 'sNFh9bL5yzg', start: 949, end: 956, before: 'It was created using the same methods and techniques as the ', after: ' of 1953' },
  berth: { video: 'H0zeipr-cVc', start: 530, end: 533, before: 'or do I need to leave this teacher wide ', after: ', and just do what I’m told?' },
  pescatarian: { video: '6d-LMzIlr5I', start: 3119, end: 3125, before: 'You know, to be honest, if you could be a ', after: ' —' },
}
function NativeClip({ word, pl }) {
  const [playing, setPlaying] = useState(false)
  const clip = CLIPS[word]
  return <div className="bj-demo-clip">
    {playing ? <iframe title={`${pl ? 'Native speaker mówi' : 'Native speaker saying'} ${word}`} src={`https://www.youtube.com/embed/${clip.video}?start=${clip.start}&end=${clip.end}&autoplay=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> : <button className="bj-demo-clip-poster" onClick={() => setPlaying(true)}><img src={`https://i.ytimg.com/vi/${clip.video}/mqdefault.jpg`} alt="" loading="lazy" width="120" height="68"/><span><Icon name="play_circle"/>{pl ? 'Posłuchaj native speakera' : 'Hear a native speaker'}<small>{clip.end - clip.start} s · YouTube</small></span></button>}
    <blockquote>{clip.before}<strong>{word}</strong>{clip.after}</blockquote>
    {playing && <a href={`https://www.youtube.com/watch?v=${clip.video}&t=${clip.start}s`} target="_blank" rel="noopener noreferrer">{pl ? 'Otwórz w YouTube' : 'Open on YouTube'}<Icon name="open_in_new"/></a>}
  </div>
}

function Memory({ pl }) {
  return <>
    <p className="bj-demo-greeting">{pl ? 'Cześć' : 'Hi'} <em>{pl ? 'ponownie' : 'again'}</em> 👋</p>
    <p>{pl ? 'Pamiętam Twoje lekcje. Oto, co wciąż wraca.' : 'I remember your lessons. Here is what keeps coming back.'}</p>
    <div className="bj-demo-card">
      <CardTitle detail={pl ? '3 utrwalone' : '3 recurring'}>{pl ? 'Twoje nawyki' : 'Your recurring habits'}</CardTitle>
      <div className="bj-demo-habits">{[
        [pl ? 'Wybór przyimka' : 'Preposition choice', '12×', 94],
        [pl ? 'Brakujące przedimki' : 'Missing articles', '8×', 70],
        [pl ? 'Czasowniki posiłkowe' : 'Auxiliary verbs', '5×', 46],
      ].map(([label, count, width]) => <div key={label}><div className="bj-demo-habit-label"><span>{label}</span><small>{count}</small></div><div className="bj-demo-track"><span style={{ width: `${width}%` }}/></div></div>)}</div>
      <div className="bj-demo-scale"><span>{pl ? 'Twoje wcześniejsze lekcje' : 'Your earlier lessons'}</span><span>{pl ? 'Teraz' : 'Now'}</span></div>
    </div>
    <div className="bj-demo-tip"><Icon name="auto_awesome"/><p>{pl ? <>Zacznijmy od <strong>przyimków</strong>. Krótka powtórka z Twoich przykładów?</> : <>Let’s start with <strong>prepositions</strong>. A quick drill using your own examples?</>}</p></div>
  </>
}
function Voice({ pl }) {
  const [feedback, setFeedback] = useState(false)
  return <>
    <p>{pl ? 'Jasne. To słowo z Twojej lekcji o nocnych pociągach.' : 'Of course. This word came up in your lesson about night trains.'}</p>
    <div className="bj-demo-card">
      <CardTitle detail={pl ? 'przytrzymaj mikrofon' : 'hold the mic'}>{pl ? 'Powiedz to' : 'Say it'}</CardTitle>
      <div className="bj-demo-word-row"><div><strong className="bj-demo-word">berth</strong><div className="bj-demo-ipa">/bɜːθ/</div><div className="bj-demo-muted">koja / miejsce do spania</div></div><button className="bj-demo-mic" onClick={() => setFeedback(!feedback)} aria-label={pl ? 'Pokaż przykładową ocenę wymowy' : 'Preview pronunciation feedback'} aria-pressed={feedback}><Icon name="mic"/></button></div>
      <blockquote>“I booked a <strong>berth</strong> on the night train.”</blockquote>
      <button className="bj-demo-outline" onClick={() => setFeedback(!feedback)}>{pl ? 'Zobacz przykładową ocenę' : 'See example feedback'}<Icon name="arrow_forward"/></button>
    </div>
    {feedback ? <div className="bj-demo-feedback" role="status"><strong className="bj-demo-score">82<span>/100</span></strong><p><strong>{pl ? 'Dobry początek!' : 'A good start!'}</strong><br/>{pl ? 'Przy /θ/ lekko wysuń język między zęby i wypuść powietrze.' : 'For /θ/, put your tongue lightly between your teeth and let the air through.'}</p></div> : <div className="bj-demo-tip"><Icon name="record_voice_over"/><p>{pl ? 'Kliknij mikrofon, aby zobaczyć przykładową informację zwrotną.' : 'Tap the microphone to see an example of Bajla’s feedback.'}</p></div>}
    <NativeClip word="berth" pl={pl}/>
  </>
}
function Grammar({ pl }) {
  const [answer, setAnswer] = useState('')
  return <>
    <p>{pl ? <>Po angielsku mówimy <code>depend on</code>. Polski zwrot „zależeć od” może podpowiadać niewłaściwy przyimek.</> : <>In English, we say <code>depend on</code>. The Polish “zależeć od” can tempt you to choose the wrong preposition.</>}</p>
    <div className="bj-demo-correction"><span><Icon name="close"/><s>It depends of the weather.</s></span><span><Icon name="check"/><strong>It depends on the weather.</strong></span></div>
    <div className="bj-demo-card"><CardTitle>{pl ? 'Teraz Ty' : 'Your turn'}</CardTitle><p className="bj-demo-question">We can go by train. It depends ___ the price.</p><div className="bj-demo-answers">{['of', 'on', 'from'].map(option => <button key={option} onClick={() => setAnswer(option)} aria-pressed={answer === option} className={answer === option ? (option === 'on' ? 'correct' : 'retry') : ''}>{option}</button>)}</div></div>
    <div className="bj-demo-answer-result" role="status">{answer ? (answer === 'on' ? (pl ? 'Tak! depend on — zależeć od. Zapamiętaj cały zwrot.' : 'Exactly! depend on. Remember the two words together.') : (pl ? 'Spróbuj jeszcze raz. Pomyśl o zwrocie „depend on”.' : 'Try again. Think of the phrase “depend on”.')) : (pl ? 'Wybierz odpowiedź, aby sprawdzić.' : 'Choose an answer to check it.')}</div>
  </>
}
function Booking({ pl }) {
  const [confirmed, setConfirmed] = useState(false)
  return <>
    <p>{pl ? 'Piątek o 18:00 jest wolny. Oto nowy termin:' : 'Friday at 18:00 is available. Here is the new time:'}</p>
    <div className="bj-demo-booking"><Icon name="event_available"/><div><strong>{pl ? 'Piątek · 18:00–19:00' : 'Friday · 18:00–19:00'}</strong><span>{pl ? 'Lekcja 1:1 · Twój lektor' : '1:1 lesson · Your teacher'}</span><small>Europe/Warsaw</small></div></div>
    <p>{pl ? 'Przenieść Twoją lekcję na ten termin?' : 'Shall I move your lesson to this time?'}</p>
    <button className="bj-demo-wa-action" onClick={() => setConfirmed(!confirmed)}><Icon name={confirmed ? 'check_circle' : 'event_repeat'}/>{confirmed ? (pl ? 'Przykład: lekcja przeniesiona' : 'Example: lesson moved') : (pl ? 'Potwierdź w podglądzie' : 'Confirm in preview')}</button>
    {confirmed && <p className="bj-demo-confirmed" role="status">{pl ? 'Gotowe! Nowe zaproszenie i link do lekcji znajdziesz w kalendarzu.' : 'All set! Your updated invitation and lesson link are in your calendar.'}</p>}
  </>
}
function Notes({ pl }) {
  const [open, setOpen] = useState(false)
  return <>
    <p>{pl ? 'Oto notatki z Twojej ostatniej lekcji.' : 'Here are the notes from your last lesson.'}</p>
    <div className="bj-demo-document"><Icon name="picture_as_pdf"/><div><strong>Night trains & slow travel</strong><span>{pl ? 'Notatki z lekcji · PDF' : 'Lesson notes · PDF'}</span></div></div>
    <p><strong>{pl ? 'Co jest w środku?' : 'What’s inside?'}</strong></p>
    <ul><li>{pl ? 'Podsumowanie rozmowy' : 'Your conversation summary'}</li><li>{pl ? 'Poprawki z wyjaśnieniami' : 'Corrections with explanations'}</li><li>{pl ? 'Nowe słowa do powtórki' : 'New words to revisit'}</li></ul>
    <button className="bj-demo-wa-action" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="style"/>{pl ? 'Podejrzyj fiszkę' : 'Preview a flashcard'}</button>
    {open && <div className="bj-demo-mini-flash" role="status"><strong>to put something off</strong><span>odłożyć coś na później</span><em>“Don’t put off your next adventure.”</em></div>}
  </>
}
function Practice({ pl }) {
  const [selection, setSelection] = useState('')
  const options = [
    ['style', 'Flashcards', 'Fiszki', 'Word → meaning', 'Słowo → znaczenie'],
    ['quiz', 'Word quiz', 'Quiz słowny', 'Three options, one right answer', 'Trzy opcje, jedna dobra odpowiedź'],
    ['edit_note', 'Fill the gap', 'Uzupełnij lukę', 'Built from your own mistakes', 'Na podstawie Twoich błędów'],
    ['volume_up', 'Hear a word', 'Posłuchaj słowa', 'Real speakers, in context', 'Prawdziwi rozmówcy, w kontekście'],
  ]
  return <>
    <p>{pl ? 'Jasne! Wybierz, na co masz teraz ochotę.' : 'Absolutely! Choose what you feel like practising.'}</p>
    <div className="bj-demo-choice-list" role="group" aria-label={pl ? 'Wybierz ćwiczenie' : 'Choose practice'}><strong>{pl ? 'Wybierz' : 'Choose'}</strong>{options.map(([icon, en, polish, hint, hintPl]) => <button key={en} aria-pressed={selection === en} onClick={() => setSelection(en)}><Icon name={icon}/><span><b>{pl ? polish : en}</b><small>{pl ? hintPl : hint}</small></span><span className={`bj-demo-radio${selection === en ? ' selected' : ''}`}/></button>)}</div>
    {selection && <p className="bj-demo-confirmed" role="status">{pl ? 'W podglądzie wybrano: ' : 'Preview selected: '}{pl ? options.find(o => o[1] === selection)[2] : selection}</p>}
  </>
}
function Word({ pl }) {
  const [choose, setChoose] = useState(false)
  const [word, setWord] = useState('mural')
  const words = { mural: ['mural / malowidło ścienne', 'The artist painted a colourful mural on the wall.'], berth: ['koja / miejsce do spania', 'I booked a berth on the night train.'], pescatarian: ['osoba jedząca ryby, ale nie mięso', 'She is a pescatarian, so she ordered the fish.'] }
  return <>
    <div className="bj-demo-vocab-heading"><Icon name="volume_up"/><strong>{word}</strong></div>
    <p className="bj-demo-translation">{words[word][0]}</p><blockquote>{words[word][1]}</blockquote>
    <p>{pl ? 'A tak używa tego słowa prawdziwy rozmówca:' : 'Here is a real speaker using this word:'}</p>
    <NativeClip key={word} word={word} pl={pl}/>
    <button className="bj-demo-wa-action" onClick={() => setChoose(!choose)} aria-expanded={choose}><Icon name="list"/>{pl ? 'Wybierz słowo' : 'Choose word'}</button>
    {choose && <div className="bj-demo-word-picker" role="group" aria-label={pl ? 'Wybierz słowo' : 'Choose word'}>{Object.keys(words).map(w => <button key={w} onClick={() => { setWord(w); setChoose(false) }} aria-pressed={w === word}>{w}<span className={`bj-demo-radio${w === word ? ' selected' : ''}`}/></button>)}</div>}
  </>
}
const CONTENT = { memory: Memory, voice: Voice, grammar: Grammar, booking: Booking, notes: Notes, practice: Practice, word: Word }

export default function BajlaShowcase({ lang }) {
  const pl = lang === 'pl'
  const [index, setIndex] = useState(0)
  const example = EXAMPLES[index]
  const [eyebrow, title, description, query] = example[pl ? 'pl' : 'en']
  const wa = example.mode === 'whatsapp'
  const Content = CONTENT[example.id]
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
      <div className={`bj-demo ${wa ? 'bj-demo--wa' : 'bj-demo--web'}`}>
        <div className="bj-demo-header"><img src="/brand/em-bajla-icon.webp" alt="" width="42" height="42"/><div><strong>{wa ? 'Englishmetro Bajla' : 'Bajla'}</strong><span>{wa ? 'online' : (pl ? 'pamięta Twoje lekcje · B2' : 'remembers your lessons · B2')}</span></div><Icon name={wa ? 'search' : 'close'}/>{wa && <Icon name="more_vert"/>}</div>
        <div key={`${index}-${lang}`} className="bj-demo-conversation" role="group" aria-roledescription={pl ? 'slajd' : 'slide'} aria-label={`${index + 1} / ${EXAMPLES.length}: ${eyebrow}`}>
          {wa && <span className="bj-demo-today">{pl ? 'Dzisiaj' : 'Today'}</span>}
          <div className="bj-demo-query">{query}{wa && <Stamp sent/>}</div>
          <div className={`bj-demo-reply${wa ? ' bj-demo-bubble' : ''}`}><Content pl={pl}/>{wa && <Stamp/>}</div>
        </div>
        <div className="bj-demo-composer" aria-hidden="true">{wa && <Icon name="add"/>}<span>{wa ? (pl ? 'Wpisz wiadomość' : 'Type a message') : (pl ? 'Zapytaj Bajlę o cokolwiek…' : 'Ask Bajla anything…')}</span><Icon name="mic"/>{!wa && <Icon name="send"/>}</div>
      </div>
      <div className="bj-showcase-controls"><span>{String(index + 1).padStart(2, '0')}<span> / {String(EXAMPLES.length).padStart(2, '0')}</span></span><div className="bj-showcase-steps">{EXAMPLES.map((item, i) => <button key={item.id} onClick={() => setIndex(i)} aria-label={`${pl ? 'Przykład' : 'Example'} ${i + 1}: ${item[pl ? 'pl' : 'en'][0]}`} aria-current={i === index ? 'true' : undefined}/>)}</div><div className="bj-showcase-arrows"><button onClick={() => move(-1)} aria-label={pl ? 'Poprzedni przykład Bajli' : 'Previous Bajla example'}><Icon name="arrow_back"/></button><button onClick={() => move(1)} aria-label={pl ? 'Następny przykład Bajli' : 'Next Bajla example'}><Icon name="arrow_forward"/></button></div></div>
      <p className="bj-showcase-caption">{pl ? 'Przykładowe rozmowy. Klikaj strzałki i odkrywaj możliwości Bajli.' : 'Sample conversations. Use the arrows to explore what Bajla can do.'}</p>
    </div>
  </section>
}
