import { useState, useEffect, useRef } from 'react'

/**
 * Full voice catalogue mirrored from the Kokoro /voices endpoint.
 * Prefix map: a=US EN, b=UK EN, e=Spanish, f=French, h=Hindi, i=Italian,
 * j=Japanese, p=Portuguese, z=Mandarin Chinese.
 */
const VOICES = [
  // Native English — US
  { id: 'af_alloy', name: 'Alloy', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_aoede', name: 'Aoede', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_bella', name: 'Bella', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_heart', name: 'Heart', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_jessica', name: 'Jessica', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_kore', name: 'Kore', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_nicole', name: 'Nicole', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_nova', name: 'Nova', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_river', name: 'River', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_sarah', name: 'Sarah', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'af_sky', name: 'Sky', flag: '🇺🇸', lang: 'US English', gender: 'Female', native: true },
  { id: 'am_adam', name: 'Adam', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_echo', name: 'Echo', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_eric', name: 'Eric', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_fenrir', name: 'Fenrir', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_liam', name: 'Liam', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_michael', name: 'Michael', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_onyx', name: 'Onyx', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_puck', name: 'Puck', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  { id: 'am_santa', name: 'Santa', flag: '🇺🇸', lang: 'US English', gender: 'Male', native: true },
  // Native English — UK
  { id: 'bf_alice', name: 'Alice', flag: '🇬🇧', lang: 'UK English', gender: 'Female', native: true },
  { id: 'bf_emma', name: 'Emma', flag: '🇬🇧', lang: 'UK English', gender: 'Female', native: true },
  { id: 'bf_isabella', name: 'Isabella', flag: '🇬🇧', lang: 'UK English', gender: 'Female', native: true },
  { id: 'bf_lily', name: 'Lily', flag: '🇬🇧', lang: 'UK English', gender: 'Female', native: true },
  { id: 'bm_daniel', name: 'Daniel', flag: '🇬🇧', lang: 'UK English', gender: 'Male', native: true },
  { id: 'bm_fable', name: 'Fable', flag: '🇬🇧', lang: 'UK English', gender: 'Male', native: true },
  { id: 'bm_george', name: 'George', flag: '🇬🇧', lang: 'UK English', gender: 'Male', native: true },
  { id: 'bm_lewis', name: 'Lewis', flag: '🇬🇧', lang: 'UK English', gender: 'Male', native: true },
  // Non-native accents
  { id: 'ef_dora', name: 'Dora', flag: '🇪🇸', lang: 'Spanish accent', gender: 'Female', native: false },
  { id: 'em_alex', name: 'Alex', flag: '🇪🇸', lang: 'Spanish accent', gender: 'Male', native: false },
  { id: 'em_santa', name: 'Santa', flag: '🇪🇸', lang: 'Spanish accent', gender: 'Male', native: false },
  { id: 'ff_siwis', name: 'Siwis', flag: '🇫🇷', lang: 'French accent', gender: 'Female', native: false },
  { id: 'hf_alpha', name: 'Alpha', flag: '🇮🇳', lang: 'Hindi (Indian) accent', gender: 'Female', native: false },
  { id: 'hf_beta', name: 'Beta', flag: '🇮🇳', lang: 'Hindi (Indian) accent', gender: 'Female', native: false },
  { id: 'hm_omega', name: 'Omega', flag: '🇮🇳', lang: 'Hindi (Indian) accent', gender: 'Male', native: false },
  { id: 'hm_psi', name: 'Psi', flag: '🇮🇳', lang: 'Hindi (Indian) accent', gender: 'Male', native: false },
  { id: 'if_sara', name: 'Sara', flag: '🇮🇹', lang: 'Italian accent', gender: 'Female', native: false },
  { id: 'im_nicola', name: 'Nicola', flag: '🇮🇹', lang: 'Italian accent', gender: 'Male', native: false },
  { id: 'jf_alpha', name: 'Alpha', flag: '🇯🇵', lang: 'Japanese accent', gender: 'Female', native: false },
  { id: 'jf_gongitsune', name: 'Gongitsune', flag: '🇯🇵', lang: 'Japanese accent', gender: 'Female', native: false },
  { id: 'jf_nezumi', name: 'Nezumi', flag: '🇯🇵', lang: 'Japanese accent', gender: 'Female', native: false },
  { id: 'jf_tebukuro', name: 'Tebukuro', flag: '🇯🇵', lang: 'Japanese accent', gender: 'Female', native: false },
  { id: 'jm_kumo', name: 'Kumo', flag: '🇯🇵', lang: 'Japanese accent', gender: 'Male', native: false },
  { id: 'pf_dora', name: 'Dora', flag: '🇵🇹', lang: 'Portuguese accent', gender: 'Female', native: false },
  { id: 'pm_alex', name: 'Alex', flag: '🇵🇹', lang: 'Portuguese accent', gender: 'Male', native: false },
  { id: 'pm_santa', name: 'Santa', flag: '🇵🇹', lang: 'Portuguese accent', gender: 'Male', native: false },
  { id: 'zf_xiaobei', name: 'Xiaobei', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Female', native: false },
  { id: 'zf_xiaoni', name: 'Xiaoni', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Female', native: false },
  { id: 'zf_xiaoxiao', name: 'Xiaoxiao', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Female', native: false },
  { id: 'zf_xiaoyi', name: 'Xiaoyi', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Female', native: false },
  { id: 'zm_yunjian', name: 'Yunjian', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Male', native: false },
  { id: 'zm_yunxi', name: 'Yunxi', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Male', native: false },
  { id: 'zm_yunxia', name: 'Yunxia', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Male', native: false },
  { id: 'zm_yunyang', name: 'Yunyang', flag: '🇨🇳', lang: 'Mandarin accent', gender: 'Male', native: false },
]

function voiceById(id) { return VOICES.find(v => v.id === id) || VOICES[3] }

// Country-code → 3x2 SVG flag from country-flag-icons on jsDelivr.
// Emoji flags don't render reliably on desktop Chrome/Edge on Windows; SVG does.
const CC_BY_VOICE_PREFIX = { a: 'US', b: 'GB', e: 'ES', f: 'FR', h: 'IN', i: 'IT', j: 'JP', p: 'PT', z: 'CN' }
function ccForVoice(id) { return CC_BY_VOICE_PREFIX[(id || '')[0]] || 'US' }
function FlagImg({ voiceId, size = 18 }) {
  const cc = ccForVoice(voiceId)
  return (
    <img
      src={`https://cdn.jsdelivr.net/npm/country-flag-icons@1.5.11/3x2/${cc}.svg`}
      alt={cc}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: Math.round(size * 0.67),
        borderRadius: 2,
        objectFit: 'cover',
        boxShadow: '0 0 0 0.5px rgba(15,23,42,0.15)',
        verticalAlign: -1,
      }}
    />
  )
}

/** Write + broadcast the voice change so every surface stays in sync. */
function broadcastVoiceChange(voiceId) {
  try { localStorage.setItem('tts_voice', voiceId) } catch (_) {}
  window.dispatchEvent(new CustomEvent('em-voice-changed', { detail: { voice: voiceId } }))
}

export default function VoiceSelector() {
  const [voice, setVoice] = useState(() => {
    try { return localStorage.getItem('tts_voice') || 'af_heart' } catch { return 'af_heart' }
  })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    function onStorage(e) {
      if (e.key === 'tts_voice' && e.newValue) setVoice(e.newValue)
    }
    function onVoiceChanged(e) {
      if (e.detail?.voice) setVoice(e.detail.voice)
    }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('storage', onStorage)
    window.addEventListener('em-voice-changed', onVoiceChanged)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('em-voice-changed', onVoiceChanged)
    }
  }, [])

  function pick(v) {
    setVoice(v.id)
    broadcastVoiceChange(v.id)
    setOpen(false)
    setQuery('')
  }

  const current = voiceById(voice)

  const filtered = query.trim()
    ? VOICES.filter(v => {
        const q = query.trim().toLowerCase()
        return v.name.toLowerCase().includes(q)
          || v.lang.toLowerCase().includes(q)
          || v.gender.toLowerCase().includes(q)
          || v.id.toLowerCase().includes(q)
      })
    : VOICES

  const native = filtered.filter(v => v.native)
  const nonNative = filtered.filter(v => !v.native)

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all cursor-pointer ${
          current.native
            ? 'bg-white/95 border-white/70 hover:border-emerald-300'
            : 'bg-amber-50/90 border-amber-200 hover:border-amber-400'
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined text-slate-500 text-[18px]">settings_voice</span>
        <FlagImg voiceId={current.id} size={20} />
        <span className="font-label text-[13px] font-semibold text-slate-800 max-w-[100px] truncate">{current.name}</span>
        {!current.native && (
          <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide leading-none">non-native</span>
        )}
        <span className={`material-symbols-outlined text-slate-400 text-[18px] transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(360px,calc(100vw-32px))] rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)] overflow-hidden z-50 animate-[voicePopIn_.28s_cubic-bezier(.34,1.56,.64,1)]">
          <div className="px-4 pt-3 pb-2 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-rose-50">
            <div className="flex items-center justify-between gap-2">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">🌍 Accent Explorer — 54 voices</p>
              <span className="rounded-full bg-white/80 border border-violet-200 px-2 py-0.5 text-[9px] font-bold text-violet-700">{filtered.length}</span>
            </div>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search voices by name, accent, gender…"
              className="mt-2 w-full rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-[12px] focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {native.length > 0 && (
              <div className="px-2 pt-2">
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700 bg-emerald-50/50 rounded-lg flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                  Native English · use as pronunciation model
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {native.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => pick(v)}
                      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition-all ${
                        v.id === voice
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow'
                          : 'bg-slate-50 hover:bg-emerald-50 text-slate-700'
                      }`}
                    >
                      <FlagImg voiceId={v.id} size={16} />
                      <span className="flex-1 min-w-0 truncate">{v.name}</span>
                      <span className={`text-[8px] ${v.id === voice ? 'text-emerald-50' : 'text-slate-400'}`}>{v.gender[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {nonNative.length > 0 && (
              <div className="px-2 pt-2 pb-2">
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-700 bg-amber-50/50 rounded-lg flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">public</span>
                  World accents · ear-training for multinational work
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {nonNative.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => pick(v)}
                      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition-all ${
                        v.id === voice
                          ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow'
                          : 'bg-amber-50/40 hover:bg-amber-100/60 text-slate-700 border border-amber-100'
                      }`}
                      title={v.lang}
                    >
                      <FlagImg voiceId={v.id} size={16} />
                      <span className="flex-1 min-w-0 truncate">{v.name}</span>
                      <span className={`text-[8px] ${v.id === voice ? 'text-amber-50' : 'text-amber-600'}`}>{v.gender[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-400 text-xs">No voices match "{query}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
