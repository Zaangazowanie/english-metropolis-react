import { useEffect, useState } from 'react'
import './hero-practice-preview.css'

const WORDS = [
  {
    word: 'morning',
    pl: 'poranek',
    icon: 'wb_twilight',
    phonetic: '/ˈmɔː.nɪŋ/',
    kind: 'noun',
    example: 'Good morning! The first train is here.',
  },
  {
    word: 'coffee',
    pl: 'kawa',
    icon: 'local_cafe',
    phonetic: '/ˈkɒf.i/',
    kind: 'noun',
    example: 'Could I have a coffee, please?',
  },
  {
    word: 'station',
    pl: 'stacja',
    icon: 'train',
    phonetic: '/ˈsteɪ.ʃən/',
    kind: 'noun',
    example: 'Meet me outside the station.',
  },
]

const JUMBLE_WORDS = [
  { id: 0, word: 'every' },
  { id: 1, word: 'I' },
  { id: 2, word: 'morning' },
  { id: 3, word: 'the' },
  { id: 4, word: 'take' },
  { id: 5, word: 'metro' },
]

const MATCH_PAIRS = [
  { id: 'apple', en: 'apple', pl: 'jabłko', icon: 'nutrition' },
  { id: 'water', en: 'water', pl: 'woda', icon: 'water_drop' },
  { id: 'bread', en: 'bread', pl: 'chleb', icon: 'bakery_dining' },
]

const POLISH_STOPS = [MATCH_PAIRS[2], MATCH_PAIRS[0], MATCH_PAIRS[1]]

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

function SceneHeader({ icon, route, title, detail, current, total }) {
  return (
    <header className="gh-preview-head">
      <span className="gh-preview-mark"><MaterialIcon>{icon}</MaterialIcon></span>
      <span className="gh-preview-heading">
        <span className="gh-preview-route">{route}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="gh-preview-progress" aria-label={`Progress ${current} of ${total}`}>
        <span className="gh-preview-stops" aria-hidden>
          {Array.from({ length: total }, (_, index) => (
            <i key={index} className={index < current ? 'is-done' : index === current ? 'is-next' : ''}/>
          ))}
        </span>
        <b>{current}/{total}</b>
      </span>
    </header>
  )
}

