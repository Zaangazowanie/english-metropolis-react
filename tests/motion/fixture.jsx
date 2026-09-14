// Development-only fixture. Not a Vite production entry. Exercises actual
// production components with anonymous content and no account/network writes.
import { useEffect, useRef, useState } from 'react'
import { Collapse, IconSwap, MotionDropdown, PageTransition, Presence, Sheet, TabInk, useReducedMotion } from '../../src/design/v3/motion/index.js'
import NextCourseLesson from '../../src/views/v3/NextCourseLesson.jsx'
import VoiceSelector from '../../src/components/VoiceSelector.jsx'
import { ConfirmModal, SaDrawer } from '../../src/views/admin/superadmin/CommsShared.jsx'
import { Modal as AnalyticsModal } from '../../src/components/analytics/AnalyticsPrimitives.jsx'
import '../../src/views/admin/superadmin/console.css'
import '../../src/index.css'

function TestDialog({ onClose, side }) {
  const [text, setText] = useState('')
  const [nested, setNested] = useState(false)
  return <Sheet onClose={onClose} side={side} label="Motion test dialog" panelStyle={{ maxWidth: 560, padding: 24, background: 'white', color: '#221a2e', borderRadius: 16 }}>
    <h2>Motion test dialog</h2>
    <label>Focus stability <input aria-label="Focus stability" value={text} onChange={e => setText(e.target.value)}/></label>
    <button onClick={() => setNested(true)}>Open nested dialog</button>
    <button onClick={onClose}>Close test dialog</button>
    <Presence>{nested && <Sheet zIndex={100} label="Nested dialog" onClose={() => setNested(false)} panelStyle={{ maxWidth: 400, background: 'white', padding: 24, border: '2px solid purple' }}>
      <h2>Nested dialog</h2><button onClick={() => setNested(false)}>Close nested dialog</button>
    </Sheet>}</Presence>
  </Sheet>
}

