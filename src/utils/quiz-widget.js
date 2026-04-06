/**
 * Quiz Widget v12 — Native Site Buttons + Fixed Tour
 * Site button style: rounded-full border border-blue-200 bg-blue-50/80 text-blue-700 backdrop-blur-sm
 * Primary CTA only uses gradient (from-[#0052d0] to-[#4c49c9])
 * Everything else = outlined translucent, matching Dashboard/Lessons/Vocabulary
 */
(function () {
  'use strict';

  const DATA_BASE = '/quiz-dev/data';
  const SLUG_MAP = {
    'szymon-karpinski': 'szymon-karpinski',
    'mikolaj-karpinski': 'mikolaj-nowak',
    'ilona-karpinska': 'ilona-kowalska'
  };
  const getSlug = () => SLUG_MAP[window.location.pathname.split('/app/')[1]?.split('/')[0] || ''] || '';
  const STUDENT_SLUG = getSlug();

  const TIERS = {
    1: { name: 'Street Level', icon: 'location_city', tag: 'Fresh off the boat' },
    2: { name: 'The Grind', icon: 'bolt', tag: 'Forging precision through persistence' },
    3: { name: 'Side Hustle', icon: 'trending_up', tag: 'Building real momentum' },
    4: { name: 'Making Moves', icon: 'directions_run', tag: 'Starting to talk the talk' },
    5: { name: 'The Pivot', icon: 'rotate_right', tag: 'Strategic mastery kicks in' },
    6: { name: 'Blue Chip', icon: 'diamond', tag: 'High-value vocabulary territory' },
    7: { name: 'The Boardroom', icon: 'corporate_fare', tag: 'Executive-level command' },
    8: { name: 'Power Player', icon: 'star', tag: 'Influencer-tier English' },
    9: { name: 'The Penthouse', icon: 'apartment', tag: 'Near-native sophistication' },
    10: { name: 'Icon Status', icon: 'workspace_premium', tag: 'Legendary, untouchable fluency' }
  };

  const CATS = {
    grammar:    { icon: 'account_tree', grad: 'from-rose-500 to-pink-500', label: 'Grammar', bg: 'bg-rose-50' },
    vocabulary: { icon: 'menu_book', grad: 'from-emerald-500 to-teal-500', label: 'Vocabulary', bg: 'bg-emerald-50' },
    fluency:    { icon: 'record_voice_over', grad: 'from-amber-500 to-orange-500', label: 'Fluency', bg: 'bg-amber-50' },
    pronunciation: { icon: 'mic', grad: 'from-violet-500 to-purple-500', label: 'Pronunciation', bg: 'bg-violet-50' }
  };
  const cat = id => CATS[id] || CATS.grammar;

  // Site button classes (matching Dashboard/Lessons/Vocabulary exactly)
  const BTN = 'inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-4 py-2 text-sm font-semibold text-blue-700 backdrop-blur-sm transition-all hover:bg-blue-100 hover:shadow-sm cursor-pointer';
  const BTN_SM = 'inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/80 px-3.5 py-1.5 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700 cursor-pointer hover:bg-blue-100 transition-all';
  const CTA = 'inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 backdrop-blur-sm px-6 py-3 text-blue-700 font-semibold text-sm cursor-pointer active:scale-[0.97] transition-transform hover:bg-blue-100 hover:shadow-sm';
  const CARD = 'liquid-glass-card rounded-2xl border border-slate-200/70 p-4';
  const CARD_SM = 'liquid-glass-card rounded-2xl border border-slate-200/70 p-3.5';

  let S = {
    idx: null, exs: [], cur: null, qi: 0, ans: {},
    view: 'home', loading: false, err: null, hint: false,
    tier: null, cat: null,
    prog: loadProgress(),
    tourDone: sessionStorage.getItem('ascentTour') === '1',
    tourStep: 0, touring: false
  };

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => [...(c || document).querySelectorAll(s)];
  
  // Error-boundary wrapped fetch with retry logic
  const fj = async (u, options = {}) => {
    const maxRetries = options.retries || 2;
    const timeout = options.timeout || 10000;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const r = await fetch(u, { 
          ...options, 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (!r.ok) {
          const errorData = await r.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${r.status}: ${r.statusText}`);
        }
        return await r.json();
      } catch (err) {
        if (attempt === maxRetries) {
          console.error(`Fetch failed after ${maxRetries + 1} attempts:`, err);
          throw err;
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  };
  
  // Safe localStorage with schema versioning
  const STORAGE_KEY = 'ascentProg_v1';
  const sp = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        data: S.prog,
        updatedAt: Date.now()
      }));
    } catch (e) {
      console.error('Failed to save progress:', e);
      showErrorToast('Failed to save progress. Storage may be full.');
    }
  };
  
  const loadProgress = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      // Schema migration if needed
      if (parsed.version === 1 && parsed.data) {
        return parsed.data;
      }
      // Legacy format migration
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to load progress:', e);
      return {};
    }
  };
  
  const gp = id => S.prog[id] || null;
  const md = (id, sc) => { 
    S.prog[id] = { score: sc, done: true, ts: Date.now() }; 
    sp(); 
  };
  const tp = t => S.exs.filter(e => e.difficultyTier === t && gp(e.id)?.done).length;
  const ico = (n, c = '') => `<span class="material-symbols-outlined ${c}" style="font-size:inherit">${n}</span>`;
  
  // Check for reduced motion preference
  const prefersReducedMotion = () => {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  
  // Apply reduced motion styles if needed
  if (prefersReducedMotion()) {
    const style = document.createElement('style');
    style.textContent = `
      .quiz-container *, .quiz-container *::before, .quiz-container *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Error toast helper
  const showErrorToast = (message) => {
    const existing = document.getElementById('quiz-error-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'quiz-error-toast';
    toast.className = 'fixed top-4 right-4 z-[9999] bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-sm';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="flex items-start gap-2">
        <span class="material-symbols-outlined text-red-500">error</span>
        <div>
          <p class="font-semibold text-sm">Error</p>
          <p class="text-sm">${SecurityUtils?.escapeHtml(message) || message}</p>
        </div>
        <button onclick="this.closest('#quiz-error-toast').remove()" class="ml-auto text-red-400 hover:text-red-600">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  };

  const TOUR = [
    { i: 'location_city', t: 'Welcome to The Ascent', d: 'Climb from Street Level to Icon Status. Every exercise is a floor in your metropolis.' },
    { i: 'monitoring', t: 'Your Proficiency Ring', d: 'Tracks overall mastery. Watch it fill as you conquer each tier.' },
    { i: 'local_fire_department', t: 'The Daily Grind', d: '5 fresh questions daily. Build your streak, unlock bonus content.' },
    { i: 'category', t: 'Curated Focus', d: 'Grammar, Vocabulary, Fluency — master each pillar at your pace.' },
    { i: 'map', t: '10 Floors to the Top', d: 'Pass 70% on each tier to ascend. How high can you climb?' },
    { i: 'workspace_premium', t: "You're Ready", d: 'Continue where you left off, or explore. Your journey begins now.' }
  ];

  const ring = pct => {
    const r = 42, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
    return `<div class="relative w-28 h-28 mx-auto">
      <svg class="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="5"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="url(#qGrad)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .8s cubic-bezier(.34,1.56,.64,1)"/>
        <defs><linearGradient id="qGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0052d0"/><stop offset="100%" stop-color="#4c49c9"/></linearGradient></defs>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span class="font-mono text-2xl font-bold text-slate-800">${pct}%</span>
        <span class="font-label text-[7px] font-bold uppercase tracking-[0.18em] text-slate-400">Proficiency</span>
      </div>
    </div>`;
  };

  // ── Tour ──
  const tourWelcome = () => `
    <div class="fixed inset-0 z-[10000] bg-slate-900/40 backdrop-blur-md flex items-end justify-center p-6" data-a="tour-bg">
      <div class="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl" onclick="event.stopPropagation()">
        <div class="text-center">
          <div class="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto">${ico('location_city','text-blue-600 text-2xl')}</div>
          <h3 class="font-headline text-xl mt-4 text-slate-900">Welcome to The Ascent</h3>
          <p class="font-body text-sm text-slate-500 mt-2 leading-relaxed">Your personalized English mastery journey. 30 seconds.</p>
          <button class="w-full mt-5 rounded-full border border-blue-200 bg-blue-50/80 backdrop-blur-sm px-6 py-3 text-blue-700 font-semibold text-sm cursor-pointer hover:bg-blue-100 transition-all" data-a="start-tour">Begin Tour</button>
          <button class="w-full mt-2 text-xs font-semibold text-slate-400 bg-transparent border-none cursor-pointer py-2" data-a="skip-tour">Skip</button>
        </div>
      </div>
    </div>`;

  const tourStep = () => {
    const s = TOUR[S.tourStep], last = S.tourStep === TOUR.length - 1;
    const pct = ((S.tourStep + 1) / TOUR.length) * 100;
    return `
      <div class="fixed inset-0 z-[10000] bg-slate-900/40 backdrop-blur-md flex items-end justify-center p-6" data-a="tour-bg">
        <div class="bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl" onclick="event.stopPropagation()">
          <div class="h-1 bg-slate-100 rounded-full mb-5 overflow-hidden"><div class="h-full bg-gradient-to-r from-[#0052d0] to-[#4c49c9] rounded-full" style="width:${pct}%"></div></div>
          <div class="text-center text-4xl text-blue-600 mb-3">${ico(s.i,'filled')}</div>
          <h3 class="font-headline text-lg text-center text-slate-900">${s.t}</h3>
          <p class="font-body text-sm text-center text-slate-500 mt-2 leading-relaxed">${s.d}</p>
          <div class="flex gap-1 justify-center mt-4">${TOUR.map((_, i) => `<div class="h-1.5 rounded-full ${i === S.tourStep ? 'bg-blue-600 w-3' : i < S.tourStep ? 'bg-emerald-400 w-1.5' : 'bg-slate-200 w-1.5'}"></div>`).join('')}</div>
          <div class="flex gap-3 mt-5">
            <button class="${BTN_SM} flex-1 justify-center" data-a="skip-tour">Skip</button>
            <button class="rounded-full border border-blue-200 bg-blue-50/80 backdrop-blur-sm px-6 py-3 text-blue-700 font-semibold text-sm cursor-pointer hover:bg-blue-100 transition-all flex-1" data-a="next-tour">${last ? "Let's Go!" : 'Next'}</button>
          </div>
        </div>
      </div>`;
  };

  // ── Home ──
  const home = () => {
    if (!S.idx) return '<p class="text-center text-slate-400 font-body italic py-8">No quiz data found.</p>';
    const totalDone = Object.values(S.prog).filter(p => p.done).length;
    const pct = S.idx.totalExercises > 0 ? Math.round((totalDone / S.idx.totalExercises) * 100) : 0;
    let ct = 1;
    for (let t = 1; t <= 10; t++) { const te = S.exs.filter(e => e.difficultyTier === t); if (te.filter(e => gp(e.id)?.done).length >= te.length * 0.7 && te.length > 0) ct = t + 1; }
    if (ct > 10) ct = 10;
    const ti = TIERS[ct];

    return `
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(260px,0.7fr)] mt-4">
      <div class="flex flex-col items-center text-center">
        ${ring(pct)}
        <span class="cefr-badge text-primary mt-3">${S.idx.cefrLevel}</span>
        <h2 class="font-headline text-3xl text-slate-900 mt-2">${ti.name}</h2>
        <p class="font-body text-sm text-slate-500 italic mt-1 max-w-xs">${ti.tag}.</p>
        <button data-a="continue" class="w-full mt-4 ${CTA}">
          ${ico('arrow_forward','text-base')} Continue The Ascent
        </button>
      </div>
      <div class="space-y-3">
        <button data-a="daily" class="w-full ${CARD} text-left cursor-pointer transition-all hover:shadow-md active:scale-[0.98] border-amber-200/70">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">${ico('local_fire_department','text-amber-600 text-lg')}</div>
            <div class="flex-1">
              <h4 class="font-headline text-base text-slate-900 font-bold">Daily Grind</h4>
              <span class="font-label text-[9px] font-bold uppercase tracking-[0.18em] text-amber-600">5-Day Streak</span>
            </div>
            <span class="material-symbols-outlined text-slate-300">arrow_forward</span>
          </div>
        </button>
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 mb-2 px-1">Categories</p>
          <div class="grid grid-cols-2 gap-2">
            ${S.idx.categories.slice(0, 2).map(c => {
              const m = cat(c.id), done = S.exs.filter(e => e.category === c.id && gp(e.id)?.done).length;
              const fp = c.exerciseCount > 0 ? Math.round((done / c.exerciseCount) * 100) : 0;
              return `<button data-a="category" data-cat="${c.id}" class="${CARD_SM} text-left cursor-pointer transition-all hover:shadow-md active:scale-[0.97]">
                <span class="material-symbols-outlined text-xl text-slate-600">${m.icon}</span>
                <h4 class="font-headline text-sm font-bold mt-2 text-slate-900">${m.label}</h4>
                <div class="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r ${m.grad} rounded-full" style="width:${fp}%"></div></div>
                <div class="flex justify-between mt-1.5"><span class="font-label text-[8px] uppercase tracking-wider text-slate-400">Done</span><span class="font-mono text-[10px] text-slate-600">${done}/${c.exerciseCount}</span></div>
              </button>`;
            }).join('')}
          </div>
          ${S.idx.categories.length > 2 ? (() => {
            const c = S.idx.categories[2], m = cat(c.id), done = S.exs.filter(e => e.category === c.id && gp(e.id)?.done).length;
            return `<button data-a="category" data-cat="${c.id}" class="mt-2 w-full ${CARD_SM} flex items-center justify-between cursor-pointer transition-all hover:shadow-md active:scale-[0.98]">
              <div class="flex items-center gap-3"><div class="w-9 h-9 rounded-full ${m.bg} border border-slate-200 flex items-center justify-center">${ico(m.icon,'text-base text-slate-600')}</div><div><h4 class="font-headline text-sm font-bold text-slate-900">${m.label}</h4><span class="font-label text-[8px] uppercase tracking-wider text-slate-400">${done}/${c.exerciseCount} done</span></div></div>
              <span class="material-symbols-outlined text-slate-300 text-lg">arrow_forward</span>
            </button>`;
          })() : ''}
        </div>
      </div>
    </div>
    <div class="mt-6">
      <div class="flex items-end justify-between mb-3">
        <div><h2 class="font-headline text-lg font-bold italic text-slate-900">The Ascent Path</h2><span class="font-mono text-[9px] text-slate-400 uppercase tracking-[0.2em]">Tier ${ct} of 10</span></div>
        ${ico('map','text-slate-300 text-xl')}
      </div>
      <div class="relative overflow-x-auto no-scrollbar">
        <div class="flex items-center gap-4 px-2 min-w-max">
          <div class="absolute h-0.5 bg-slate-200 left-8 right-8 top-[18px] z-0"></div>
          ${ct > 1 ? `<div class="absolute h-0.5 bg-gradient-to-r from-[#0052d0] to-[#4c49c9] left-8 z-0" style="width:${(ct-1)*52}px;top:18px"></div>` : ''}
          ${Array.from({length:10}, (_, i) => {
            const t = i+1, info = TIERS[t];
            const cls = t < ct ? 'bg-emerald-500 text-white' : t === ct ? 'bg-gradient-to-br from-[#0052d0] to-[#4c49c9] text-white shadow-lg ring-2 ring-blue-200 scale-110' : 'bg-slate-100 text-slate-400';
            return `<div class="flex flex-col items-center gap-1.5 relative z-10">
              <button data-a="tier" data-t="${t}" class="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer transition-transform active:scale-90 ${cls}">
                <span class="material-symbols-outlined ${t<ct?'filled':''}" style="font-size:14px">${t<ct?'check':t===ct?info.icon:'lock'}</span>
              </button>
              <span class="font-label text-[7px] font-bold uppercase tracking-wider whitespace-nowrap ${t===ct?'bg-gradient-to-r from-[#0052d0] to-[#4c49c9] bg-clip-text text-transparent':t<ct?'text-emerald-600':'text-slate-400'}">${info.name}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  };

  const tiers = () => {
    const ts = {}; S.exs.forEach(e => { if (!ts[e.difficultyTier]) ts[e.difficultyTier] = []; ts[e.difficultyTier].push(e); });
    return `
      <button data-a="home" class="${BTN_SM} mb-3">${ico('arrow_back','text-sm')} Back</button>
      ${Object.keys(ts).map(Number).sort((a,b)=>a-b).map(t => {
        const exs = ts[t], done = exs.filter(e => gp(e.id)?.done).length, fp = exs.length ? Math.round(done/exs.length*100) : 0;
        return `<button data-a="tier-pick" data-tier="${t}" class="w-full ${CARD} mb-2 text-left cursor-pointer transition-all hover:shadow-md active:scale-[0.99]">
          <div class="flex items-center justify-between"><div><h4 class="font-headline text-sm font-bold">${TIERS[t].name}</h4><span class="font-mono text-[9px] text-slate-400">${done}/${exs.length} done · Tier ${t}</span></div><span class="material-symbols-outlined text-slate-300">arrow_forward</span></div>
          <div class="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-[#0052d0] to-[#4c49c9] rounded-full" style="width:${fp}%"></div></div>
        </button>`;
      }).join('')}`;
  };

  const exercises = () => {
    const exs = S.exs.filter(e => (!S.tier||e.difficultyTier===S.tier)&&(!S.cat||e.category===S.cat));
    return `
      <button data-a="tiers" class="${BTN_SM} mb-3">${ico('arrow_back','text-sm')} Tiers</button>
      <div class="${CARD} mb-3"><h3 class="font-headline text-lg font-bold">${TIERS[S.tier]?.name||'All'}</h3><span class="font-mono text-[9px] text-slate-400">${exs.length} exercises</span></div>
      ${exs.map((ex, i) => {
        const p = gp(ex.id);
        return `<button data-a="start" data-i="${i}" class="w-full ${CARD_SM} mb-1.5 flex items-center justify-between text-left cursor-pointer transition-all hover:shadow-sm active:scale-[0.99]">
          <div><h4 class="font-headline text-sm font-semibold">${ex.title}</h4><span class="font-mono text-[8px] text-slate-400">${ex.category} · ${ex.questions?.length||'?'} questions${p?.done?' · '+p.score+'%':''}</span></div>
          <span class="material-symbols-outlined ${p?.done?'filled':''} text-lg ${p?.done?'text-emerald-500':'text-slate-300'}">${p?.done?'check_circle':'arrow_forward'}</span>
        </button>`;
      }).join('')}`;
  };

  const quiz = () => {
    const ex = S.cur; if (!ex) return '';
    const qs = ex.questions, q = qs[S.qi], a = S.ans[q.id], last = S.qi === qs.length - 1;
    const pct = Math.round(((S.qi+1)/qs.length)*100);
    return `
      <div class="flex items-center gap-3 mb-4">
        <button data-a="back-ex" class="${BTN_SM} border-slate-200 bg-white/80 text-slate-500 px-2.5 py-1.5">${ico('arrow_back')}</button>
        <div class="flex-1"><span class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Question ${S.qi+1} of ${qs.length}</span>
        <div class="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-[#0052d0] to-[#4c49c9] rounded-full" style="width:${pct}%"></div></div></div>
        <button data-a="hint" class="${BTN_SM} border-slate-200 bg-white/80 text-slate-400 px-2.5 py-1.5 ${S.hint?'!bg-amber-50 !border-amber-200 !text-amber-600':''}">${ico('lightbulb')}</button>
      </div>
      <div class="${CARD} mb-3">
        <span class="font-label text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">${ex.category}</span>
        <h3 class="font-headline text-base font-semibold mt-1.5 leading-relaxed text-slate-900">${q.prompt||q.question}</h3>
        ${S.hint && q.explanation ? `<div class="mt-3 p-3 bg-amber-50/80 rounded-xl border border-amber-200/50"><p class="font-body text-xs text-amber-800 italic">${q.explanation}</p></div>` : ''}
      </div>
      ${q.type === 'multiple-choice' ? `<div class="space-y-2">${(q.options||[]).map((o,i) => {
        const l = ['A','B','C','D'][i];
        return `<button data-a="answer" data-ans="${o.replace(/"/g,'&quot;')}" class="w-full flex items-center gap-3 p-3.5 rounded-xl ${a===o?'bg-blue-50/80 border-blue-200':'bg-white/70 border-slate-200/60'} border backdrop-blur-sm cursor-pointer transition-all active:scale-[0.98] hover:shadow-sm">
          <span class="w-7 h-7 rounded-full ${a===o?'bg-gradient-to-br from-[#0052d0] to-[#4c49c9] text-white':'bg-slate-100 text-slate-400'} flex items-center justify-center font-mono text-xs font-bold">${l}</span>
          <span class="font-body text-sm text-slate-700 flex-1">${o}</span>
        </button>`;
      }).join('')}</div>` : `<div class="flex gap-2"><input type="text" value="${a||''}" data-a="text" placeholder="Your answer..." class="flex-1 p-3 bg-white/70 border border-slate-200/60 rounded-xl font-body text-sm"><button data-a="submit" class="${CTA} px-5">Go</button></div>`}
      <div class="flex gap-2 mt-3">
        <button data-a="prev" ${S.qi===0?'disabled':''} class="${BTN} flex-1 justify-center border-slate-200 bg-white/70 text-slate-400 text-xs disabled:opacity-30">Prev</button>
        ${last ? `<button data-a="finish" class="${CTA} flex-1">Finish</button>` : `<button data-a="next" class="${CTA} flex-1">Next</button>`}
      </div>`;
  };

  const reviewCard = q => {
    const ua = S.ans[q.id]||'', ca = q.correctAnswer||'', ok = ua.toLowerCase().trim()===ca.toLowerCase().trim();
    return `<div class="${CARD_SM} ${ok?'border-emerald-200/50':'border-rose-200/50'} mb-1.5">
      <div class="flex items-start gap-2.5">
        <span class="material-symbols-outlined filled text-sm mt-0.5 ${ok?'text-emerald-500':'text-rose-500'}">${ok?'check':'close'}</span>
        <div class="min-w-0 flex-1">
          <p class="font-body text-sm text-slate-700 leading-relaxed">${q.prompt||q.question}</p>
          ${!ok?`<div class="mt-1.5 space-y-0.5"><p class="font-body text-xs text-rose-600"><strong>Your answer:</strong> ${ua||'(skipped)'}</p><p class="font-body text-xs text-emerald-600"><strong>Correct:</strong> ${ca}</p></div>`:`<p class="font-body text-xs text-emerald-600 mt-1">✓ ${ua}</p>`}
          ${q.explanation?`<div class="mt-2 p-2.5 bg-amber-50/60 border border-amber-200/40 rounded-lg"><p class="font-body text-xs text-amber-800 italic">${q.explanation}</p></div>`:''}
        </div>
      </div>
    </div>`;
  };

  const results = () => {
    const ex = S.cur; if (!ex) return '';
    const qs = ex.questions; let c = 0;
    qs.forEach(q => { const a = S.ans[q.id]; if (a && a.toLowerCase().trim()===(q.correctAnswer||'').toLowerCase().trim()) c++; });
    const sc = Math.round((c/qs.length)*100), pass = sc >= (ex.passingScore||70);
    const gr = sc>=95?'A':sc>=88?'B':sc>=80?'C':sc>=70?'D':sc>=60?'E':'F';
    const gc = sc>=95?'from-emerald-400 to-teal-500':sc>=80?'from-[#0052d0] to-[#4c49c9]':sc>=70?'from-amber-400 to-orange-500':'from-rose-400 to-pink-500';
    const pg = sc>=95?'6 (celujący)':sc>=88?'5 (bardzo dobry)':sc>=78?'4+ (dobry plus)':sc>=70?'4 (dobry)':sc>=60?'3 (dostateczny)':sc>=50?'2 (dopuszczający)':'1 (niedostateczny)';
    md(ex.id, sc);
    return `
      <div class="${CARD} text-center mb-3 ${pass?'border-emerald-200/50':'border-rose-200/50'}">
        <div class="flex items-center justify-center gap-5 mb-4">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br ${gc} flex items-center justify-center shadow-lg"><span class="font-headline text-3xl text-white">${gr}</span></div>
          <div class="relative w-20 h-20">
            <svg class="w-20 h-20 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" stroke-width="5"/><circle cx="50" cy="50" r="42" fill="none" stroke="${pass?'#10b981':'#f43f5e'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${Math.PI*84}" stroke-dashoffset="${Math.PI*84*(1-sc/100)}"/></svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="font-mono text-lg font-bold text-slate-800">${sc}%</span><span class="font-label text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">${c}/${qs.length}</span></div>
          </div>
        </div>
        <h3 class="font-headline text-xl text-slate-900">${pass?'Excellent Work!':'Keep Climbing!'}</h3>
        <p class="font-body text-sm text-slate-500 mt-1">${c} of ${qs.length} correct · ${pass?'Passed':'Below passing'} (${ex.passingScore||70}%)</p>
        <div class="inline-flex items-center gap-1 mt-3 rounded-full px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] ${pass?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-rose-50 text-rose-700 border border-rose-200'}">${pass?'✅ Passed':'📈 Try Again'}</div>
        <div class="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-50/80 px-3 py-1.5"><span class="font-label text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">Polish Grade · </span><span class="font-mono text-xs font-semibold text-slate-700">${pg}</span></div>
      </div>
      <div class="mb-3"><p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400 mb-2 px-1">Question Review</p>${qs.map(q=>reviewCard(q)).join('')}</div>
      <div class="flex gap-2">
        <button data-a="back-ex" class="${BTN} flex-1 justify-center border-slate-200 bg-white/70 text-slate-500 text-xs">Exercises</button>
        <button data-a="retry" class="${CTA} flex-1">Retry</button>
      </div>`;
  };

  // ── Render ──
  const render = () => {
    const el = $('#page-quiz'); if (!el) return;
    if (!el.dataset.bgSet) {
      // Make quiz glass panel semi-transparent so bg shows through
      el.style.background = 'rgba(255,255,255,0.78)';
      el.style.backdropFilter = 'blur(12px)';
      // Sticky header transparency
      const header = el.closest('section')?.previousElementSibling || document.querySelector('#topTabNav');
      const nav = document.getElementById('topTabNav');
      if (nav) { nav.style.background = 'rgba(255,255,255,0.82)'; nav.style.backdropFilter = 'blur(12px)'; }
      // Fixed bg on body
      if (!document.querySelector('.quiz-bg-layer')) {
        const bg = document.createElement('div');
        bg.className = 'quiz-bg-layer';
        bg.style.cssText = 'position:fixed;inset:0;background:url(/students/quiz-bg.png?v=1775348270) center/cover no-repeat;opacity:0.2;z-index:0;pointer-events:none';
        document.body.insertBefore(bg, document.body.firstChild);
      }
      el.dataset.bgSet = '1';
    }
    const grid = el.querySelector('.grid');
    if (grid) grid.style.display = (S.view === 'home') ? '' : 'none';
    let w = el.querySelector('.qwidget');
    if (w) w.remove();
    w = document.createElement('div'); w.className = 'qwidget'; w.style.position = 'relative'; w.style.zIndex = '1';
    if (S.loading && !S.idx) { w.innerHTML = '<div class="flex justify-center py-8"><div class="w-6 h-6 border-2 border-slate-200 border-t-[#0052d0] rounded-full animate-spin"></div></div>'; el.appendChild(w); return; }
    if (S.err && !S.idx) { w.innerHTML = `<p class="text-center py-8 text-slate-400 font-body italic">${S.err}</p>`; el.appendChild(w); return; }
    // Tour — clean up old tours first
    $$('.qwidget-tour', el).forEach(t => t.remove());
    if (!S.tourDone && !S.touring && S.view === 'home') {
      const tourEl = document.createElement('div');
      tourEl.className = 'qwidget-tour';
      tourEl.innerHTML = tourWelcome();
      el.appendChild(tourEl);
      $$('[data-a]', tourEl).forEach(e => e.addEventListener('click', click));
    } else if (S.touring) {
      const tourEl = document.createElement('div');
      tourEl.className = 'qwidget-tour';
      tourEl.innerHTML = tourStep();
      el.appendChild(tourEl);
      $$('[data-a]', tourEl).forEach(e => e.addEventListener('click', click));
    }
    let h = '';
    switch (S.view) { case 'home': h = home(); break; case 'tiers': h = tiers(); break; case 'exercises': h = exercises(); break; case 'quiz': h = quiz(); break; case 'results': h = results(); break; }
    w.innerHTML = h;
    el.appendChild(w);
    $$('[data-a]', w).forEach(e => e.addEventListener('click', click));
    $$('[data-a="text"]', w).forEach(e => e.addEventListener('input', ev => { if (ev.target.value.trim()) S.ans[S.cur.questions[S.qi].id] = ev.target.value.trim(); }));
  };

  const click = ev => {
    const a = ev.currentTarget.dataset.a;
    switch (a) {
      case 'continue': case 'daily': loadEx(1, null); break;
      case 'category': S.cat = ev.currentTarget.dataset.cat; S.tier = null; S.view = 'tiers'; loadAll(); break;
      case 'tier': S.tier = parseInt(ev.currentTarget.dataset.t); S.cat = null; S.view = 'tiers'; loadAll(); break;
      case 'tier-pick': S.tier = parseInt(ev.currentTarget.dataset.tier); S.view = 'exercises'; render(); break;
      case 'home': S.view = 'home'; render(); break;
      case 'tiers': S.view = 'tiers'; render(); break;
      case 'start': { const f = S.exs.filter(e => (!S.tier||e.difficultyTier===S.tier)&&(!S.cat||e.category===S.cat)); const ex = f[parseInt(ev.currentTarget.dataset.i)]; if (ex) { S.cur = ex; S.qi = 0; S.ans = {}; S.hint = false; S.view = 'quiz'; render(); } break; }
      case 'answer': S.ans[S.cur.questions[S.qi].id] = ev.currentTarget.dataset.ans; render(); break;
      case 'next': if (S.qi < S.cur.questions.length-1) { S.qi++; S.hint = false; render(); } break;
      case 'prev': if (S.qi > 0) { S.qi--; S.hint = false; render(); } break;
      case 'hint': S.hint = !S.hint; render(); break;
      case 'finish': S.view = 'results'; render(); break;
      case 'retry': S.qi = 0; S.ans = {}; S.hint = false; S.view = 'quiz'; render(); break;
      case 'back-ex': S.cur = null; S.view = 'exercises'; render(); break;
      case 'start-tour': S.touring = true; S.tourStep = 0; render(); break;
      case 'next-tour': S.tourStep++; if (S.tourStep >= TOUR.length) { S.touring = false; S.tourDone = true; sessionStorage.setItem('ascentTour','1'); } render(); break;
      case 'skip-tour': case 'tour-bg': S.touring = false; S.tourDone = true; sessionStorage.setItem('ascentTour','1'); render(); break;
    }
  };

  const loadIdx = async () => {
    if (!STUDENT_SLUG) return; S.loading = true; render();
    try {
      S.idx = await fj(`${DATA_BASE}/${STUDENT_SLUG}-index.json`);
      const r = [];
      for (const c of S.idx.categories) { for (let t = 1; t <= 10; t++) { try { const d = await fj(`${DATA_BASE}/${STUDENT_SLUG}/tier-${t}/${c.id}.json`); if (Array.isArray(d)) r.push(...d); } catch(e){} } }
      S.exs = r; S.loading = false; S.view = 'home'; render();
    } catch(e) { S.err = e.message; S.loading = false; render(); }
  };
  const loadAll = () => { S.view = 'tiers'; render(); };
  const loadEx = (t, c) => { S.tier = t; S.cat = c; S.view = 'exercises'; render(); };

  const mount = () => {
    const c = $('#page-quiz');
    if (!c) return false;
    if (c.dataset.qw === '1' && c.querySelector('.qwidget')) return true; // already mounted
    c.dataset.qw = '1';
    if (!S.idx) loadIdx(); else render(); // re-render if data already loaded
    return true;
  };

  // Watch for #page-quiz appearing/disappearing (SPA tab navigation)
  let routeObs = null;
  const watchRoute = () => {
    if (routeObs) return; // already watching
    let debounce = null;
    routeObs = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const c = $('#page-quiz');
        if (c && (!c.dataset.qw || !c.querySelector('.qwidget'))) {
          c.dataset.qw = '1';
          if (!S.idx) loadIdx(); else render();
        }
      }, 100);
    });
    routeObs.observe(document.body, { childList: true, subtree: true });
  };

  const init = () => {
    if (mount()) { watchRoute(); return; }
    let t = 0;
    const p = setInterval(() => {
      t++;
      if ($('#page-quiz')) { clearInterval(p); mount(); watchRoute(); }
      else if (t > 60) clearInterval(p);
    }, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