function Feedback({ tone = 'idle', icon, children }) {
  const resolvedIcon = icon || (tone === 'success' ? 'check_circle' : tone === 'error' ? 'error' : 'arrow_forward')
  return (
    <span className="gh-preview-feedback" data-tone={tone} role="status" aria-live="polite">
      <MaterialIcon>{resolvedIcon}</MaterialIcon>
      <span>{children}</span>
    </span>
  )
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
    <div className="gh-preview-scene gh-preview-flashcards" data-word={card.word}>
      <SceneHeader icon="style" route="Ocean Line / Reading Lounge" title="Holographic words"
        detail={copy(lang, 'Reveal the meaning, then route the card', 'Odkryj znaczenie i wybierz trasę karty')}
        current={index + 1} total={WORDS.length}/>
      <div className="gh-flash-city" aria-hidden>
        <span className="gh-flash-sun"/>
        <span className="gh-flash-skyline"><i/><i/><i/><i/><i/></span>
        <span className="gh-flash-palm gh-flash-palm--one"><i/><i/><i/></span>
        <span className="gh-flash-palm gh-flash-palm--two"><i/><i/><i/></span>
        <span className="gh-flash-table"/>
        <span className="gh-flash-cup"><i/></span>
      </div>
      <div className="gh-flash-stack">
        <span className="gh-flash-pass gh-flash-pass--coral" aria-hidden/>
        <span className="gh-flash-pass gh-flash-pass--cyan" aria-hidden/>
        <button key={card.word} type="button" className={`gh-flash-card${flipped ? ' is-flipped' : ''}`}
          onClick={() => setFlipped(value => !value)} aria-pressed={flipped}
          aria-label={copy(lang, flipped ? 'Show English word' : 'Show Polish meaning', flipped ? 'Pokaż angielskie słowo' : 'Pokaż polskie znaczenie')}>
          <span className="gh-flash-card-inner">
            <span className="gh-flash-card-face gh-flash-card-front">
              <span className="gh-flash-card-code">EM / WORD PASS</span>
              <span className="gh-flash-word-art" aria-hidden>
                <i/><b/><em/>
                <MaterialIcon>{card.icon}</MaterialIcon>
              </span>
              <span className="gh-flash-word">{card.word}</span>
              <span className="gh-flash-phonetic">{card.kind} <i/> {card.phonetic}</span>
              <span className="gh-flash-hint"><MaterialIcon>360</MaterialIcon>{copy(lang, 'Reveal meaning', 'Pokaż znaczenie')}</span>
            </span>
            <span className="gh-flash-card-face gh-flash-card-back">
              <span className="gh-flash-card-code">POLISH CONNECTION</span>
              <span className="gh-flash-translation">{card.pl}</span>
              <span className="gh-flash-example">{card.example}</span>
              <span className="gh-flash-hint"><MaterialIcon>360</MaterialIcon>{copy(lang, 'Show front', 'Pokaż przód')}</span>
            </span>
          </span>
        </button>
      </div>
      <div className={`gh-flash-actions${flipped ? ' is-ready' : ''}`}>
        <button type="button" disabled={!flipped} onClick={() => setFlipped(false)}>
          <MaterialIcon>replay</MaterialIcon>{copy(lang, 'Again', 'Jeszcze raz')}
        </button>
        <button type="button" className="is-primary" disabled={!flipped} onClick={advance}>
          <MaterialIcon>check</MaterialIcon>{copy(lang, 'Got it', 'Umiem')}
        </button>
      </div>
      <Feedback icon="touch_app">
        {copy(lang, 'Tap the card to reveal the meaning, then choose Again or Got it.', 'Dotknij karty, odkryj znaczenie, a potem wybierz „Jeszcze raz” lub „Umiem”.')}
      </Feedback>
    </div>
  )
}

function QuizScene({ lang }) {
  const [answer, setAnswer] = useState('')
  const options = ['bridge', 'station', 'window', 'coffee']
  const correct = 'station'
  const tone = !answer ? 'idle' : answer === correct ? 'success' : 'error'

  return (
    <div className="gh-preview-scene gh-preview-quiz" data-state={tone}>
      <SceneHeader icon="quiz" route="Metro Core / Platform Quiz" title="Catch the train"
        detail={copy(lang, 'Complete the live platform announcement', 'Uzupełnij komunikat na peronie')}
        current={answer === correct ? 2 : 1} total={4}/>
      <div className="gh-quiz-terminal">
        <div className="gh-quiz-horizon" aria-hidden><i/><i/><i/><i/><i/></div>
        <section className="gh-quiz-board" aria-label="Quiz question">
          <span className="gh-quiz-board-route"><MaterialIcon>train</MaterialIcon> NIGHT SERVICE / A2</span>
          <strong>The next train leaves from the <b data-filled={Boolean(answer)}>{answer || '______'}</b>.</strong>
          <small>Następny pociąg odjeżdża ze stacji.</small>
          <span className="gh-quiz-train" aria-hidden><i/><i/><i/></span>
          <span className="gh-quiz-scan" aria-hidden/>
        </section>
        <div className="gh-quiz-options" role="radiogroup" aria-label={copy(lang, 'Answer options', 'Opcje odpowiedzi')}>
          {options.map((option, optionIndex) => {
            const selected = answer === option
            const state = selected ? (option === correct ? ' is-correct' : ' is-wrong') : ''
            return (
              <button key={option} type="button" role="radio" aria-checked={selected} className={state}
                onClick={() => setAnswer(option)}>
                <span className="gh-quiz-index">{String.fromCharCode(65 + optionIndex)}</span>
                <span>{option}</span>
                {selected && <MaterialIcon>{option === correct ? 'check' : 'close'}</MaterialIcon>}
              </button>
            )
          })}
        </div>
      </div>
      <Feedback tone={tone}>
        {copy(lang, 'Choose the answer that completes the announcement.', 'Wybierz odpowiedź, która uzupełnia komunikat.')}
      </Feedback>
    </div>
  )
}

