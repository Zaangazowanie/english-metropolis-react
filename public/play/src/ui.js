// HUD, loading screen, dialog/exercise panel, XP persistence.
import { buildSession, recordAnswer, masteryFor, overallMastery } from './grammar.js';

const DRILL_N = 7;   // questions per teacher drill (pass = 70%, i.e. 5/7)

export class UI {
  // Opt-in developer HUD: englishmetro.com/play/?debug
  static debugHUD = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('debug');

  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.xp = Number(localStorage.getItem('em_xp') || 0);
    this.$('xp').textContent = `✦ ${this.xp} XP`;
    this.dialogOpen = false;
    this.guideOpen = false;
    this.welcomeOpen = false;
    this._guideSeen = localStorage.getItem('em_guide_seen') === '1';
    this._toastTimer = null;
    this.$('dialog').querySelector('.close').addEventListener('click', () => this.closeDialog());
    this.$('guide-close').addEventListener('click', () => this.showGuide(false));
    this.$('guide-replay')?.addEventListener('click', () => {
      this.showGuide(false);
      this.showWelcome({ force: true });
    });
    this.$('metro-close').addEventListener('click', () => { this.$('metro').style.display = 'none'; });
    this.$('citymap-close').addEventListener('click', () => { this.$('citymap').style.display = 'none'; });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { this.closeDialog(); this.showGuide(false); }
    });
  }

  setProgress(frac) { this.$('bar').style.width = `${Math.round(frac * 100)}%`; }

  showBegin(onBegin) {
    const b = this.$('begin');
    b.style.display = 'block';
    b.addEventListener('click', () => {
      const l = this.$('loading');
      l.style.transition = 'opacity 0.7s';
      l.style.opacity = '0';
      setTimeout(() => (l.style.display = 'none'), 750);
      this.$('hud').classList.add('on');
      onBegin();
    }, { once: true });
  }

  // open=true, {auto:true} → only shows the first time ever (H always works)
  showGuide(open, { auto = false } = {}) {
    if (open && auto && this._guideSeen) return;
    this.guideOpen = open;
    this.$('guide').style.display = open ? 'flex' : 'none';
    if (!open) { this._guideSeen = true; localStorage.setItem('em_guide_seen', '1'); }
  }

  // ---------- first-visit welcome tour (paged) ----------
  // Warm multi-page onboarding right after BEGIN. Shows once (em_welcome=1);
  // the H guide stays available for reference any time.
  showWelcome({ force = false } = {}) {
    if (!force && localStorage.getItem('em_welcome') === '1') return false;
    const touch = document.body.classList.contains('touch');
    const PAGES = [
      {
        art: '🚇', eyebrow: 'WELCOME TO', title: 'English Metropolis',
        body: `You've just stepped off the train, and the whole city is glad you're here.
          <br/><br/>This is a living, open city where <b>every district speaks its own English</b> —
          Cockney to Texan, Glasgow to Jamaica. You play <b>Wren</b>, the newest arrival,
          and the locals can't wait to teach you how they really talk.
          <div class="tip">Take the two-minute tour — it'll make you a local faster. 🦉</div>`,
      },
      {
        art: '🧭', eyebrow: 'STEP 1', title: 'Find your feet',
        body: touch
          ? `<div class="krow"><span class="k">joystick</span> walk — bottom left</div>
             <div class="krow"><span class="k">drag</span> look around</div>
             <div class="krow"><span class="k">buttons</span> talk · metro · map — bottom right</div>
             <div class="tip">Take a stroll around the plaza first — the city rewards the curious.</div>`
          : `<div class="krow"><span class="k">W A S D</span> walk (arrow keys work too)</div>
             <div class="krow"><span class="k">Shift</span> run like you're late for the train</div>
             <div class="krow"><span class="k">drag</span> look around · <b>scroll</b> to zoom</div>
             <div class="krow"><span class="k">Space</span> hop</div>
             <div class="tip">Take a stroll around the plaza first — the city rewards the curious.</div>`,
      },
      {
        art: '❗', eyebrow: 'STEP 2', title: 'Learn from the locals',
        body: `See a golden <b>❗</b> floating over someone's head? That's a local with
          exercises for you.
          <div class="krow"><span class="k">${touch ? '💬 button' : 'E'}</span> talk to them</div>
          <div class="krow"><span class="k">their drill</span> 7 quick questions on real grammar</div>
          <div class="krow"><span class="k">✓</span> means they're done for this round</div>
          <div class="tip">Help <b>every</b> local in a district and the round completes —
          they all come back with new, harder exercises. That's how you level up.</div>`,
      },
      {
        art: '🗺️', eyebrow: 'STEP 3', title: 'Ride, track, explore',
        body: `<div class="krow"><span class="k">${touch ? '🚇 button' : 'T'}</span> ride the metro from any platform</div>
          <div class="krow"><span class="k">${touch ? '🗺️ button' : 'M'}</span> the city map — click a station to travel</div>
          <div class="krow"><span class="k">${touch ? 'mini-map' : 'J'}</span> ${touch ? 'bottom-left shows where you are' : 'your journal — quests, mastery, progress'}</div>
          <div class="krow"><span class="k">🎤</span> answer questions with your voice</div>
          <div class="tip">The little map in the corner starts foggy — exploring reveals the city,
          and it remembers what you've discovered.</div>`,
      },
      {
        art: '🌇', eyebrow: 'READY?', title: 'The city is yours',
        body: `That's everything you need. Your first locals are waiting right here on
          <b>Metropolis Central plaza</b> — look for the <b>❗</b> marks.
          <br/><br/>Earn XP, close out districts, and collect every dialect on the map.
          <div class="tip">Press <b>H</b> any time for the full how-to guide. Welcome aboard. 🚉</div>`,
      },
    ];
    this.welcomeOpen = true;
    const el = this.$('welcome');
    const body = this.$('welcome-body'), dots = this.$('welcome-dots');
    const art = this.$('welcome-art'), eyebrow = this.$('welcome-eyebrow'), title = this.$('welcome-title');
    const back = this.$('welcome-back'), next = this.$('welcome-next'), skip = this.$('welcome-skip');
    let pi = 0;
    const render = () => {
      const p = PAGES[pi];
      art.textContent = p.art;
      eyebrow.textContent = p.eyebrow;
      title.textContent = p.title;
      body.innerHTML = `<div class="w-page">${p.body}</div>`;
      dots.innerHTML = PAGES.map((_, i) => `<span class="${i === pi ? 'on' : ''}"></span>`).join('');
      back.style.visibility = pi === 0 ? 'hidden' : 'visible';
      next.textContent = pi === PAGES.length - 1 ? '🚉 Start exploring' : 'Next →';
      skip.style.display = pi === PAGES.length - 1 ? 'none' : 'block';
    };
    const done = () => {
      localStorage.setItem('em_welcome', '1');
      localStorage.setItem('em_guide_seen', '1');   // the tour covers the auto-guide
      this._guideSeen = true;
      this.welcomeOpen = false;
      el.style.display = 'none';
      this.audio?.fanfare?.();
      this.toast('🦉 Welcome to the Metropolis — find the ❗ locals!');
    };
    back.onclick = () => { if (pi > 0) { pi--; render(); } };
    next.onclick = () => { this.audio?.click?.(); if (pi < PAGES.length - 1) { pi++; render(); } else done(); };
    skip.onclick = done;
    render();
    el.style.display = 'flex';
    return true;
  }

  setPrompt(text) {
    const p = this.$('prompt');
    if (text) { p.innerHTML = text; p.style.display = 'block'; }
    else p.style.display = 'none';
  }

  // persistent objective chip under the zone banner: what to do, right here
  setObjective(html) {
    const o = this.$('objective');
    if (!o) return;
    if (html) { o.innerHTML = html; o.style.display = 'block'; }
    else o.style.display = 'none';
  }

  toast(text) {
    const t = this.$('toast');
    t.textContent = text;
    t.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (t.style.opacity = '0'), 2600);
  }

  addXP(n) {
    this.xp += n;
    localStorage.setItem('em_xp', String(this.xp));
    this.$('xp').textContent = `✦ ${this.xp} XP`;
    this.toast(`+${n} XP ✦`);
  }

  openDialog(npc, hooks = {}) {
    this.dialogOpen = true;
    const d = this.$('dialog');
    d.style.display = 'block';
    d.querySelector('.who').textContent = `${npc.name} — ${npc.role}`;
    d.querySelector('.text').textContent = npc.greeting;
    this.voice?.speak(npc.voiceId, npc.greeting, { profile: npc.accentProfile });
    const opts = d.querySelector('.opts');
    opts.innerHTML = '';
    const st = hooks.status;

    // done for this round → point the player at the rest of the circuit
    if (npc.done) {
      d.querySelector('.text').textContent =
        `You've aced my exercises this round! ` +
        (st && st.remaining > 0
          ? `Help the other local${st.remaining > 1 ? 's' : ''} around here — once everyone's had a turn, I'll have new, harder ones for you.`
          : `Come back soon — I'll have new, harder ones for you.`);
      const b = document.createElement('button');
      b.textContent = st
        ? `🔁 Round ${st.round} here: ${st.done}/${st.total} locals helped — keep going!`
        : '✦ See you around!';
      b.addEventListener('click', () => this.closeDialog());
      opts.appendChild(b);
      return;
    }

    // main task: the grammar drill (completes this teacher for the round)
    if (npc.grammar) {
      const m = masteryFor(npc.grammar.concept);
      const drillBtn = document.createElement('button');
      drillBtn.innerHTML = `❗ <b>${npc.grammar.conceptName}</b> — ${DRILL_N} questions · ${npc.grammar.level}` +
        (m.seen ? ` <span style="opacity:.6">(${m.pct}% so far)</span>` : '') +
        ` <span style="opacity:.7">→ helps this local</span>`;
      drillBtn.addEventListener('click', () => this.openDrill(npc, hooks));
      opts.append(drillBtn);
    }

    // warm-up: single dialect question, XP once per round, doesn't complete the teacher
    if (npc.exercise && hooks.warmupAvailable !== false) {
      const start = document.createElement('button');
      start.textContent = `📖 Warm-up: ${npc.exercise.title}  (+${npc.exercise.reward} XP)`;
      start.addEventListener('click', () => {
        d.querySelector('.text').textContent = npc.exercise.prompt;
        opts.innerHTML = '';
        npc.exercise.options.forEach((opt, i) => {
          const ob = document.createElement('button');
          ob.textContent = opt;
          ob.addEventListener('click', () => {
            if (i === npc.exercise.answerIndex) {
              ob.classList.add('right');
              this.audio?.correct();
              if (hooks.claimWarmup?.() !== false) this.addXP(npc.exercise.reward);
              hooks.onWarmup?.(npc);
              setTimeout(() => {
                if (!this.dialogOpen) return;
                this.closeDialog();
                this.toast('📖 Warm-up done — now take their drill to finish helping them!');
              }, 900);
            } else {
              ob.classList.add('wrong');
              ob.disabled = true;
              this.audio?.wrong();
              hooks.onWrong?.(npc);
            }
          });
          opts.appendChild(ob);
        });
      });
      opts.append(start);
    }

    const later = document.createElement('button');
    later.textContent = 'Maybe later';
    later.addEventListener('click', () => this.closeDialog());
    opts.append(later);
  }

  // A passer-by's one-question exercise. Deliberately lighter than a teacher's
  // drill: it exists so that walking down a street is itself practice, and so
  // the crowd is something you talk to rather than scenery you walk past.
  openStreetDialog(speaker, hooks = {}) {
    this.dialogOpen = true;
    const d = this.$('dialog');
    d.style.display = 'block';
    d.querySelector('.who').textContent = `${speaker.name} — ${speaker.role}`;
    const text = d.querySelector('.text');
    const opts = d.querySelector('.opts');
    opts.innerHTML = '';
    this.voice?.speak(null, speaker.line, { profile: speaker.accentProfile });

    if (speaker.done || !speaker.exercise) {
      text.textContent = speaker.line;
      const bye = document.createElement('button');
      bye.textContent = '✦ Nice one, see you around';
      bye.addEventListener('click', () => this.closeDialog());
      opts.appendChild(bye);
      return;
    }

    const ex = speaker.exercise;
    text.innerHTML = `<span style="opacity:.72">"${speaker.line}"</span><br><br>${ex.prompt}`;
    ex.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.textContent = opt;
      b.addEventListener('click', () => {
        if (i === ex.answerIndex) {
          b.classList.add('right');
          this.audio?.correct();
          hooks.onCorrect?.();
          text.innerHTML = `<b>${ex.explain || 'Spot on.'}</b>`;
          opts.innerHTML = '';
          const done = document.createElement('button');
          done.textContent = `✦ +${ex.reward || 8} XP — cheers!`;
          done.addEventListener('click', () => this.closeDialog());
          opts.appendChild(done);
        } else {
          b.classList.add('wrong');
          b.disabled = true;
          this.audio?.wrong();
          hooks.onWrong?.();
        }
      });
      opts.appendChild(b);
    });
    const later = document.createElement('button');
    later.textContent = 'Maybe later';
    later.addEventListener('click', () => this.closeDialog());
    opts.appendChild(later);
  }

  // ---------- grammar drill (multi-question MCQ session) ----------
  openDrill(npc, hooks = {}) {
    const g = npc.grammar;
    const session = buildSession(g.concept, g.level, DRILL_N, npc.dialectCode);
    const N = session.questions.length;            // bank may run short of DRILL_N
    const PASS = Math.max(1, Math.ceil(N * 0.7));  // 7q → 5 to pass
    this._session = session;                       // debug/testing handle
    const d = this.$('dialog');
    const who = d.querySelector('.who');
    const text = d.querySelector('.text');
    const opts = d.querySelector('.opts');
    let qi = 0, correct = 0;

    const finish = () => {
      const passed = correct >= PASS;
      const fam = npc.barkFam || 'isles';
      this.voice?.speak(`bark_${fam}_${correct === N ? 'perfect' : passed ? 'pass' : 'fail'}`,
        passed ? 'Nice work. Your English is levelling up.' : 'Good effort. Practice makes perfect.',
        { profile: npc.accentProfile });
      who.textContent = `${npc.name} — grammar`;
      text.innerHTML = `<b>${session.conceptName}</b><br>You scored <b>${correct}/${N}</b>. ` +
        (passed ? 'Sharp! You\'ve helped this local for the round. ✓' :
          `You need ${PASS}/${N} to fully help this local — have another go!`);
      opts.innerHTML = '';
      const reward = 6 * correct + (passed ? 15 : 0);
      this.addXP(reward);
      if (passed) {
        this.audio?.fanfare?.();
        if (!npc.done) { npc.done = true; npc.refreshMarker?.(); hooks.onCorrect?.(npc); }
      }
      const done = document.createElement('button');
      done.textContent = `✦ +${reward} XP — ${passed ? 'done' : 'close'}`;
      done.addEventListener('click', () => this.closeDialog());
      opts.appendChild(done);
      if (!passed) {
        const retry = document.createElement('button');
        retry.textContent = '↻ Try a fresh set';
        retry.addEventListener('click', () => this.openDrill(npc, hooks));
        opts.appendChild(retry);
      }
    };

    const showQuestion = () => {
      const q = session.questions[qi];
      who.innerHTML = `${npc.name} · <span style="opacity:.7">${session.conceptName}</span> ` +
        `<span style="float:right;opacity:.6">${qi + 1}/${N} · ${'●'.repeat(qi)}${'○'.repeat(N - qi)}</span>`;
      text.innerHTML = `Which sentence is correct?`;
      opts.innerHTML = '';
      let answered = false;
      const optionButtons = [];
      q.options.forEach((opt, i) => {
        const ob = document.createElement('button');
        optionButtons.push(ob);
        ob.textContent = opt;
        ob.addEventListener('click', () => {
          if (answered) return;
          const isRight = i === q.answerIndex;
          if (isRight) {
            answered = true;
            ob.classList.add('right');
            correct++;
            this.audio?.correct();
            recordAnswer(session.concept, q.id, true);
            setTimeout(() => { qi++; qi >= N ? finish() : showQuestion(); }, 750);
          } else {
            ob.classList.add('wrong');
            ob.disabled = true;
            this.audio?.wrong();
            recordAnswer(session.concept, q.id, false);
            // reveal the teaching explanation, let them try again
            let ex = text.querySelector('.explain');
            if (!ex) {
              ex = document.createElement('div');
              ex.className = 'explain';
              text.appendChild(ex);
            }
            ex.innerHTML = `💡 ${q.explain}` +
              (q.localValid ? `<br><i>(Heads up: locals here might actually say the other one!)</i>` : '');
          }
        });
        opts.appendChild(ob);
      });

      // speak the answer — read the correct sentence aloud (or say "option two")
      if (this.voice) {
        const mic = document.createElement('button');
        mic.innerHTML = '🎤 <i>say the correct sentence</i>';
        mic.style.opacity = '0.85';
        mic.addEventListener('click', async () => {
          if (answered) return;
          const heard = await this.voice.listen((state) => {
            mic.innerHTML = state === 'listening' ? '🎤 <b>listening…</b>'
              : state === 'thinking' ? '🎤 <i>thinking…</i>'
              : '🎤 <i>say the correct sentence</i>';
          }, npc.accentProfile);
          if (answered) return;
          if (!heard) { this.toast('🎤 Didn\'t catch that — try again'); return; }
          const idx = this.voice.matchOption(heard, q.options);
          if (idx >= 0) {
            this.toast(`🎤 "${heard}"`);
            optionButtons[idx].click();
          } else {
            this.toast(`🎤 Heard "${heard}" — no match, tap or try again`);
          }
        });
        opts.appendChild(mic);
      }
    };

    showQuestion();
  }

  closeDialog() {
    this.$('dialog').style.display = 'none';
    this.dialogOpen = false;
    this.voice?.stop();
  }

  // The frame counter is a developer readout, not player-facing: it was
  // shipping "49 fps · 62% · potato" to customers, and "potato" is an internal
  // tier name. Hidden unless ?debug is on the URL. Players still see quality
  // through the graphics dropdown, which uses the friendly labels.
  setFPS(fps, scale) {
    const el = this.$('fps');
    if (!UI.debugHUD) { el.style.display = 'none'; return; }
    el.textContent = `${fps | 0} fps · ${(scale * 100) | 0}%`
      + (this.qualityTier ? ` · ${this.qualityTier}${this.qualityManual ? '*' : ''}` : '');
  }

  // Shown next to the FPS chip so a player can see the game adapt, and so a
  // manual override is visibly distinct from an automatic one.
  setQualityTier(tier, manual) {
    this.qualityTier = tier;
    this.qualityManual = !!manual;
  }

  // ---------- city map (M) ----------
  get mapOpen() { return this.$('citymap').style.display === 'flex'; }

  showCityMap(zoneMgr, playerPos, onPick) {
    if (this.mapOpen) { this.$('citymap').style.display = 'none'; return; }
    const canvas = this.$('citymap-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, C = W / 2, SCALE = W / 920;   // world ±430 → canvas
    const px = (x) => C + x * SCALE, pz = (z) => C + z * SCALE;
    const lineColors = { isles: '#7ba05b', liberty: '#8fb4c9', sunward: '#e8a13d' };

    const draw = (hover) => {
      // parchment ground
      ctx.fillStyle = '#efe0c0';
      ctx.fillRect(0, 0, W, W);
      // region blots: soft splash of each zone's palette
      for (const z of zoneMgr.zones) {
        ctx.fillStyle = z.data.palette.accent + '55';
        ctx.beginPath();
        ctx.arc(px(z.center.x), pz(z.center.y), 26 * SCALE * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // metro lines
      for (const [key, L] of Object.entries({ isles: Math.PI / 2, liberty: Math.PI / 2 + 2.094, sunward: Math.PI / 2 - 2.094 })) {
        ctx.strokeStyle = lineColors[key];
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px(0), pz(0));
        ctx.lineTo(px(Math.cos(L) * 420), pz(-Math.sin(L) * 420));
        ctx.stroke();
      }
      // stations
      for (const z of zoneMgr.zones) {
        const done = zoneMgr.progressFor(z.data.code).laps >= 1;
        ctx.beginPath();
        ctx.arc(px(z.stopPos.x), pz(z.stopPos.y), z === hover ? 7 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = done ? '#7ba05b' : '#f6ead2';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#4a3826';
        ctx.stroke();
      }
      // hub
      ctx.beginPath(); ctx.arc(C, C, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#6b4fa0'; ctx.fill();
      ctx.strokeStyle = '#f6ead2'; ctx.lineWidth = 2.5; ctx.stroke();
      // player marker
      ctx.beginPath(); ctx.arc(px(playerPos.x), pz(playerPos.z), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#c9302c'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      // hover label
      if (hover) {
        const hx = px(hover.stopPos.x), hy = pz(hover.stopPos.y);
        ctx.font = 'bold 15px Georgia';
        const name = hover.data.zoneName;
        const wpx = ctx.measureText(name).width + 16;
        const bx = Math.min(Math.max(hx - wpx / 2, 4), W - wpx - 4);
        const by = hy > 40 ? hy - 36 : hy + 14;
        ctx.fillStyle = 'rgba(42,30,18,0.92)';
        ctx.fillRect(bx, by, wpx, 24);
        ctx.fillStyle = '#f6ead2';
        ctx.fillText(name, bx + 8, by + 17);
        ctx.font = '11px Georgia';
        ctx.fillStyle = 'rgba(42,30,18,0.85)';
      }
    };
    draw(null);

    const toWorld = (e) => {
      const r = canvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (W / r.width);
      const cy = (e.clientY - r.top) * (W / r.height);
      return { x: (cx - C) / SCALE, z: (cy - C) / SCALE };
    };
    const nearest = (e) => {
      const w = toWorld(e);
      let best = null, bd = 30 / SCALE;   // ~30px pick radius
      for (const z of zoneMgr.zones) {
        const d = Math.hypot(w.x - z.stopPos.x, w.z - z.stopPos.y);
        if (d < bd) { bd = d; best = z; }
      }
      return best;
    };
    canvas.onmousemove = (e) => draw(nearest(e));
    canvas.onclick = (e) => {
      const z = nearest(e);
      if (z) { this.$('citymap').style.display = 'none'; onPick(z); }
    };
    this.$('citymap').style.display = 'flex';
  }

  // ---------- metro map (fast travel) ----------
  get metroOpen() { return this.$('metro').style.display === 'flex'; }

  showMetro(zoneMgr, onPick) {
    if (this.metroOpen) { this.$('metro').style.display = 'none'; return; }
    const body = this.$('metro').querySelector('.rows');
    body.innerHTML = '';
    const label = { isles: '🟢 THE ISLES LINE', liberty: '🔵 THE LIBERTY LINE', sunward: '🟠 THE SUNWARD LINE' };
    const byLine = { isles: [], liberty: [], sunward: [] };
    for (const z of zoneMgr.zones) byLine[z.lineKey].push(z);
    // hub row first
    const hub = document.createElement('div');
    hub.className = 'mrow';
    hub.innerHTML = `<span>🚉</span> Metropolis Central <em>hub</em>`;
    hub.addEventListener('click', () => { this.$('metro').style.display = 'none'; onPick(null); });
    body.appendChild(hub);
    for (const [k, list] of Object.entries(byLine)) {
      const h = document.createElement('div');
      h.className = 'jline';
      h.textContent = label[k];
      body.appendChild(h);
      for (const z of list) {
        const row = document.createElement('div');
        row.className = 'mrow';
        const p = zoneMgr.progressFor(z.data.code);
        row.innerHTML = `<span>${p.laps >= 1 ? '✅' : Object.keys(p.d).length ? '◔' : '·'}</span> ${z.data.zoneName} <em>${z.data.dialect}</em>`;
        row.addEventListener('click', () => { this.$('metro').style.display = 'none'; onPick(z); });
        body.appendChild(row);
      }
    }
    this.$('metro').style.display = 'flex';
  }

  fadeTravel(action) {
    const f = this.$('fade');
    f.classList.add('on');
    setTimeout(() => { action(); setTimeout(() => f.classList.remove('on'), 120); }, 480);
  }

  // ---------- quest journal ----------
  get journalOpen() { return this.$('journal').style.display === 'flex'; }

  toggleJournal(zoneMgr) {
    if (this.journalOpen) { this.$('journal').style.display = 'none'; return; }
    const body = this.$('journal').querySelector('.rows');
    const byLine = { isles: [], liberty: [], sunward: [] };
    for (const z of zoneMgr.zones) byLine[z.lineKey].push(z);
    let html = `<div class="jxp">✦ ${this.xp} XP total</div>`;

    // ---- current mission: the circuit you're standing in ----
    const here = zoneMgr.current;
    const hereCode = here ? here.data.code : 'hub';
    const hereName = zoneMgr.circuitName(hereCode);
    const st = zoneMgr.roundStatus(hereCode);
    html += `<div class="jline">🎯 YOUR MISSION</div>`;
    html += `<div class="jrow"><span>❗</span> <b>${hereName}</b> — Round ${st.round}` +
      `<em>${st.done}/${st.total} locals helped</em></div>`;
    html += `<div class="jnote">Take the <b>drill</b> of every ❗-marked local in a district. ` +
      `When all of them are done, the round completes and all the locals there get ` +
      `<b>new, harder exercises</b>. ✓ = done till next round.</div>`;

    // ---- city goal ----
    const cleared = zoneMgr.zones.filter((z) => zoneMgr.progressFor(z.data.code).laps >= 1).length;
    const hubLaps = zoneMgr.progressFor('hub').laps;
    html += `<div class="jline">🏙 CITY GOAL</div>`;
    html += `<div class="jrow"><span>${cleared >= zoneMgr.zones.length ? '✅' : '·'}</span>` +
      ` Complete Round 1 in every district<em>${cleared}/${zoneMgr.zones.length} districts</em></div>`;
    html += `<div class="jrow"><span>${hubLaps >= 1 ? '✅' : '·'}</span>` +
      ` Metropolis Central circuit<em>Round ${hubLaps + 1} · ${zoneMgr.roundStatus('hub').done}/${zoneMgr.roundStatus('hub').total}</em></div>`;

    // grammar mastery summary across the concepts
    html += `<div class="jline">📚 GRAMMAR MASTERY</div>`;
    for (const c of overallMastery()) {
      const bar = c.total ? Math.round((c.correctUnique / c.total) * 100) : 0;
      const mark = bar >= 80 ? '✅' : bar > 0 ? '◔' : '·';
      html += `<div class="jrow"><span>${mark}</span> ${c.name}` +
        `<em>${c.correctUnique}/${c.total}${c.pct ? ` · ${c.pct}% acc` : ''}</em></div>`;
    }
    const label = { isles: '🟢 THE ISLES LINE', liberty: '🔵 THE LIBERTY LINE', sunward: '🟠 THE SUNWARD LINE' };
    for (const [k, list] of Object.entries(byLine)) {
      html += `<div class="jline">${label[k]}</div>`;
      for (const z of list) {
        const p = zoneMgr.progressFor(z.data.code);
        const total = Math.min(2, z.data.npcs.length);
        const done = Object.keys(p.d).length;
        const mark = p.laps >= 1 ? '✅' : done > 0 ? '◔' : '·';
        html += `<div class="jrow"><span>${mark}</span> ${z.data.zoneName}` +
          `<em>${z.data.dialect} — R${p.laps + 1} · ${done}/${total}</em></div>`;
      }
    }
    body.innerHTML = html;
    this.$('journal').style.display = 'flex';
  }
}
