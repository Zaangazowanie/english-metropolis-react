import { useEffect, useRef, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';

const QUICK = [
  { id: 'af_heart', label: 'American Female', flag: '🇺🇸' },
  { id: 'am_adam', label: 'American Male', flag: '🇺🇸' },
  { id: 'bf_emma', label: 'British Female', flag: '🇬🇧' },
  { id: 'bm_fable', label: 'British Male', flag: '🇬🇧' },
];

function StickyHeader() {
  const { slug } = useParams<{ slug: string }>();
  const headerRef = useRef<HTMLElement>(null);
  const [voice, setVoice] = useState(() => localStorage.getItem('tts_voice') || 'af_heart');
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const ddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = headerRef.current;
    if (!h) return;
    let c = false;
    const s = () => { const n = window.scrollY > 80; if (n !== c) { c = n; requestAnimationFrame(() => h.classList.toggle('compact', c)); } };
    window.addEventListener('scroll', s, { passive: true }); s();
    return () => window.removeEventListener('scroll', s);
  }, []);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => { if (ddRef.current && !ddRef.current.contains(e.target as Node)) setOpen(false); };
    const t = setTimeout(() => document.addEventListener('mousedown', fn), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fn); };
  }, [open]);

  function pick(id: string) { setVoice(id); localStorage.setItem('tts_voice', id); setOpen(false); }

  const cur = QUICK.find(v => v.id === voice) || QUICK[0];
  const tabClass = ({ isActive }: { isActive: boolean }) => isActive ? 'tab-chip is-active' : 'tab-chip';

  const dd = open && (
    <div ref={ddRef}
      className="absolute right-0 top-full mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-2xl border border-white/70 shadow-[0_16px_48px_rgba(0,82,208,0.12)] overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-slate-100">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Choose Voice</p>
      </div>
      {QUICK.map(v => (
        <button key={v.id} type="button"
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${voice === v.id ? 'bg-[#0052d0]/10 text-[#0052d0]' : 'text-slate-700 hover:bg-slate-50'}`}
          onClick={() => pick(v.id)}>
          <span className="text-lg">{v.flag}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{v.label}</p>
            <p className="text-[11px] text-slate-400 font-mono">{v.id}</p>
          </div>
          {voice === v.id && <span className="material-symbols-outlined text-[#0052d0] text-lg">check</span>}
        </button>
      ))}
    </div>
  );

  return (
    <header ref={headerRef} className="glass-panel sticky top-0 z-40 rounded-none sm:rounded-[2rem] sm:top-3 border border-white/60 border-t-0 sm:border-t editorial-shadow px-3 py-2.5 sm:px-5 sm:py-3" id="appStickyHeader">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-label text-[13px] font-bold uppercase tracking-[0.26em] text-sky-700 header-brand">English Metropolis</p>
          </div>
          <div className="relative shrink-0" id="voiceSelector">
            <button ref={btnRef} id="voiceSelectorBtn"
              className="flex items-center gap-2 px-4 py-2 bg-white/95 backdrop-blur-xl rounded-2xl border border-white/70 shadow-[0_12px_32px_rgba(15,23,42,0.08)] hover:border-blue-300 transition-all cursor-pointer"
              type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(p => !p)}>
              <span className="material-symbols-outlined text-slate-500 text-lg">settings_voice</span>
              <span id="currentVoiceLabel" className="font-label text-sm text-slate-700">{cur.flag} {cur.id}</span>
              <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            {dd}
          </div>
        </div>
        <nav aria-label="Primary" className="-mx-1 overflow-x-auto">
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-4" id="topTabNav">
            <NavLink to={`/app/${slug}`} end className={tabClass}>Dashboard</NavLink>
            <NavLink to={`/app/${slug}/vocabulary`} className={tabClass}>Vocabulary</NavLink>
            <NavLink to={`/app/${slug}/lessons`} className={tabClass}>Lessons</NavLink>
            <NavLink to={`/app/${slug}/quiz`} className={tabClass}>Quiz</NavLink>
          </div>
        </nav>
      </div>
    </header>
  );
}

export default StickyHeader;