function GapFillScene({ lang }) {
  const [word, setWord] = useState('')
  const options = ['latte', 'ticket', 'bridge']
  const tone = !word ? 'idle' : word === 'latte' ? 'success' : 'error'

  return (
    <div className="gh-preview-scene gh-preview-gapfill" data-state={tone}>
      <SceneHeader icon="edit_note" route="Night Market / Sentence Works" title="Power the phrase"
        detail={copy(lang, 'Slot one word into the café request', 'Wstaw jedno słowo do zamówienia')}
        current={word === 'latte' ? 2 : 1} total={3}/>
      <div className={`gh-gap-market${word === 'latte' ? ' is-open' : ''}`}>
        <div className="gh-gap-city" aria-hidden><i/><i/><i/><i/></div>
        <span className="gh-gap-crane" aria-hidden><i><b/></i></span>
        <div className="gh-gap-cafe" aria-hidden>
          <span className="gh-gap-cafe-sign">CAFÉ 24</span>
          <span className="gh-gap-open-sign">OPEN</span>
          <span className="gh-gap-window"><i/><i/></span>
          <span className="gh-gap-door"/>
        </div>
        <section className="gh-gap-marquee" aria-label="Gap fill sentence">
          <span><MaterialIcon>local_cafe</MaterialIcon> NIGHT MARKET ENGLISH</span>
          <strong>Could I have a <b data-filled={Boolean(word)}>{word || '______'}</b>, please?</strong>
          <small>Poproszę latte.</small>
          {word && <em key={word} className="gh-gap-word-flight" aria-hidden>{word}</em>}
        </section>
        <div className="gh-gap-blocks" role="group" aria-label={copy(lang, 'Word choices', 'Wybór słów')}>
          {options.map(option => {
            const selected = word === option
            return (
              <button type="button" key={option} onClick={() => setWord(option)} aria-pressed={selected}
                className={selected ? (option === 'latte' ? 'is-correct' : 'is-wrong') : ''}>
                <MaterialIcon>{option === 'latte' ? 'local_cafe' : option === 'ticket' ? 'confirmation_number' : 'conversion_path'}</MaterialIcon>
                {option}
                {selected && <MaterialIcon>{option === 'latte' ? 'check' : 'close'}</MaterialIcon>}
              </button>
            )
          })}
        </div>
      </div>
      <Feedback tone={tone}>
        {copy(lang, 'Choose the word that completes the sentence.', 'Wybierz słowo, które uzupełnia zdanie.')}
      </Feedback>
    </div>
  )
}