export default function Fixture() {
  const [modal, setModal] = useState(false), [side, setSide] = useState('center')
  const [dropdown, setDropdown] = useState(false), [expanded, setExpanded] = useState(false)
  const [nestedExpanded, setNestedExpanded] = useState(false), [tab, setTab] = useState('a')
  const [preference, setPreference] = useState('full'), [closeDuration, setCloseDuration] = useState('150ms')
  const [admin, setAdmin] = useState(''), [events, setEvents] = useState([]), [race, setRace] = useState('idle')
  const nav = useRef(null), timers = useRef([])
  const reduced = useReducedMotion()
  useEffect(() => {
    document.documentElement.dataset.motion = preference
    return () => document.documentElement.removeAttribute('data-motion')
  }, [preference])
  useEffect(() => {
    document.documentElement.style.setProperty('--modal-close-dur', closeDuration)
    return () => document.documentElement.style.removeProperty('--modal-close-dur')
  }, [closeDuration])
  useEffect(() => {
    const record = e => {
      if (e.propertyName === 'transform' || e.propertyName === 'grid-template-rows') {
        setEvents(v => [...v.slice(-9), `${e.target.className}: ${e.propertyName} ${Math.round(e.elapsedTime * 1000)}ms`])
      }
    }
    document.addEventListener('transitionend', record)
    return () => { document.removeEventListener('transitionend', record); timers.current.forEach(clearTimeout) }
  }, [])
  function runRace() {
    timers.current.forEach(clearTimeout)
    setRace('running'); setDropdown(true)
    timers.current = [setTimeout(() => setDropdown(false), 50), setTimeout(() => setDropdown(true), 95), setTimeout(() => setRace('finished'), 650)]
  }
  return <main style={{ maxWidth: 900, padding: 24, margin: 'auto', fontFamily: 'system-ui' }}>
    <style>{`button,select,input{padding:10px;margin:5px;border:1px solid #aaa;border-radius:8px}h1{font-size:26px}h2{font-size:20px}section{margin:20px 0}pre{white-space:pre-wrap;font-size:12px}.fixture-panel{padding:18px;border:1px solid #ccc;background:#faf8ff}`}</style>
    <h1>EnglishMetro motion QA</h1>
    <label>Motion preference <select aria-label="Motion preference" value={preference} onChange={e => setPreference(e.target.value)}><option value="full">Full</option><option value="reduced">Reduced</option><option value="none">None</option></select></label>
    <output>Reduced motion active: {String(reduced)}</output>
    <label>Close duration <select aria-label="Close duration" value={closeDuration} onChange={e => setCloseDuration(e.target.value)}><option>150ms</option><option>0.6s</option></select></label>
    <section>
      <button onClick={() => { setSide('center'); setModal(true) }}>Open modal</button>
      <button onClick={() => { setSide('bottom'); setModal(true) }}>Open bottom sheet</button>
      <Presence kind={side === 'bottom' ? 'drawer' : 'modal'}>{modal && <TestDialog side={side} onClose={() => setModal(false)}/>}</Presence>
    </section>
    <section style={{ position: 'relative', minHeight: 100 }}>
      <button aria-expanded={dropdown} onClick={() => setDropdown(v => !v)}>Toggle dropdown <IconSwap active={dropdown} from="expand_more" to="close"/></button>
      <button onClick={runRace}>Rapid close and reopen</button><output>Race: {race}</output>
      <MotionDropdown open={dropdown} role="menu" style={{ background: 'white', border: '1px solid purple', padding: 14, position: 'absolute', top: 50, right: 0, zIndex: 10 }}>
        <button role="menuitem" onClick={() => setDropdown(false)}>Dismiss dropdown</button>
      </MotionDropdown>
    </section>
    <section>
      <button aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>Toggle disclosure</button>
      <Collapse open={expanded}><div className="fixture-panel"><p>Outer disclosure content.</p>
        <button onClick={() => setNestedExpanded(v => !v)}>Toggle nested disclosure</button>
        <Collapse open={nestedExpanded}><div className="fixture-panel"><button>Nested focus target</button></div></Collapse>
      </div></Collapse>
    </section>
    <section><nav ref={nav} style={{ position: 'relative', display: 'inline-flex' }}>
      <TabInk navRef={nav} activeKey={tab} background="#ddd0ff"/>
      {['a', 'b', 'c'].map(key => <button key={key} data-tab={key} style={{ position: 'relative' }} onClick={() => setTab(key)}>Tab {key}</button>)}
    </nav><PageTransition routeKey={tab}><div className="fixture-panel">Page {tab}</div></PageTransition></section>
    <section><VoiceSelector/></section>
    <NextCourseLesson data={{ coursePreview: { id:'demo', title:'A city worth exploring', level:'B2', lessonNumber:4, hasPdf:true, keywords:[{word:'landmark',ipa:'/ˈlændmɑːk/',pl:'punkt orientacyjny',example:'The station is a local landmark.'},{word:'berth',pl:'koja'}] } }}/>
    <section className="sa-root"><button onClick={() => setAdmin('drawer')}>Open console drawer</button><button onClick={() => setAdmin('modal')}>Open console confirmation</button>
      <SaDrawer open={admin === 'drawer'} title="QA console drawer" onClose={() => setAdmin('')}><input aria-label="Console draft" placeholder="Draft text"/></SaDrawer>
      <ConfirmModal open={admin === 'modal'} title="QA confirmation" body="Anonymous test only." confirmLabel="Confirm fixture" onConfirm={() => setAdmin('')} onClose={() => setAdmin('')}/>
    </section>
    <button onClick={() => setAdmin('analytics')}>Open analytics dialog</button>
    <AnalyticsModal open={admin === 'analytics'} title="QA analytics" onClose={() => setAdmin('')}><input aria-label="Analytics draft"/></AnalyticsModal>
    <h2>Completed transitions</h2><pre role="log">{events.join('\n')}</pre>
  </main>
}
