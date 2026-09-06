import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import { walkthroughDelay, cursorTarget, playbackDuration } from './bajla-tour.mjs'
import './bajla-walkthrough.css'

const STEPS = {
  memory: [['Ask about your learning','Zapytaj o swoją naukę'],['Bajla connects your lessons','Bajla łączy Twoje lekcje'],['Your recurring habits appear','Pojawiają się Twoje nawyki'],['Open a recurring pattern','Otwórz powtarzający się błąd'],['See the correction in context','Zobacz poprawkę w kontekście'],['Try a personalised question','Rozwiąż własne ćwiczenie'],['Get feedback and continue','Sprawdź odpowiedź i ćwicz dalej']],
  voice: [['Ask about a word','Zapytaj o słowo'],['Bajla prepares your practice','Bajla przygotowuje ćwiczenie'],['Read the word and its sounds','Zobacz słowo i jego dźwięki'],['Send a voice attempt','Wyślij próbę głosową'],['See sound-by-sound feedback','Sprawdź wskazówki do wymowy'],['Open the native-speaker clip','Otwórz klip native speakera'],['Hear the word in context','Posłuchaj słowa w kontekście']],
  grammar: [['Ask about your sentence','Zapytaj o swoje zdanie'],['Bajla finds the pattern','Bajla szuka wzorca'],['Read a clear explanation','Przeczytaj krótkie wyjaśnienie'],['Compare the two sentences','Porównaj dwa zdania'],['Try the next example','Spróbuj kolejnego przykładu'],['Choose your answer','Wybierz odpowiedź'],['Get a useful correction','Otrzymaj pomocną poprawkę']],
  booking: [['Message about your lesson','Napisz w sprawie lekcji'],['Bajla checks availability','Bajla sprawdza dostępność'],['Browse available times','Przejrzyj wolne terminy'],['Choose a time','Wybierz termin'],['Review the lesson details','Sprawdź szczegóły lekcji'],['Confirm the change','Potwierdź zmianę'],['Your calendar is updated','Twój kalendarz jest aktualny']],
  notes: [['Ask for your notes','Poproś o notatki'],['Bajla finds your lesson','Bajla znajduje Twoją lekcję'],['Receive the lesson PDF','Odbierz PDF z lekcji'],['Open the document preview','Otwórz podgląd dokumentu'],['Revisit your lesson vocabulary','Wróć do słów z lekcji'],['Turn a word into practice','Zamień słowo w ćwiczenie'],['Flip the card and check','Odwróć fiszkę i sprawdź']],
  practice: [['Ask for a quick drill','Poproś o krótką powtórkę'],['Bajla gathers your material','Bajla zbiera Twój materiał'],['Choose a practice mode','Wybierz rodzaj ćwiczenia'],['Your exercise loads','Ćwiczenie się ładuje'],['Play the first question','Rozwiąż pierwsze pytanie'],['Submit an answer','Wyślij odpowiedź'],['Read the feedback','Przeczytaj informację zwrotną']],
  word: [['Pick up your lesson words','Wróć do słów z lekcji'],['Bajla opens your vocabulary','Bajla otwiera Twoje słownictwo'],['Choose a word','Wybierz słowo'],['Choose what to do with it','Wybierz, co z nim zrobić'],['A real-speaker clip arrives','Pojawia się klip native speakera'],['Open the video preview','Otwórz podgląd nagrania'],['Replay the highlighted line','Powtórz wyróżnione zdanie']],
}
const WORDS = {
  mural: { meaning: 'mural / malowidło ścienne', ipa: '/ˈmjʊərəl/', example: 'The artist painted a colourful mural on the wall.', video: 'sNFh9bL5yzg', start:949, end:956, before:'It was created using the same methods and techniques as the ', after:' of 1953' },
  berth: { meaning:'koja / miejsce do spania', ipa:'/bɜːθ/', example:'I booked a berth on the night train.', video:'H0zeipr-cVc', start:530, end:533, before:'or do I need to leave this teacher wide ', after:', and just do what I’m told?' },
  pescatarian: { meaning:'osoba jedząca ryby, ale nie mięso', ipa:'/ˌpeskəˈteəriən/', example:'She is a pescatarian, so she ordered the fish.', video:'6d-LMzIlr5I', start:3119, end:3125, before:'You know, to be honest, if you could be a ', after:' —' },
}
const HABIT_DRILLS = [
  { question:'We can go by train. It depends ___ the price.', options:['of','on','from'], correct:'on', action:['Practise prepositions','Poćwicz przyimki'], rule:['Keep “depend on” together.','Zapamiętaj zwrot „depend on”.'] },
  { question:'For the night train, I booked ___ berth.', options:['a','an','—'], correct:'a', action:['Practise articles','Poćwicz przedimki'], rule:['Use “a” before a singular countable noun with a consonant sound: a berth.','Przed rzeczownikiem policzalnym w liczbie pojedynczej z dźwiękiem spółgłoski użyj „a”: a berth.'] },
  { question:'She ___ not like delays.', options:['do','does','is'], correct:'does', action:['Practise auxiliary verbs','Poćwicz czasowniki posiłkowe'], rule:['With she, he and it, use “does not” + the base verb.','Z she, he i it użyj „does not” + czasownika w formie podstawowej.'] },
]
const MODES = [
  ['flashcards','style','Flashcards','Fiszki','Word → meaning','Słowo → znaczenie'],
  ['quiz','casino','Word quiz','Quiz słowny','Three options, one right answer','Trzy opcje, jedna dobra odpowiedź'],
  ['usage','chat','Ask about a word','Zapytaj o słowo','Collocations, usage, examples','Kolokacje, użycie, przykłady'],
  ['gap','edit_note','Fill the gap','Uzupełnij lukę','Built from your own mistakes','Na podstawie Twoich błędów'],
  ['hear','volume_up','Hear a word','Posłuchaj słowa','Real speakers, in context','Prawdziwi rozmówcy, w kontekście'],
]
function Icon({name}){return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>}
function Stream({text, running, reduced}){
  const [count,setCount]=useState(reduced?text.length:0)
  useEffect(()=>{if(reduced&&count<text.length){const timer=setTimeout(()=>setCount(text.length),0);return()=>clearTimeout(timer)}if(reduced||!running||count>=text.length)return; const timer=setTimeout(()=>setCount(c=>Math.min(text.length,c+3)),playbackDuration(24));return()=>clearTimeout(timer)},[count,text,running,reduced])
  return <span>{reduced?text:text.slice(0,count)}{!reduced&&count<text.length&&<i className="bj-stream-caret" aria-hidden="true"/>}</span>
}
function Typing({pl}){return <div className="bj-walk-typing" role="status"><img src="/brand/em-bajla-icon.webp" alt=""/><i/><i/><i/><span className="bj-walk-sr">{pl?'Bajla pisze':'Bajla is typing'}</span></div>}
function Stamp({sent}){return <small className="bj-demo-stamp">10:24{sent&&<Icon name="done_all"/>}</small>}
function Message({children,you=false,wa=false,pl}){return <div className={`${you?'bj-demo-query':'bj-walk-message'}${wa&&!you?' bj-demo-bubble':''}`}><div>{children}</div>{wa&&<Stamp sent={you}/>}<span className="bj-walk-sr">{you?(pl?'Twoja wiadomość':'Your message'):'Bajla'}</span></div>}
function Action({children,onClick,icon='arrow_forward',selected=false}){return <button className={`bj-walk-action${selected?' bj-walk-action--selected':''}`} onClick={onClick}><Icon name={icon}/><span>{children}</span>{selected&&<Icon name="check_circle"/>}</button>}
function Clip({word,pl,opened,onOpen,playback,onPlay}){
  const data=WORDS[word];const play=playback?.word===word;const replay=playback?.revision??0
  return <div className={`bj-walk-clip${opened?' bj-walk-clip--page':''}`}>
    {opened&&<div className="bj-walk-clip-title"><Icon name="smart_display"/><span>{word}<small>{pl?'Prawdziwy rozmówca. W kontekście.':'A real speaker. In context.'}</small></span></div>}
    {play?<iframe key={`${word}-${replay}`} title={`${word} — native speaker`} src={`https://www.youtube.com/embed/${data.video}?start=${data.start}&end=${data.end}&autoplay=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button className="bj-walk-video" onClick={()=>{onOpen();onPlay(word)}} aria-label={`${pl?'Odtwórz nagranie':'Play native-speaker clip'}: ${word}`}><img src={`https://i.ytimg.com/vi/${data.video}/mqdefault.jpg`} alt="" loading="lazy"/><span className="bj-walk-play"><Icon name="play_arrow"/></span><small>{data.end-data.start}s · YouTube</small></button>}
    <blockquote>{data.before}<mark>{word}</mark>{data.after}</blockquote>
    {opened?<div className="bj-walk-clip-links"><button onClick={()=>onPlay(word)}><Icon name="replay"/>{pl?'Powtórz zdanie':'Replay the line'}</button><a href={`https://www.youtube.com/watch?v=${data.video}&t=${data.start}s`} target="_blank" rel="noopener noreferrer">{pl?'Pełne nagranie':'Full video'}<Icon name="open_in_new"/></a></div>:<Action icon="open_in_new" onClick={onOpen}>{pl?'Otwórz podgląd':'Open preview'}</Action>}
  </div>
}

export default function BajlaWalkthrough({id,wa,query,pl,auto,setAuto,onComplete,onStepChange}){
  const reduced=usePrefersReducedMotion()
  const [step,setStep]=useState(0)
  const [visible,setVisible]=useState(false)
  const [pageVisible,setPageVisible]=useState(!document.hidden)
  const [replay,setReplay]=useState(0)
  const [word,setWord]=useState(id==='voice'?'berth':'mural')
  const [mode,setMode]=useState(id==='word'?'hear':'quiz')
  const [answer,setAnswer]=useState('')
  // Intent lives above the step-keyed feature: opening a clip must not discard
  // the same click that requested playback. Automatic steps never set it.
  const [clipPlayback,setClipPlayback]=useState(null)
  const playClip=word=>{setClipPlayback(previous=>({word,revision:(previous?.revision??0)+1}))}
  const [slot,setSlot]=useState('18:00')
  const [booking,setBooking]=useState('move')
  const [selectedHabit,setSelectedHabit]=useState(0)
  const host=useRef(null),body=useRef(null),pointer=useRef(null)
  const pointerPosition=useRef({x:35,y:150})
  const steps=STEPS[id]
  const ended=step===steps.length-1
  const playbackActive=auto&&visible&&pageVisible
  const running=playbackActive&&!reduced
  // In-preview choices follow the current Play/Pause preference. A paused
  // walkthrough never resumes just because a visitor explores an option.
  const go=n=>{setClipPlayback(null);setStep(Math.max(0,Math.min(steps.length-1,n)))}
  const next=()=>ended?onComplete():go(step+1)
  useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.2});observer.observe(host.current);const onVisibility=()=>setPageVisible(!document.hidden);document.addEventListener('visibilitychange',onVisibility);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',onVisibility)}},[])
  useEffect(()=>{
    if(!playbackActive)return
    // A requested recording gets time to finish, then the tour continues.
    // Touching, focusing or exploring never changes the Play/Pause preference.
    const delay=clipPlayback?(WORDS[clipPlayback.word].end-WORDS[clipPlayback.word].start+1)*1000:walkthroughDelay(id,step)
    const timer=setTimeout(()=>{setClipPlayback(null);if(ended)onComplete();else setStep(step+1)},delay)
    return()=>clearTimeout(timer)
  },[step,playbackActive,replay,ended,id,mode,onComplete,clipPlayback])
  useEffect(()=>{
    const guide=pointer.current
    if(!guide||!running)return
    const targetSpec=cursorTarget(id,step,mode,{habit:selectedHabit,booking})
    if(!targetSpec)return
    let movement,click,scrollTimer
    const duration=walkthroughDelay(id,step)
    const timer=setTimeout(()=>{
      const target=host.current?.querySelectorAll(targetSpec[0])[targetSpec[1]]
      if(!target)return
      const conversation=body.current
      const targetRect=target.getBoundingClientRect()
      const bodyRect=conversation.getBoundingClientRect()
      // Keep the demonstrated choice above the fixed playback controls. Long
      // menus may have scrolled to their bottom while their first option is
      // the next action, especially on a phone.
      const visibleBottom=host.current.querySelector('.bj-walk-transport').getBoundingClientRect().top-12
      const needsScroll=conversation.contains(target)&&(targetRect.top<bodyRect.top+12||targetRect.bottom>visibleBottom)
      if(needsScroll)conversation.scrollBy({top:targetRect.top-(bodyRect.top+12+(visibleBottom-bodyRect.top-24-targetRect.height)/2),behavior:'smooth'})
      const movePointer=()=>{
      const frame=host.current.getBoundingClientRect(),rect=target.getBoundingClientRect()
      const point={x:Math.max(12,Math.min(frame.width-22,rect.left-frame.left+rect.width*.68)),y:Math.max(74,Math.min(frame.height-18,rect.top-frame.top+rect.height*.5))}
      const start=pointerPosition.current
      guide.style.left=`${point.x}px`;guide.style.top=`${point.y}px`
      movement=guide.animate([{opacity:0,transform:`translate(${start.x-point.x}px,${start.y-point.y}px) rotate(-12deg)`},{opacity:1,offset:.22},{opacity:1,transform:'translate(0,0) rotate(0deg)'}],{duration:playbackDuration(900),easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'})
      click=guide.querySelector('i').animate([{transform:'scale(.2)',opacity:0},{transform:'scale(.55)',opacity:.65,offset:.3},{transform:'scale(1.7)',opacity:0}],{delay:playbackDuration(900),duration:playbackDuration(500),fill:'both'})
      pointerPosition.current=point
      }
      if(needsScroll)scrollTimer=setTimeout(movePointer,playbackDuration(300))
      else movePointer()
    },Math.max(playbackDuration(650),duration-playbackDuration(1800)))
    return()=>{clearTimeout(timer);clearTimeout(scrollTimer);movement?.cancel();click?.cancel()}
  },[id,step,mode,running,replay,selectedHabit,booking])
  useEffect(()=>{const el=body.current;if(!el)return;const timer=setTimeout(()=>el.scrollTo({top:el.scrollHeight,behavior:reduced?'instant':'smooth'}),playbackDuration(90));return()=>clearTimeout(timer)},[step,reduced,answer,word,mode])
  const restart=()=>{setClipPlayback(null);setStep(0);setAnswer('');setWord(id==='voice'?'berth':'mural');setMode(id==='word'?'hear':'quiz');setSlot('18:00');setBooking('move');setSelectedHabit(0);setReplay(r=>r+1)}
  const chooseMode=value=>{setMode(value);setAnswer('');go(3)}
  const chooseWord=value=>{setWord(value);setAnswer('');go(3)}
  const automaticAnswer=step>=5&&!answer
  const copy=(en,polish)=>pl?polish:en
  const typed=(en,polish)=> <Stream key={`${id}-${step}-${replay}-${en}`} text={copy(en,polish)} running={running} reduced={reduced||!auto}/>
  const cardTitle=(en,polish)=> <div className="bj-demo-card-title">{copy(en,polish)}</div>
  const habitNames=[copy('Preposition choice','Wybór przyimka'),copy('Missing articles','Brakujące przedimki'),copy('Auxiliary verbs','Czasowniki posiłkowe')]
  const habitExamples=[['It depends of the weather.','It depends on the weather.','depend on'],['I booked berth.','I booked a berth.','a berth'],['She not like delays.','She does not like delays.','does not']]
  const exercise=()=>{
    if(mode==='flashcards')return <div className={`bj-walk-flash${step>=6?' flipped':''}`}><small>{copy('YOUR LESSON VOCABULARY','SŁOWA Z TWOJEJ LEKCJI')}</small><strong>{step>=6?'odłożyć coś na później':'to put something off'}</strong><p>{step>=6?'“Don’t put off your next adventure.”':copy('Think of the meaning, then turn the card.','Przypomnij sobie znaczenie i odwróć fiszkę.')}</p><Action icon="flip" onClick={()=>go(step>=6?4:6)}>{copy(step>=6?'Try again':'Flip card',step>=6?'Jeszcze raz':'Odwróć fiszkę')}</Action></div>
    if(mode==='hear')return <Clip key={word} word={word} pl={pl} playback={clipPlayback} onPlay={playClip} opened={step>=5} onOpen={()=>go(5)}/>
    if(mode==='usage')return <div className="bj-demo-card">{cardTitle('WORD IN CONTEXT','SŁOWO W KONTEKŚCIE')}<strong className="bj-demo-word">{word}</strong><p>{WORDS[word].meaning}</p><blockquote>{WORDS[word].example}</blockquote><div className="bj-walk-language-chips"><span>{word==='mural'?'paint a mural':word==='berth'?'book a berth':'be a pescatarian'}</span><span>{copy('Everyday English','Angielski na co dzień')}</span></div><Action icon="volume_up" onClick={()=>{setMode('hear');go(4)}}>{copy('Hear a real speaker','Posłuchaj rozmówcy')}</Action></div>
    const options=mode==='gap'?['of','on','from']:['delay it','finish it','look for it']
    const correct=options[mode==='gap'?1:0]
    const picked=answer||(automaticAnswer?correct:'')
    return <div className="bj-demo-card">{cardTitle(mode==='gap'?'FILL THE GAP':'WORD QUIZ',mode==='gap'?'UZUPEŁNIJ LUKĘ':'QUIZ SŁOWNY')}<p className="bj-demo-question">{mode==='gap'?'It depends ___ the price.':copy('To “put something off” means to…','„To put something off” oznacza…')}</p><div className="bj-walk-options">{options.map((option,i)=><button key={option} onClick={()=>{setAnswer(option);go(6)}} className={picked===option?(option===correct?'is-right':'is-wrong'):''}><span>{String.fromCharCode(65+i)}</span>{option}{picked===option&&<Icon name={option===correct?'check_circle':'refresh'}/>}</button>)}</div>{step>=6&&<div className={`bj-walk-feedback ${picked===correct?'good':'retry'}`} role="status"><Icon name={picked===correct?'check_circle':'lightbulb'}/><p>{picked===correct?copy('Exactly! Now use the phrase in your next conversation.','Tak! Użyj tego zwrotu w kolejnej rozmowie.'):copy(`Try again. The answer is “${correct}”.`,`Spróbuj jeszcze raz. Poprawna odpowiedź to „${correct}”.`)}</p></div>}<Action onClick={()=>{setAnswer('');go(4)}} icon="replay">{copy('Try the question again','Spróbuj ponownie')}</Action></div>
  }
  const caption=()=>{
    if(id==='booking'&&booking==='cancel'&&step>=2)return copy(...[
      ['Review the lesson to cancel','Sprawdź lekcję do odwołania'],
      ['Check the lesson time','Sprawdź termin lekcji'],
      ['Review the cancellation details','Sprawdź szczegóły odwołania'],
      ['Confirm the cancellation','Potwierdź odwołanie'],
      ['The lesson is cancelled in this example','Lekcja odwołana w tym przykładzie'],
    ][step-2])
    if(id==='word'&&mode==='flashcards'&&step>=4)return copy(...[
      ['Read the word on your flashcard','Przeczytaj słowo na fiszce'],
      ['Recall its meaning','Przypomnij sobie znaczenie'],
      ['Check the translation and example','Sprawdź tłumaczenie i przykład'],
    ][step-4])
    if((id==='word'||id==='practice')&&mode==='usage'&&step>=4)return copy(...[
      ['Read the meaning','Przeczytaj znaczenie'],
      ['See the word in a sentence','Zobacz słowo w zdaniu'],
      ['Use the example in your next conversation','Wykorzystaj przykład w kolejnej rozmowie'],
    ][step-4])
    if(id==='practice'&&mode==='flashcards'&&step>=4)return copy(...[
      ['Read your lesson flashcard','Przeczytaj fiszkę z lekcji'],
      ['Recall before you reveal','Przypomnij sobie znaczenie'],
      ['Flip the card and check','Odwróć fiszkę i sprawdź'],
    ][step-4])
    if(id==='practice'&&mode==='hear'&&step>=4)return copy(...[
      ['A native-speaker clip arrives','Pojawia się klip native speakera'],
      ['Open the video preview','Otwórz podgląd nagrania'],
      ['Replay the highlighted line','Powtórz wyróżnione zdanie'],
    ][step-4])
    if(id==='memory'&&step===5)return copy(...HABIT_DRILLS[selectedHabit].action)
    return steps[step][pl?1:0]
  }
  const previewQuery=id==='booking'&&booking==='cancel'?copy('Please cancel my lesson on Thursday.','Proszę odwołaj moją lekcję w czwartek.'):id==='booking'&&booking==='book'?copy('Can I book a lesson on Friday?','Czy mogę zarezerwować lekcję w piątek?'):query
  const feature=()=>{
    if(id==='memory')return <>
      {step===2&&<><p className="bj-demo-greeting">{copy('Hi again','Cześć ponownie')} 👋</p><p>{typed('I remember your lessons. Here is what keeps coming back.','Pamiętam Twoje lekcje. Oto, co wciąż wraca.')}</p><div className="bj-demo-card">{cardTitle('YOUR RECURRING HABITS','TWOJE POWTARZAJĄCE SIĘ NAWYKI')}<div className="bj-demo-habits">{habitNames.map((name,i)=><button key={name} className="bj-walk-habit" onClick={()=>{setSelectedHabit(i);setAnswer('');go(3)}}><span className="bj-demo-habit-label"><span>{name}</span><small>{[12,8,5][i]}×</small></span><span className="bj-demo-track"><span style={{width:`${[94,70,46][i]}%`}}/></span></button>)}</div></div></>}
      {step>=3&&<><div className="bj-walk-selection"><Icon name="touch_app"/>{habitNames[selectedHabit]}</div><p>{typed('Let’s look at one of your sentences.','Spójrzmy na jedno z Twoich zdań.')}</p><div className="bj-demo-correction"><span><Icon name="close"/><s>{habitExamples[selectedHabit][0]}</s></span>{step>=4&&<span><Icon name="check"/><strong>{habitExamples[selectedHabit][1]}</strong></span>}</div>{step>=4&&<p>{copy('Keep these words together:','Zapamiętaj te słowa razem:')} <code>{habitExamples[selectedHabit][2]}</code>.</p>}{step>=5&&<><div className="bj-demo-card"><div className="bj-demo-card-title">{copy(...HABIT_DRILLS[selectedHabit].action)}</div><p>{HABIT_DRILLS[selectedHabit].question}</p><div className="bj-demo-answers">{HABIT_DRILLS[selectedHabit].options.map(option=><button key={option} onClick={()=>{setAnswer(option);go(6)}} className={(answer||(step===6?HABIT_DRILLS[selectedHabit].correct:''))===option?(option===HABIT_DRILLS[selectedHabit].correct?'correct':'retry'):''}>{option}</button>)}</div>{step===6&&<p role="status">{answer&&answer!==HABIT_DRILLS[selectedHabit].correct?copy(`Try “${HABIT_DRILLS[selectedHabit].correct}”. `,`Spróbuj „${HABIT_DRILLS[selectedHabit].correct}”. `):copy('Exactly! ','Tak! ')}{copy(...HABIT_DRILLS[selectedHabit].rule)}</p>}</div></>}</>}
    </>
    if(id==='voice')return <><p>{typed('Let’s practise a word from your night-train lesson.','Przećwiczmy słowo z lekcji o nocnych pociągach.')}</p>{step<=4&&<div className="bj-demo-card">{cardTitle('SAY IT · HOLD THE MIC','POWIEDZ TO · PRZYTRZYMAJ MIKROFON')}<div className="bj-demo-word-row"><div><strong className="bj-demo-word">berth</strong><div className="bj-demo-ipa">/bɜːθ/</div><span className="bj-demo-muted">koja / miejsce do spania</span></div><button className={`bj-demo-mic${step===3?' recording':''}`} onClick={()=>go(step===3?4:3)} aria-label={copy('Preview a voice attempt','Pokaż próbę głosową')}><Icon name="mic"/>{step===3&&<span className="bj-walk-mic-ring"/>}</button></div>{step===3&&<div className="bj-walk-wave" aria-label={copy('Example voice recording','Przykładowe nagranie')}>{Array.from({length:24},(_,i)=><i key={i} style={{'--wave':`${8+(i*17)%28}px`,'--delay':`${i*-.08}s`}}/>)}</div>}{step===4&&<div className="bj-demo-feedback"><strong className="bj-demo-score">82<span>/100</span></strong><p>{copy('A good start! For /θ/, put your tongue lightly between your teeth and let the air through.','Dobry początek! Przy /θ/ lekko wysuń język między zęby i wypuść powietrze.')}</p></div>}<Action icon="volume_up" onClick={()=>go(5)}>{copy('Hear a native speaker say “berth”','Posłuchaj słowa „berth” u native speakera')}</Action></div>}{step>=5&&<Clip word="berth" pl={pl} playback={clipPlayback} onPlay={playClip} opened={step>=6} onOpen={()=>go(6)}/>}</>
    if(id==='grammar')return <><p>{typed('In English we say “depend on”. The Polish “zależeć od” can tempt you to use “of”.','Po angielsku mówimy „depend on”. Polski zwrot „zależeć od” może podpowiadać „of”.')}</p>{step>=3&&<div className="bj-demo-correction"><span><Icon name="close"/><s>It depends of the weather.</s></span><span><Icon name="check"/><strong>It depends on the weather.</strong></span></div>}{step>=4&&<div className="bj-demo-card">{cardTitle('YOUR TURN','TERAZ TY')}<p>We can go by train. It depends ___ the price.</p><div className="bj-demo-answers">{['of','on','from'].map(option=><button key={option} onClick={()=>{setAnswer(option);go(6)}} className={(answer||(step>=5?'on':''))===option?(option==='on'?'correct':'retry'):''}>{option}</button>)}</div>{step>=6&&<div className="bj-walk-feedback good" role="status"><Icon name="lightbulb"/><p>{answer&&answer!=='on'?copy('Use “on”: depend on the price. Try saying the whole phrase.','Użyj „on”: depend on the price. Powiedz cały zwrot.'):copy('Exactly! depend on. Remember the two words together.','Tak! depend on. Zapamiętaj te dwa słowa razem.')}</p></div>}</div>}</>
    if(id==='booking')return <><div className="bj-walk-booking-tabs" role="group" aria-label={copy('Lesson action','Działanie dotyczące lekcji')}>{[['book','Book','Rezerwuj'],['move','Move','Przenieś'],['cancel','Cancel','Odwołaj']].map(([key,en,polish])=><button key={key} aria-pressed={booking===key} onClick={()=>{setBooking(key);go(2)}}>{copy(en,polish)}</button>)}</div>{booking==='cancel'?<><p>{typed('Here is the lesson you want to cancel. Please check it before confirming.','Oto lekcja do odwołania. Sprawdź szczegóły przed potwierdzeniem.')}</p><div className="bj-demo-booking"><Icon name="event"/><div><strong>{copy('Thursday · 18:00–19:00','Czwartek · 18:00–19:00')}</strong><span>{copy('1:1 lesson · Your teacher','Lekcja 1:1 · Twój lektor')}</span></div></div>{step<6?<Action icon="event_busy" onClick={()=>go(6)}>{copy('Confirm cancellation in preview','Potwierdź odwołanie w podglądzie')}</Action>:<div className="bj-walk-feedback good" role="status"><Icon name="check_circle"/><p>{copy('Example: lesson cancelled. Your booking list has been updated.','Przykład: lekcja odwołana. Lista rezerwacji została zaktualizowana.')}</p></div>}</>:<><p>{typed('Here are the available times on Friday. Which suits you?','Oto wolne terminy na piątek. Który Ci odpowiada?')}</p>{step<=3&&<div className="bj-walk-slots">{['16:00','18:00','19:15'].map(time=><button key={time} onClick={()=>{setSlot(time);go(4)}} className={step===3&&slot===time?'selected':''}><Icon name="schedule"/>{time}{step===3&&slot===time&&<Icon name="touch_app"/>}</button>)}</div>}{step>=4&&<div className="bj-demo-booking"><Icon name="event_available"/><div><strong>{copy('Friday','Piątek')} · {slot}</strong><span>{copy('60 minutes · Your teacher','60 minut · Twój lektor')}</span><small>Europe/Warsaw</small></div></div>}{step>=4&&step<6&&<Action icon="check" selected={step===5} onClick={()=>go(6)}>{copy('Confirm in preview','Potwierdź w podglądzie')}</Action>}{step===6&&<div className="bj-walk-feedback good" role="status"><Icon name="check_circle"/><p><strong>{copy(booking==='book'?'Your lesson is booked.':'Your lesson has moved.',booking==='book'?'Lekcja zarezerwowana.':'Lekcja przeniesiona.')}</strong><br/>{copy('The invitation and lesson link are in your calendar.','Zaproszenie i link do lekcji są w Twoim kalendarzu.')}</p></div>}</>}</>
    if(id==='notes')return <>{step===2&&<><p>{typed('Here are the notes from your last lesson, with your corrections and new words.','Oto notatki z ostatniej lekcji, Twoje poprawki i nowe słowa.')}</p><button className="bj-demo-document bj-walk-document-button" onClick={()=>go(3)}><Icon name="picture_as_pdf"/><span><strong>Night trains & slow travel</strong><span>{copy('Lesson notes · PDF','Notatki z lekcji · PDF')}</span></span><Icon name="open_in_new"/></button></>}{step===3&&<div className="bj-walk-pdf"><div><span>ENGLISH METRO</span><Icon name="description"/></div><h3>Night trains<br/>& slow travel</h3><small>{copy('LESSON NOTES · EXAMPLE','NOTATKI Z LEKCJI · PRZYKŁAD')}</small><h4>{copy('The conversation','Rozmowa')}</h4><p>{copy('We explored overnight journeys, travelling slowly, and why the journey can be as memorable as the destination.','Rozmawialiśmy o nocnych podróżach i o tym, dlaczego sama droga może być równie ciekawa jak cel.')}</p><h4>{copy('One useful correction','Przydatna poprawka')}</h4><p><s>It depends of the price.</s><br/><strong>It depends on the price.</strong></p><Action onClick={()=>go(4)} icon="style">{copy('Open the lesson vocabulary','Otwórz słownictwo z lekcji')}</Action></div>}{step===4&&<div className="bj-demo-choice-list"><strong>{copy('Your lesson words','Słowa z Twojej lekcji')}</strong>{Object.keys(WORDS).map(value=><button key={value} onClick={()=>{setWord(value);go(5)}}><span><b>{value}</b><small>{WORDS[value].meaning}</small></span><Icon name="chevron_right"/></button>)}</div>}{step>=5&&<div className={`bj-walk-flash${step===6?' flipped':''}`}><small>{copy('FROM YOUR LAST LESSON','Z TWOJEJ OSTATNIEJ LEKCJI')}</small><strong>{step===6?WORDS[word].meaning:word}</strong><p>{step===6?WORDS[word].example:copy('Can you recall the meaning?','Pamiętasz znaczenie?')}</p><Action onClick={()=>go(step===6?5:6)} icon="flip">{copy('Flip card','Odwróć fiszkę')}</Action></div>}</>
    if(id==='practice')return <>{step===2&&<><p>{typed('Choose how you’d like to practise. These exercises use your lesson material.','Wybierz, jak chcesz ćwiczyć. Pytania korzystają z materiału z Twoich lekcji.')}</p><div className="bj-demo-choice-list"><strong>{copy('Choose','Wybierz')}</strong>{MODES.map(([value,icon,en,polish,sub,subpl])=><button key={value} onClick={()=>chooseMode(value)}><Icon name={icon}/><span><b>{copy(en,polish)}</b><small>{copy(sub,subpl)}</small></span><span className="bj-demo-radio"/></button>)}</div></>}{step===3&&<><div className="bj-walk-selection"><Icon name="touch_app"/>{MODES.find(m=>m[0]===mode)[pl?3:2]}</div><div className="bj-walk-loading"><span/><span/><span/><small>{copy('Building your first question…','Przygotowuję pierwsze pytanie…')}</small></div>{!auto&&<Action onClick={()=>go(4)}>{copy('Show exercise','Pokaż ćwiczenie')}</Action>}</>}{step>=4&&<><button className="bj-walk-back" onClick={()=>go(2)}><Icon name="arrow_back"/>{copy('Choose another exercise','Wybierz inne ćwiczenie')}</button>{exercise()}</>}</>
    return <>{step===2&&<><p>{typed('Pick a word from your lesson. I’ll show you what you can do with it.','Wybierz słowo z lekcji. Pokażę Ci, jak możesz je przećwiczyć.')}</p><div className="bj-demo-choice-list"><strong>{copy('Choose word','Wybierz słowo')}</strong>{Object.keys(WORDS).map(value=><button key={value} onClick={()=>chooseWord(value)}><span><b>{value}</b><small>{WORDS[value].meaning}</small></span><span className="bj-demo-radio"/></button>)}</div></>}{step===3&&<><div className="bj-walk-selection"><Icon name="touch_app"/>{word}</div><p>{copy('What would you like to do?','Co chcesz zrobić?')}</p><Action icon="volume_up" onClick={()=>{setMode('hear');go(4)}}>{copy('Hear a word','Posłuchaj słowa')}</Action><Action icon="style" onClick={()=>{setMode('flashcards');go(4)}}>{copy('Practise this word','Przećwicz to słowo')}</Action><Action icon="chat" onClick={()=>{setMode('usage');go(4)}}>{copy('Ask about this word','Zapytaj o to słowo')}</Action><Action icon="list" onClick={()=>go(2)}>{copy('Another word','Inne słowo')}</Action></>}{step>=4&&<><button className="bj-walk-back" onClick={()=>go(3)}><Icon name="arrow_back"/>{copy('Word options','Opcje słowa')}</button>{mode==='flashcards'?<div className="bj-walk-flash"><strong>{step>=6?WORDS[word].meaning:word}</strong><p>{step>=6?WORDS[word].example:WORDS[word].ipa}</p><Action icon="flip" onClick={()=>go(step>=6?4:6)}>{copy('Flip card','Odwróć fiszkę')}</Action></div>:mode==='usage'?<><strong className="bj-demo-word">{word}</strong><p>{WORDS[word].meaning}</p><blockquote>{WORDS[word].example}</blockquote><Action icon="volume_up" onClick={()=>{setMode('hear');go(4)}}>{copy('Hear it in context','Posłuchaj w kontekście')}</Action></>:<><strong className="bj-demo-word">{word}</strong><p>{WORDS[word].meaning}</p><Clip key={word} word={word} pl={pl} playback={clipPlayback} onPlay={playClip} opened={step>=5} onOpen={()=>go(5)}/></>}</>}</>
  }
  const activeCaption=caption()
  useEffect(()=>{onStepChange?.({id,step,caption:activeCaption})},[id,step,activeCaption,onStepChange])
  return <div ref={host} className="bj-walkthrough" data-running={running} data-step={step} data-example={id}>
    <div className={`bj-demo ${wa?'bj-demo--wa':'bj-demo--web'}`}>
      <div className="bj-demo-header"><span className="bj-walk-avatar"><img src="/brand/em-bajla-icon.webp" alt="" width="42" height="42"/>{running&&step===1&&<i/>}</span><div><strong>{wa?'Englishmetro Bajla':'Bajla'}</strong><span>{step===1?copy('typing…','pisze…'):wa?'online':copy('remembers your lessons · B2','pamięta Twoje lekcje · B2')}</span></div><Icon name={wa?'search':'close'}/>{wa&&<Icon name="more_vert"/>}</div>
      <div ref={body} role="group" aria-label={`${caption()} (${step+1}/${steps.length})`} className="bj-demo-conversation bj-walk-body" key={`body-${replay}`}>
        {wa&&<span className="bj-demo-today">{copy('Today','Dzisiaj')}</span>}
        {step===0?<div className="bj-walk-intro"><img src="/brand/em-bajla-icon.webp" alt=""/><span>{copy('One conversation. Your next step.','Jedna rozmowa. Twój kolejny krok.')}</span></div>:<Message you wa={wa} pl={pl}>{previewQuery}</Message>}
        {step===1&&<Typing pl={pl}/>}
        {step>=2&&<div key={`feature-${step}`} className="bj-walk-feature"><Message wa={wa} pl={pl}>{feature()}</Message></div>}
      </div>
      <div className={`bj-demo-composer${step===0?' bj-walk-composing':''}`} aria-hidden="true">{wa&&<Icon name="add"/>}<span>{step===0?<Stream key={replay} text={previewQuery} running={running} reduced={reduced}/>:copy(wa?'Type a message':'Ask Bajla anything…',wa?'Wpisz wiadomość':'Zapytaj Bajlę o cokolwiek…')}</span><Icon name={step===0?'send':'mic'}/>{!wa&&step!==0&&<Icon name="send"/>}</div>
    </div>
    <div className="bj-walk-transport"><div><span>{copy('STEP','KROK')} {step+1}/{steps.length}</span><strong key={`${id}-${step}`}>{caption()}</strong></div><div className="bj-walk-buttons"><button onClick={restart} aria-label={copy('Replay this walkthrough','Powtórz tę prezentację')}><Icon name="replay"/></button><button onClick={()=>{setClipPlayback(null);setAuto(v=>!v)}} aria-label={copy(auto?'Pause walkthrough':'Play walkthrough',auto?'Zatrzymaj prezentację':'Odtwórz prezentację')} aria-pressed={auto}><Icon name={auto?'pause':'play_arrow'}/></button><button onClick={next} aria-label={copy('Next walkthrough step','Następny krok prezentacji')}><Icon name="skip_next"/></button></div></div>
    <div ref={pointer} className="bj-walk-guide" aria-hidden="true"><i/><Icon name="near_me"/></div>
    <div className="bj-walk-timeline" aria-hidden="true">{steps.map((_,i)=><span key={i} className={i<step?'done':i===step?'current':''}/>)}</div>
  </div>
}