function TrueFalseScene({ lang }) {
  const [verdict, setVerdict] = useState('')
  const tone = !verdict ? 'idle' : verdict === 'true' ? 'success' : 'error'

  return (
    <div className="gh-preview-scene gh-preview-truefalse" data-state={tone}>
      <SceneHeader icon="balance" route="Civic Line / Truth Tribunal" title="Read the evidence"
        detail={copy(lang, 'Choose the verdict that fits the city fact', 'Wybierz werdykt zgodny z faktem')}
        current={verdict === 'true' ? 2 : 1} total={5}/>
      <div className={`gh-tf-tribunal${verdict ? ` has-${verdict}` : ''}`}>
        <section className="gh-tf-evidence" aria-label="Statement">
          <span><MaterialIcon>fact_check</MaterialIcon> EVIDENCE / LONDON</span>
          <strong>“Tower Bridge crosses the River Thames.”</strong>
          <small>Tower Bridge przecina Tamizę.</small>
          <i className="gh-tf-evidence-scan" aria-hidden/>
        </section>
        <div className="gh-tf-scale" aria-hidden>
          <span className="gh-tf-scale-beam"><i/><b/><em/></span>
          <span className="gh-tf-scale-stand"/>
        </div>
        <div className="gh-tf-actions" role="group" aria-label={copy(lang, 'True or false', 'Prawda czy fałsz')}>
          <button type="button" className={verdict === 'true' ? 'is-selected is-correct' : ''}
            aria-pressed={verdict === 'true'} onClick={() => setVerdict('true')}>
            <MaterialIcon>check_circle</MaterialIcon><span>TRUE<small>PRAWDA</small></span>
            {verdict === 'true' && <MaterialIcon>verified</MaterialIcon>}
          </button>
          <button type="button" className={verdict === 'false' ? 'is-selected is-wrong' : ''}
            aria-pressed={verdict === 'false'} onClick={() => setVerdict('false')}>
            <MaterialIcon>cancel</MaterialIcon><span>FALSE<small>FAŁSZ</small></span>
            {verdict === 'false' && <MaterialIcon>error</MaterialIcon>}
          </button>
        </div>
      </div>
      <Feedback tone={tone}>
        {copy(lang, 'Decide whether the sentence is true or false.', 'Zdecyduj, czy zdanie jest prawdziwe, czy fałszywe.')}
      </Feedback>
    </div>
  )
}

function UnjumbleScene({ lang }) {
  const correct = 'I take the metro every morning'
  const [placed, setPlaced] = useState([])
  const sentence = placed.map(id => JUMBLE_WORDS.find(item => item.id === id)?.word).join(' ')
  const complete = placed.length === JUMBLE_WORDS.length
  const tone = !complete ? 'idle' : sentence === correct ? 'success' : 'error'
  const clear = () => setPlaced([])

  return (
    <div className="gh-preview-scene gh-preview-unjumble" data-state={tone}>
      <SceneHeader icon="low_priority" route="Type Foundry / Maglev Rail" title="Build the route"
        detail={copy(lang, 'Snap every word onto the sentence rail', 'Umieść każde słowo na szynie zdania')}
        current={placed.length} total={JUMBLE_WORDS.length}/>
      <div className={`gh-jumble-foundry${tone === 'success' ? ' is-complete' : tone === 'error' ? ' has-error' : ''}`}>
        <span className="gh-jumble-sun" aria-hidden/>
        <span className="gh-jumble-city" aria-hidden><i/><i/><i/><i/></span>
        <section className="gh-jumble-brief">
          <span><MaterialIcon>route</MaterialIcon> DAILY COMMUTE</span>
          <strong>{copy(lang, 'Put the metro sentence in order.', 'Ułóż zdanie o codziennej podróży.')}</strong>
          {placed.length > 0 && <button type="button" className="gh-jumble-clear" onClick={clear} aria-label={copy(lang, 'Clear sentence', 'Wyczyść zdanie')}><MaterialIcon>restart_alt</MaterialIcon></button>}
        </section>
        <div className="gh-jumble-rail" aria-label={copy(lang, 'Sentence rail', 'Szyna zdania')} aria-live="polite">
          <span className="gh-jumble-rail-line" aria-hidden/>
          {placed.length ? placed.map(id => (
            <button key={id} type="button" onClick={() => setPlaced(items => items.filter(item => item !== id))}>
              {JUMBLE_WORDS.find(item => item.id === id)?.word}<MaterialIcon>close</MaterialIcon>
            </button>
          )) : <span className="gh-jumble-placeholder">{copy(lang, 'Words dock here', 'Tutaj trafiają słowa')}</span>}
          {tone === 'success' && <MaterialIcon className="gh-jumble-lock">lock</MaterialIcon>}
        </div>
        <div className="gh-jumble-tiles" aria-label={copy(lang, 'Word blocks', 'Klocki ze słowami')}>
          {JUMBLE_WORDS.map(item => (
            <button type="button" key={item.id} disabled={placed.includes(item.id)}
              onClick={() => setPlaced(items => [...items, item.id])}>{item.word}</button>
          ))}
        </div>
        <span className="gh-jumble-scanner" aria-hidden/>
      </div>
      <Feedback tone={tone}>
        {copy(lang, 'Tap the words in order to build the sentence.', 'Dotykaj słów w kolejności, aby ułożyć zdanie.')}
      </Feedback>
    </div>
  )
}

