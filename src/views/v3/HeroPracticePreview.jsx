import { useEffect, useMemo, useState } from 'react'
import './hero-practice-preview.css'

const WORDS = [
  { word: 'morning', pl: 'poranek', icon: 'wb_twilight' },
  { word: 'coffee', pl: 'kawa', icon: 'local_cafe' },
  { word: 'station', pl: 'stacja', icon: 'train' },
]

const MEMORY_CARDS = [
  { id: 'coffee-a', pair: 'coffee', label: 'coffee', icon: 'local_cafe' },
  { id: 'station-a', pair: 'station', label: 'station', icon: 'train' },
  { id: 'morning-a', pair: 'morning', label: 'morning', icon: 'wb_twilight' },
  { id: 'station-b', pair: 'station', label: 'stacja', icon: 'train' },
  { id: 'morning-b', pair: 'morning', label: 'poranek', icon: 'wb_twilight' },
  { id: 'coffee-b', pair: 'coffee', label: 'kawa', icon: 'local_cafe' },
]

function copy(lang, en, pl) {
  return lang === 'pl' ? pl : en
}

function MaterialIcon({ children, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`} aria-hidden>{children}</span>
}

function SceneHeader({ icon, eyebrow, title, detail, progress }) {
  return (
    <header className="gh-preview-head">
      <span className="gh-preview-mark"><MaterialIcon>{icon}</MaterialIcon></span>
      <span className="gh-preview-heading">
        <span className="gh-preview-eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="gh-preview-progress">{progress}</span>
    </header>
  )
}

function Feedback({ children }) {
  return <span className="gh-preview-feedback" aria-live="polite">{children}</span>
}

function FlashcardsScene({ lang }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const card = WORDS[index]
  const advance = () => {
    setFlipped(false)
    setIndex((value) => (value + 1) % WORDS.length)
  }

  return (
    <div className="gh-preview-scene gh-preview-flashcards">
      <SceneHeader icon="style" eyebrow="English Metropolis · Reading Café" title="Postcard words"
        detail={copy(lang, 'Flip the card, then choose your next move', 'Odwróć kartę i wybierz następny krok')}
        progress={`${index + 1} / ${WORDS.length}`}/>
      <div className="gh-flash-art" aria-hidden>
        <span className="gh-flash-window"><i/><i/><i/></span>
        <span className="gh-flash-lamp"/>
        <span className="gh-flash-plant"><i/><i/><i/></span>
        <span className="gh-flash-cup"><i/></span>
      </div>
      <div className="gh-flash-stack">
        <span className="gh-flash-postcard gh-flash-postcard--one" aria-hidden/>
        <span className="gh-flash-postcard gh-flash-postcard--two" aria-hidden/>
        <button type="button" className={`gh-flash-card${flipped ? ' is-flipped' : ''}`}
          onClick={() => setFlipped(value => !value)} aria-label={copy(lang, 'Flip flashcard', 'Odwróć fiszkę')}>
          <span className="gh-flash-card-face gh-flash-card-front">
            <span className="gh-flash-illustration"><MaterialIcon>{card.icon}</MaterialIcon></span>
            <span className="gh-flash-word">{card.word}</span>
            <span className="gh-flash-hint"><MaterialIcon>touch_app</MaterialIcon>{copy(lang, 'tap to flip', 'dotknij, aby odwrócić')}</span>
          </span>
          <span className="gh-flash-card-face gh-flash-card-back">
            <span className="gh-flash-translation">{card.pl}</span>
            <span className="gh-flash-example">“Good {card.word}!”</span>
          </span>
        </button>
      </div>
      <div className="gh-flash-actions">
        <button type="button" onClick={advance}><MaterialIcon>refresh</MaterialIcon>{copy(lang, 'Again', 'Jeszcze raz')}</button>
        <button type="button" className="is-primary" onClick={advance}><MaterialIcon>check</MaterialIcon>{copy(lang, 'Got it', 'Umiem')}</button>
      </div>
    </div>
  )
}

function QuizScene({ lang }) {
  const [answer, setAnswer] = useState('')
  const options = ['bridge', 'station', 'window', 'coffee']
  const correct = 'station'
  return (
    <div className="gh-preview-scene gh-preview-quiz">
      <SceneHeader icon="quiz" eyebrow="English Metropolis · City Kiosk" title="The street quiz"
        detail={copy(lang, 'Pick the word that completes the poster', 'Wybierz słowo, które uzupełnia plakat')} progress="1 / 4"/>
      <div className="gh-quiz-kiosk">
        <div className="gh-quiz-skyline" aria-hidden><i/><i/><i/><i/></div>
        <section className="gh-quiz-poster" aria-label="Quiz question">
          <span className="gh-quiz-stamp">TODAY</span>
          <span className="gh-quiz-label">CITY ENGLISH · A2</span>
          <strong>The next train leaves from the ___.</strong>
          <small>Następny pociąg odjeżdża ze stacji.</small>
        </section>
        <div className="gh-quiz-options" role="radiogroup" aria-label={copy(lang, 'Answer options', 'Opcje odpowiedzi')}>
          {options.map((option, index) => {
            const state = answer === option ? (option === correct ? ' is-correct' : ' is-wrong') : ''
            return (
              <button key={option} type="button" className={state} aria-pressed={answer === option}
                onClick={() => setAnswer(option)}>
                <span>{String.fromCharCode(65 + index)}</span>{option}
              </button>
            )
          })}
        </div>
      </div>
      <Feedback>{answer ? (answer === correct ? copy(lang, 'Platform found. Nice work!', 'Peron znaleziony. Świetnie!') : copy(lang, 'Almost. Follow the train signs.', 'Prawie. Spójrz na znaki kolejowe.')) : copy(lang, 'One poster. Four possibilities.', 'Jeden plakat. Cztery możliwości.')}</Feedback>
    </div>
  )
}

function GapFillScene({ lang }) {
  const [word, setWord] = useState('')
  const options = ['latte', 'ticket', 'bridge']
  return (
    <div className="gh-preview-scene gh-preview-gapfill">
      <SceneHeader icon="edit_note" eyebrow="English Metropolis · Market Quarter" title="Build the sentence"
        detail={copy(lang, 'Light the café sign with the missing word', 'Zapal szyld kawiarni brakującym słowem')} progress="1 / 3"/>
      <div className={`gh-gap-shop${word === 'latte' ? ' is-open' : ''}`}>
        <span className="gh-gap-crane" aria-hidden><i/><b/></span>
        <span className="gh-gap-cloud gh-gap-cloud--one" aria-hidden/>
        <span className="gh-gap-cloud gh-gap-cloud--two" aria-hidden/>
        <div className="gh-gap-building" aria-hidden>
          <span className="gh-gap-awning"/>
          <span className="gh-gap-window"><i/><i/></span>
          <span className="gh-gap-door"/>
          <span className="gh-gap-cone"/>
        </div>
        <section className="gh-gap-sign" aria-label="Gap fill sentence">
          <span>CAFÉ LATTE · ORDER NO. 01</span>
          <strong>Could I have a <b>{word || '______'}</b>, please?</strong>
          <small>Poproszę latte.</small>
        </section>
        <div className="gh-gap-blocks" aria-label={copy(lang, 'Word choices', 'Wybór słów')}>
          {options.map(option => (
            <button type="button" key={option} onClick={() => setWord(option)}
              className={word === option ? (option === 'latte' ? 'is-correct' : 'is-wrong') : ''}>{option}</button>
          ))}
        </div>
      </div>
      <Feedback>{word ? (word === 'latte' ? copy(lang, 'The café is open!', 'Kawiarnia jest otwarta!') : copy(lang, 'That belongs in another district.', 'To słowo pasuje do innej dzielnicy.')) : copy(lang, 'Choose a word block.', 'Wybierz klocek ze słowem.')}</Feedback>
    </div>
  )
}

function TrueFalseScene({ lang }) {
  const [verdict, setVerdict] = useState('')
  return (
    <div className="gh-preview-scene gh-preview-truefalse">
      <SceneHeader icon="balance" eyebrow="English Metropolis · Courthouse" title="Weigh the sentence"
        detail={copy(lang, 'Read the city fact and choose your verdict', 'Przeczytaj fakt i wydaj werdykt')} progress="1 / 5"/>
      <div className={`gh-tf-court${verdict ? ` has-${verdict}` : ''}`}>
        <div className="gh-tf-building" aria-hidden><i/><i/><i/><i/><i/></div>
        <section className="gh-tf-case" aria-label="Statement">
          <span>CASE FILE · LONDON</span>
          <strong>“Tower Bridge crosses the River Thames.”</strong>
          <small>Wieża Tower Bridge przecina Tamizę.</small>
        </section>
        <div className="gh-tf-scale" aria-hidden><span/><i/><b/><em/></div>
        <div className="gh-tf-actions" aria-label={copy(lang, 'True or false', 'Prawda czy fałsz')}>
          <button type="button" className={verdict === 'true' ? 'is-selected' : ''} onClick={() => setVerdict('true')}>
            <MaterialIcon>check_circle</MaterialIcon><span>TRUE<small>PRAWDA</small></span>
          </button>
          <button type="button" className={verdict === 'false' ? 'is-selected' : ''} onClick={() => setVerdict('false')}>
            <MaterialIcon>cancel</MaterialIcon><span>FALSE<small>FAŁSZ</small></span>
          </button>
        </div>
      </div>
      <Feedback>{verdict ? (verdict === 'true' ? copy(lang, 'Correct. The bridge lights are on.', 'Dobrze. Światła mostu są włączone.') : copy(lang, 'Look again at the river map.', 'Spójrz jeszcze raz na mapę rzeki.')) : copy(lang, 'The court is waiting.', 'Sąd czeka na decyzję.')}</Feedback>
    </div>
  )
}

function UnjumbleScene({ lang }) {
  const source = useMemo(() => [
    { id: 0, word: 'every' }, { id: 1, word: 'I' }, { id: 2, word: 'morning' },
    { id: 3, word: 'the' }, { id: 4, word: 'take' }, { id: 5, word: 'metro' },
  ], [])
  const correct = 'I take the metro every morning'
  const [placed, setPlaced] = useState([])
  const sentence = placed.map(id => source.find(item => item.id === id)?.word).join(' ')
  const complete = placed.length === source.length
  return (
    <div className="gh-preview-scene gh-preview-unjumble">
      <SceneHeader icon="low_priority" eyebrow="English Metropolis · Puzzle Workshop" title="Build it in order"
        detail={copy(lang, 'Snap each word block onto the brass rail', 'Ułóż klocki ze słowami na mosiężnej szynie')} progress={`${placed.length} / ${source.length}`}/>
      <div className={`gh-jumble-bench${complete && sentence === correct ? ' is-complete' : ''}`}>
        <span className="gh-jumble-lamp" aria-hidden><i/></span>
        <span className="gh-jumble-ruler" aria-hidden/>
        <span className="gh-jumble-pencil" aria-hidden/>
        <section className="gh-jumble-brief">
          <span>SENTENCE NO. 01 · DAILY ROUTE</span>
          <strong>{copy(lang, 'Put the commute in order.', 'Ułóż zdanie o codziennej podróży.')}</strong>
        </section>
        <div className="gh-jumble-rail" aria-label={copy(lang, 'Sentence rail', 'Szyna zdania')}>
          {placed.length ? placed.map(id => <button key={id} type="button" onClick={() => setPlaced(items => items.filter(item => item !== id))}>{source.find(item => item.id === id)?.word}</button>) : <span>{copy(lang, 'words snap here', 'tu wskakują słowa')}</span>}
        </div>
        <div className="gh-jumble-tiles" aria-label={copy(lang, 'Word blocks', 'Klocki ze słowami')}>
          {source.map(item => <button type="button" key={item.id} disabled={placed.includes(item.id)}
            onClick={() => setPlaced(items => [...items, item.id])}>{item.word}</button>)}
        </div>
      </div>
      <Feedback>{complete ? (sentence === correct ? copy(lang, 'Perfect fit. The rail is locked!', 'Idealnie. Szyna jest gotowa!') : copy(lang, 'Close. Tap a tile to move it back.', 'Blisko. Dotknij klocka, aby go cofnąć.')) : copy(lang, 'Each choice moves the sentence.', 'Każdy wybór buduje zdanie.')}</Feedback>
    </div>
  )
}

function MatchingScene({ lang }) {
  const pairs = [
    { id: 'apple', en: 'apple', pl: 'jabłko', icon: 'nutrition' },
    { id: 'water', en: 'water', pl: 'woda', icon: 'water_drop' },
    { id: 'bread', en: 'bread', pl: 'chleb', icon: 'bakery_dining' },
  ]
  const [selected, setSelected] = useState('')
  const [matched, setMatched] = useState([])
  const [miss, setMiss] = useState(false)
  const choosePolish = (id) => {
    if (!selected) return
    if (selected === id) {
      setMatched(items => items.includes(id) ? items : [...items, id])
      setMiss(false)
    } else setMiss(true)
    setSelected('')
  }
  return (
    <div className="gh-preview-scene gh-preview-matching">
      <SceneHeader icon="join_inner" eyebrow="English Metropolis · Bridge District" title="Connect the stations"
        detail={copy(lang, 'Match each English sign to its Polish stop', 'Połącz angielski znak z polskim przystankiem')} progress={`${matched.length} / ${pairs.length}`}/>
      <div className="gh-match-district">
        <div className="gh-match-skyline" aria-hidden><i/><i/><i/><i/><i/></div>
        <span className="gh-match-bridge" aria-hidden><i/><b/><em/></span>
        <span className={`gh-match-train gh-match-train--${matched.length}`} aria-hidden><i/><i/></span>
        <div className="gh-match-bank gh-match-bank--en">
          <span>ENGLISH BANK</span>
          {pairs.map(pair => <button type="button" key={pair.id} disabled={matched.includes(pair.id)}
            className={selected === pair.id ? 'is-selected' : ''} onClick={() => { setSelected(pair.id); setMiss(false) }}>
            <MaterialIcon>{pair.icon}</MaterialIcon>{pair.en}</button>)}
        </div>
        <div className="gh-match-routes" aria-hidden>
          {pairs.map(pair => <i key={pair.id} className={matched.includes(pair.id) ? 'is-lit' : ''}/>) }
        </div>
        <div className="gh-match-bank gh-match-bank--pl">
          <span>POLSKI BRZEG</span>
          {pairs.map(pair => <button type="button" key={pair.id} disabled={matched.includes(pair.id)}
            onClick={() => choosePolish(pair.id)}>{pair.pl}<MaterialIcon>location_on</MaterialIcon></button>)}
        </div>
      </div>
      <Feedback>{matched.length === pairs.length ? copy(lang, 'All lines connected. The train is moving!', 'Wszystkie linie połączone. Pociąg rusza!') : miss ? copy(lang, 'Those stations are on different lines.', 'Te stacje są na różnych liniach.') : selected ? copy(lang, 'Now choose the Polish station.', 'Teraz wybierz polską stację.') : copy(lang, 'Start on the English bank.', 'Zacznij po angielskiej stronie.')}</Feedback>
    </div>
  )
}

function MemoryScene({ lang }) {
  const [open, setOpen] = useState([])
  const [matched, setMatched] = useState([])
  useEffect(() => {
    if (open.length !== 2) return undefined
    const first = MEMORY_CARDS.find(card => card.id === open[0])
    const second = MEMORY_CARDS.find(card => card.id === open[1])
    const timer = window.setTimeout(() => {
      if (first?.pair === second?.pair) setMatched(items => [...new Set([...items, first.pair])])
      setOpen([])
    }, 560)
    return () => window.clearTimeout(timer)
  }, [open])
  const flip = (id) => {
    if (open.length >= 2 || open.includes(id)) return
    const card = MEMORY_CARDS.find(item => item.id === id)
    if (matched.includes(card.pair)) return
    setOpen(items => [...items, id])
  }
  return (
    <div className="gh-preview-scene gh-preview-memory">
      <SceneHeader icon="grid_view" eyebrow="English Metropolis · Memory Cellar" title="Find the hidden pairs"
        detail={copy(lang, 'Flip two cabinet cards at a time', 'Odwracaj po dwie karty z gabloty')} progress={`${matched.length} / 3`}/>
      <div className={`gh-memory-cabinet${matched.length === 3 ? ' is-complete' : ''}`}>
        <span className="gh-memory-lamp" aria-hidden><i/></span>
        <span className="gh-memory-shelf gh-memory-shelf--one" aria-hidden/>
        <span className="gh-memory-shelf gh-memory-shelf--two" aria-hidden/>
        <div className="gh-memory-grid" aria-label={copy(lang, 'Memory cards', 'Karty pamięci')}>
          {MEMORY_CARDS.map(card => {
            const visible = open.includes(card.id) || matched.includes(card.pair)
            return (
              <button type="button" key={card.id} onClick={() => flip(card.id)}
                className={`${visible ? 'is-open' : ''}${matched.includes(card.pair) ? ' is-matched' : ''}`}
                aria-label={visible ? card.label : copy(lang, 'Hidden memory card', 'Ukryta karta pamięci')}>
                <span className="gh-memory-card-inner">
                  <span className="gh-memory-card-back"><MaterialIcon>emergency</MaterialIcon><small>EM</small></span>
                  <span className="gh-memory-card-face"><MaterialIcon>{card.icon}</MaterialIcon><strong>{card.label}</strong></span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <Feedback>{matched.length === 3 ? copy(lang, 'Cabinet complete. Brilliant memory!', 'Gablota ukończona. Świetna pamięć!') : copy(lang, 'Matched pairs light the cabinet.', 'Dopasowane pary rozświetlają gablotę.')}</Feedback>
    </div>
  )
}

const SCENES = {
  flashcards: FlashcardsScene,
  multiplechoice: QuizScene,
  gapfill: GapFillScene,
  truefalse: TrueFalseScene,
  unjumble: UnjumbleScene,
  matching: MatchingScene,
  concentration: MemoryScene,
}

export default function HeroPracticePreview({ game, lang = 'en' }) {
  const Scene = SCENES[game] || FlashcardsScene
  return <Scene lang={lang}/>
}
