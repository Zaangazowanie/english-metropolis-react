import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../src/contexts/ThemeContext.jsx'
import { I18nProvider } from '../src/i18n'
import { V3ThemeProvider } from '../src/design/v3/ThemeProvider.jsx'
import { YouGlishModal as LessonModal } from '../src/views/v3/Lessons.jsx'
import { YouGlishModal as VocabModal } from '../src/views/v3/Vocabulary.jsx'
import { YouGlishModal as LegacyLessonModal } from '../src/views/Lessons.jsx'
import { YouGlishModal as LegacyVocabModal } from '../src/views/Vocabulary.jsx'
import KeywordVideoPlayer from '../src/components/media/KeywordVideoPlayer.jsx'
import { captionAt } from '../src/components/media/keyword-media.mjs'
import { pronunciationSource, DEMO_SPEECH } from '../src/components/media/pronunciation.mjs'
import '../src/index.css'

function App() {
  const [view, setView] = useState('clock'), [word,setWord] = useState('landmark')
  const [clock,setClock] = useState({time:null,cues:[]}), [audioResult,setAudioResult] = useState('Not played')
  const controls = { position:'relative',zIndex:200,padding:12,background:'#fff',color:'#000',display:'flex',flexWrap:'wrap',gap:12 }
  const chosen = { lesson:LessonModal, vocabulary:VocabModal, 'old lesson':LegacyLessonModal, 'old vocabulary':LegacyVocabModal }[view]
  const Modal = chosen
  const manipulate = action => {
    const video=document.querySelector('[data-keyword-player] video')
    if (!video) return
    if(action==='pause') video.pause()
    if(action==='play') video.play()
    if(action==='seek') video.currentTime=4.7
    if(action==='rewind') video.currentTime=1
    if(action==='fallback') video.src='/missing-qa-media.mp4'
  }
  async function play(text) {
    const started=performance.now()
    const src=await pronunciationSource(text,'af_heart')
    const audio=new Audio(src)
    audio.onplaying=()=>setAudioResult(JSON.stringify({text,src,playbackMilliseconds:Math.round(performance.now()-started)}))
    audio.onerror=()=>setAudioResult('Audio failed')
    await audio.play()
  }
  return <MemoryRouter><div style={{padding:20}}>
    <div style={controls}>
      <label>View <select value={view} onChange={e=>setView(e.target.value)}>{['clock','lesson','vocabulary','old lesson','old vocabulary'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Word <select value={word} onChange={e=>setWord(e.target.value)}>{['landmark','berth','pescatarian','haunting'].map(v=><option key={v}>{v}</option>)}</select></label>
      {['play','pause','seek','rewind','fallback'].map(action=><button key={action} onClick={()=>manipulate(action)}>{action}</button>)}
      <output aria-label="Playback clock">{JSON.stringify({time:clock.time,active:clock.cues[captionAt(clock.cues,clock.time)]?.word,cues:clock.cues.length})}</output>
    </div>
    {Modal ? <Modal key={`${view}-${word}`} word={word} onClose={()=>setView('clock')}/> : <>
      <div style={{width:'min(700px,100%)',aspectRatio:'16/9'}}><KeywordVideoPlayer videoId="qV_CJbh_rD0" occurrence={{start:286,end:291}} word="landmark" onClock={setClock} autoPlay={false}/></div>
      <p>{clock.cues.map((cue,i)=><span key={i} style={{color:i===captionAt(clock.cues,clock.time)?'red':'inherit'}}>{cue.word}{' '}</span>)}</p>
      <h2>Saved Kokoro examples</h2>
      {Object.entries(DEMO_SPEECH).map(([name,text])=><button key={name} onClick={()=>play(text)}>{name}</button>)}
      <output aria-label="Audio result">{audioResult}</output>
    </>}
  </div></MemoryRouter>
}
createRoot(document.getElementById('root')).render(<ThemeProvider><I18nProvider><V3ThemeProvider><App/></V3ThemeProvider></I18nProvider></ThemeProvider>)