function MatchingScene({ lang }) {
  const [selected, setSelected] = useState('')
  const [matched, setMatched] = useState([])
  const [missId, setMissId] = useState('')
  const choosePolish = (id) => {
    if (!selected) return
    if (selected === id) {
      setMatched(items => items.includes(id) ? items : [...items, id])
      setMissId('')
    } else setMissId(id)
    setSelected('')
  }
  const reset = () => {
    setSelected('')
    setMatched([])
    setMissId('')
  }
  const complete = matched.length === MATCH_PAIRS.length
  const tone = complete ? 'success' : missId ? 'error' : 'idle'

  return (
    <div className="gh-preview-scene gh-preview-matching" data-state={tone}>
      <SceneHeader icon="join_inner" route="Biscayne Line / Switchboard" title="Match the banks"
        detail={copy(lang, 'Route each English stop to its Polish match', 'Połącz angielski przystanek z polskim')}
        current={matched.length} total={MATCH_PAIRS.length}/>
      <div className={`gh-match-interchange${complete ? ' is-complete' : ''}`}>
        <span className="gh-match-sun" aria-hidden/>
        <div className="gh-match-skyline" aria-hidden><i/><i/><i/><i/><i/></div>
        <span className="gh-match-bridge" aria-hidden><i/><b/><em/></span>
        <span className="gh-match-spine" aria-hidden>
          {MATCH_PAIRS.map(pair => <i key={pair.id} className={matched.includes(pair.id) ? 'is-lit' : ''}/>)}
        </span>
        <span className="gh-match-train" style={{ '--match-step': matched.length }} aria-hidden><i/><i/></span>
        <div className="gh-match-bank gh-match-bank--en">
          <span>ENGLISH</span>
          {MATCH_PAIRS.map(pair => {
            const done = matched.includes(pair.id)
            return (
              <button type="button" key={pair.id} disabled={done} aria-pressed={selected === pair.id}
                className={`${selected === pair.id ? 'is-selected' : ''}${done ? ' is-matched' : ''}`}
                onClick={() => { setSelected(pair.id); setMissId('') }}>
                <MaterialIcon>{pair.icon}</MaterialIcon><span>{pair.en}</span>{done && <MaterialIcon>check</MaterialIcon>}
              </button>
            )
          })}
        </div>
        <div className="gh-match-bank gh-match-bank--pl">
          <span>POLSKI</span>
          {POLISH_STOPS.map(pair => {
            const done = matched.includes(pair.id)
            return (
              <button type="button" key={pair.id} disabled={done}
                className={`${missId === pair.id ? 'is-wrong' : ''}${done ? ' is-matched' : ''}`}
                onClick={() => choosePolish(pair.id)}>
                {done && <MaterialIcon>check</MaterialIcon>}<span>{pair.pl}</span><MaterialIcon>location_on</MaterialIcon>
              </button>
            )
          })}
        </div>
        {complete && <button type="button" className="gh-scene-replay" onClick={reset}><MaterialIcon>replay</MaterialIcon>{copy(lang, 'Replay', 'Zagraj ponownie')}</button>}
      </div>
      <Feedback tone={tone}>
        {copy(lang, 'Match each English word to its Polish meaning.', 'Dopasuj każde angielskie słowo do polskiego znaczenia.')}
      </Feedback>
    </div>
  )
}

function MemoryScene({ lang }) {
  const [open, setOpen] = useState([])
  const [matched, setMatched] = useState([])
  const [mismatch, setMismatch] = useState([])
  const [moves, setMoves] = useState(0)
  useEffect(() => {
    if (open.length !== 2) return undefined
    const first = MEMORY_CARDS.find(card => card.id === open[0])
    const second = MEMORY_CARDS.find(card => card.id === open[1])
    let closeTimer
    const revealTimer = window.setTimeout(() => {
      if (first?.pair === second?.pair) {
        setMatched(items => [...new Set([...items, first.pair])])
        setOpen([])
      } else {
        setMismatch(open)
        closeTimer = window.setTimeout(() => {
          setOpen([])
          setMismatch([])
        }, 260)
      }
    }, 520)
    return () => {
      window.clearTimeout(revealTimer)
      window.clearTimeout(closeTimer)
    }
  }, [open])
  const flip = (id) => {
    if (open.length >= 2 || open.includes(id)) return
    const card = MEMORY_CARDS.find(item => item.id === id)
    if (matched.includes(card.pair)) return
    const next = [...open, id]
    if (next.length === 2) setMoves(value => value + 1)
    setOpen(next)
  }
  const reset = () => {
    setOpen([])
    setMatched([])
    setMismatch([])
    setMoves(0)
  }
  const complete = matched.length === 3

  return (
    <div className="gh-preview-scene gh-preview-memory" data-state={complete ? 'success' : 'idle'}>
      <SceneHeader icon="grid_view" route="Ocean Drive / Signal Vault" title="Find hidden pairs"
        detail={copy(lang, 'Flip two signal cards at a time', 'Odwracaj po dwie karty sygnałowe')}
        current={matched.length} total={3}/>
      <div className={`gh-memory-vault${complete ? ' is-complete' : ''}`}>
        <span className="gh-memory-crown" aria-hidden><i/><i/><i/></span>
        <span className="gh-memory-sun" aria-hidden/>
        <span className="gh-memory-moves"><MaterialIcon>visibility</MaterialIcon>{moves} {copy(lang, 'moves', 'ruchy')}</span>
        <div className="gh-memory-grid" aria-label={copy(lang, 'Memory cards', 'Karty pamięci')}>
          {MEMORY_CARDS.map(card => {
            const visible = open.includes(card.id) || matched.includes(card.pair)
            const done = matched.includes(card.pair)
            const missed = mismatch.includes(card.id)
            return (
              <button type="button" key={card.id} onClick={() => flip(card.id)} disabled={done}
                aria-pressed={visible} aria-label={`${card.label}, ${done ? copy(lang, 'matched', 'dopasowana') : visible ? copy(lang, 'open', 'odkryta') : copy(lang, 'hidden', 'ukryta')}`}
                className={`${visible ? 'is-open' : ''}${done ? ' is-matched' : ''}${missed ? ' is-mismatch' : ''}`}>
                <span className="gh-memory-card-inner">
                  <span className="gh-memory-card-back"><MaterialIcon>flare</MaterialIcon><small>EM</small></span>
                  <span className="gh-memory-card-face"><MaterialIcon>{card.icon}</MaterialIcon><strong>{card.label}</strong>{done && <MaterialIcon className="gh-memory-check">check</MaterialIcon>}</span>
                </span>
              </button>
            )
          })}
        </div>
        {complete && <button type="button" className="gh-scene-replay" onClick={reset}><MaterialIcon>replay</MaterialIcon>{copy(lang, 'Replay', 'Zagraj ponownie')}</button>}
      </div>
      <Feedback tone={complete ? 'success' : 'idle'} icon={complete ? 'verified' : 'grid_view'}>
        {copy(lang, 'Turn over two cards to find a matching pair.', 'Odkryj dwie karty, aby znaleźć pasującą parę.')}
      </Feedback>
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
