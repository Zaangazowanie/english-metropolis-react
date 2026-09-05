// HUD, loading screen, dialog/exercise panel, overlays, rewards.
//
// The one-sentence system every surface here teaches: "Help every local in a
// district to stamp it in your Metro Pass; stamp every station on a line to
// earn its certificate; earn XP to climb from Newcomer to Cosmopolitan."
//
// Scoring is FIRST CLICK ONLY. A wrong click reveals the answer and the
// teaching explanation, and that question is lost; the drill passes at 70% of
// first clicks (5/7). Mastery and the review queue (progress.js) are fed from
// the same first clicks, so the drill result, the journal and the rank agree.
import { buildSession, recordAnswer, masteryFor, overallMastery, shuffledOptions, conceptName, maxLevelFor, LEVELS } from './grammar.js';
import { progress } from './progress.js';
import { OverlayStack, ToastQueue } from './overlay.js';
import { rankFor, renderRankChip } from './ranks.js';
import { LINES } from './zones.js';

const DRILL_N = 7;   // questions per local's drill (pass = 70%, i.e. 5/7)
const XP_PER_FIRST_TRY = 6, XP_PASS_BONUS = 15;
export const SYSTEM_SENTENCE = 'Help every local in a district to <b>stamp</b> it in your Metro Pass; stamp every station on a line to earn its <b>certificate</b>; earn XP to climb from <b>Newcomer</b> to <b>Cosmopolitan</b>.';
const LINE_NAMES = { isles: 'The Isles Line', liberty: 'The Liberty Line', sunward: 'The Sunward Line' };
export const lineHex = (key) => '#' + (LINES[key]?.color ?? 0xffffff).toString(16).padStart(6, '0');
const lineDot = (key) => `<span class="ldot" style="background:${lineHex(key)}"></span>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  // Opt-in developer HUD: englishmetro.com/play/?debug
  static debugHUD = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('debug');

  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.progress = progress;
    this.xp = progress.xp;
    this._shownXP = this.xp;
    this.zoneMgr = null;
    this.onDialogClose = null;    // set by main: flushes deferred marker refreshes
    this.overlay = new OverlayStack();
    this.toasts = new ToastQueue(this.$('toast'));
    this._guideSeen = localStorage.getItem('em_guide_seen') === '1';
    this._journalTab = 'mission';
    this._ceremonies = [];
    this.isTouch = () => document.body.classList.contains('touch');

    const ov = this.overlay;
    // Escape on the tour = skip it (and remember that, like the skip button)
    ov.register('welcome', { el: this.$('welcome'), modal: true, exclusive: true,
      hide: () => { try { localStorage.setItem('em_welcome', '1'); localStorage.setItem('em_guide_seen', '1'); } catch {} this._guideSeen = true; } });
    ov.register('dialog', { el: null, modal: true, exclusive: true, hide: () => this._dialogHidden() });
    ov.register('metro', { el: this.$('metro') });
    ov.register('citymap', { el: this.$('citymap'), hide: () => { this._mapAnim = false; } });
    ov.register('journal', { el: this.$('journal') });
    ov.register('guide', { el: this.$('guide'), hide: () => { this._guideSeen = true; try { localStorage.setItem('em_guide_seen', '1'); } catch {} } });
    ov.register('settings', { el: this.$('settings') });
    ov.register('ceremony', { el: this.$('ceremony'), exclusive: false, hide: () => this._nextCeremony() });

    this.$('dialog').querySelector('.close').addEventListener('click', () => this.closeDialog());
    this.$('guide-close').addEventListener('click', () => this.showGuide(false));
    this.$('guide-replay')?.addEventListener('click', () => { this.showGuide(false); this.showWelcome({ force: true }); });
    this.$('metro-close').addEventListener('click', () => ov.close('metro'));
    this.$('citymap-close').addEventListener('click', () => ov.close('citymap'));
    this.$('journal-close')?.addEventListener('click', () => ov.close('journal'));
    this.$('settings-close')?.addEventListener('click', () => ov.close('settings'));
    this.$('settings-replay')?.addEventListener('click', () => { ov.close('settings'); this.showWelcome({ force: true }); });
    this.$('tb-settings')?.addEventListener('click', () => ov.toggle('settings'));
    this.$('tb-help')?.addEventListener('click', () => this.showGuide(!this.guideOpen));
    this.$('ceremony')?.addEventListener('click', () => ov.close('ceremony'));
    this.$('journal').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { this._journalTab = tab.dataset.tab; this._renderJournal(); }
      const rv = e.target.closest('[data-review]');
      if (rv) this.startReview();
    });

    this.renderXP(true);
    progress.onChange((what) => { if (what === 'write-failed') this.toast('⚠️ Progress could not be saved in this browser (storage full or blocked)'); });
  }

  // ---------- state the rest of the game reads ----------
  get blocked() { return this.overlay.any; }
  get dialogOpen() { return this.overlay.isOpen('dialog'); }
  get guideOpen() { return this.overlay.isOpen('guide'); }
  get welcomeOpen() { return this.overlay.isOpen('welcome'); }
  get journalOpen() { return this.overlay.isOpen('journal'); }
  get metroOpen() { return this.overlay.isOpen('metro'); }
  get mapOpen() { return this.overlay.isOpen('citymap'); }
  get settingsOpen() { return this.overlay.isOpen('settings'); }

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
    if (open) this.overlay.open('guide'); else this.overlay.close('guide');
  }

  // ---------- first-visit welcome tour (paged) ----------
  showWelcome({ force = false } = {}) {
    if (!force && localStorage.getItem('em_welcome') === '1') return false;
    const touch = this.isTouch();
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
             <div class="krow"><span class="k">buttons</span> talk · metro · map · journal · help — bottom right</div>
             <div class="tip">Take a stroll around the plaza first — the city rewards the curious.</div>`
          : `<div class="krow"><span class="k">W A S D</span> walk (arrow keys work too)</div>
             <div class="krow"><span class="k">Shift</span> run like you're late for the train</div>
             <div class="krow"><span class="k">drag</span> look around · <b>scroll</b> to zoom</div>
             <div class="krow"><span class="k">Space</span> hop</div>
             <div class="tip">Take a stroll around the plaza first — the city rewards the curious.</div>`,
      },
      {
        art: '❗', eyebrow: 'STEP 2', title: 'Learn from the locals',
        body: `A gold <b>❗</b> over someone's head means a local has exercises for you;
          a small <b>gold dot</b> is a passer-by with one quick question.
          <div class="krow"><span class="k">${touch ? '💬 button' : 'E'}</span> talk to them</div>
          <div class="krow"><span class="k">their drill</span> 7 questions · <b>your first answer counts</b> · pass at 5/7</div>
          <div class="krow"><span class="k">✓</span> means they're helped for this round</div>
          <div class="tip">Each district has three beats: 👂 <b>Overhear</b> the street locals, 💬 <b>Talk</b> to the quest locals, ❗ pass their <b>Drills</b> — and the district is <b>stamped</b> in your Metro Pass.</div>`,
      },
      {
        art: '🎫', eyebrow: 'STEP 3', title: 'Your Metro Pass',
        body: `<div class="krow"><span class="k">🎫 stamp</span> help every local in a district (+60 XP)</div>
          <div class="krow"><span class="k">📜 certificate</span> stamp every station on a line (+300 XP)</div>
          <div class="krow"><span class="k">✦ rank</span> XP climbs you from <b>Newcomer</b> to <b>Cosmopolitan</b></div>
          <div class="krow"><span class="k">↻ review</span> questions you miss come back in later drills</div>
          <div class="tip">Everything you earn is in your journal (${touch ? '📖 button' : 'J'}): Mission · Passport · Mastery · Review.</div>`,
      },
      {
        art: '🗺️', eyebrow: 'STEP 4', title: 'Ride, track, explore',
        body: `<div class="krow"><span class="k">${touch ? '🚇 button' : 'T'}</span> ride the metro from any platform</div>
          <div class="krow"><span class="k">${touch ? '🗺️ button' : 'M'}</span> the city map — ${touch ? 'tap a station to name it, tap again to ride' : 'click a station to ride'}</div>
          <div class="krow"><span class="k">${touch ? '? button' : 'H'}</span> the how-to guide, any time</div>
          <div class="tip">The little map in the corner starts foggy — exploring reveals the city,
          and it remembers what you've discovered.</div>`,
      },
      {
        art: '🌇', eyebrow: 'READY?', title: 'The city is yours',
        body: `That's everything you need. Your first locals are waiting right here on
          <b>Metropolis Central plaza</b> — look for the gold <b>❗</b>.
          <br/><br/>${SYSTEM_SENTENCE}
          <div class="tip">${touch ? 'Tap <b>?</b>' : 'Press <b>H</b>'} any time for the full how-to guide. Welcome aboard. 🚉</div>`,
      },
    ];
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
      try { localStorage.setItem('em_welcome', '1'); localStorage.setItem('em_guide_seen', '1'); } catch {}
      this._guideSeen = true;
      this.overlay.close('welcome');
      this.audio?.fanfare?.();
      this.toast('🦉 Welcome to the Metropolis — find the gold ❗ locals!');
    };
    back.onclick = () => { if (pi > 0) { pi--; render(); } };
    next.onclick = () => { this.audio?.click?.(); if (pi < PAGES.length - 1) { pi++; render(); } else done(); };
    skip.onclick = done;
    render();
    el.style.display = 'flex';
    this.overlay.open('welcome');
    return true;
  }

  // ---------- prompt / objective / toasts ----------
  // The interaction prompt is keyed on the device: no phone has an E key.
  setPrompt(text) {
    const p = this.$('prompt');
    if (text) { p.innerHTML = text; p.style.display = 'block'; }
    else p.style.display = 'none';
  }
  // 'talk to Marek' → 'Press E — talk to Marek' / 'Tap 💬 — talk to Marek'
  promptFor(action) {
    return (this.isTouch() ? 'Tap <b>💬</b> — ' : 'Press <b>E</b> — ') + action;
  }
  // pulse the talk button while a local is in range (touch only)
  setTalkReady(on) {
    const b = this.$('tb-talk');
    if (b) b.classList.toggle('pulse', !!on);
  }

  // persistent objective chip under the zone banner: the district's three beats
  setObjective(html) {
    const o = this.$('objective');
    if (!o) return;
    if (html) { o.innerHTML = html; o.style.display = 'block'; }
    else o.style.display = 'none';
  }
  // Overhear → Talk → Drill → Stamp for the circuit `code`
  renderObjective(zoneMgr, code) {
    this.zoneMgr = zoneMgr || this.zoneMgr;
    const st = zoneMgr.roundStatus(code);
    const seg = (on, glyph, label, done, total) =>
      `<span class="beat${on ? ' on' : ''}${done >= total && total > 0 ? ' ok' : ''}">${glyph} ${label} ${done}/${total}</span>`;
    let html = `<span class="rnd">R${st.round}</span> `;
    if (st.street.total) html += seg(st.beat === 'overhear', '👂', 'Overhear', st.street.done, st.street.total) + ' · ';
    html += seg(st.beat === 'talk', '💬', 'Talk', st.warm.done, st.warm.total) + ' · ';
    html += seg(st.beat === 'drill', '❗', 'Drill', st.done, st.total);
    html += st.stamped ? ' · <span class="beat ok">🎫 Stamped</span>' : ' → <span class="beat">🎫 Stamp</span>';
    this.setObjective(html);
    return st;
  }

  toast(text, opts) { this.toasts.push(text, opts); }

  // ---------- XP, rank, ceremonies ----------
  // XP renders as a counter tween on the chip plus a rising "+N" label — never
  // a toast that the next message overwrites. A rank crossing queues a ceremony.
  addXP(n) {
    if (!n) return;
    const before = rankFor(this.xp).index;
    this.xp = progress.addXP(n);
    const gain = document.createElement('div');
    gain.className = 'xp-gain';
    gain.textContent = `+${n}`;
    this.$('xp').appendChild(gain);
    setTimeout(() => gain.remove(), 1400);
    this.renderXP();
    const after = rankFor(this.xp);
    if (after.index > before && after.index > (progress.state.rankSeen | 0)) {
      progress.state.rankSeen = after.index;
      progress.save();
      // deferred a tick so a stamp / certificate earned by the same drill
      // takes the stage first and the rank-up follows it in the queue
      setTimeout(() => this.celebrate({ kind: 'rank', rank: after }), 60);
    }
  }
  renderXP(instant = false) {
    const el = this.$('xp');
    const label = el.querySelector('.xp-label') || (() => { const s = document.createElement('span'); s.className = 'xp-label'; el.prepend(s); return s; })();
    const target = this.xp;
    if (instant || Math.abs(target - this._shownXP) < 1) {
      this._shownXP = target;
      label.textContent = `✦ ${target} XP`;
    } else {
      cancelAnimationFrame(this._xpAnim);
      const from = this._shownXP, t0 = performance.now(), dur = 650;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        this._shownXP = Math.round(from + (target - from) * e);
        label.textContent = `✦ ${this._shownXP} XP`;
        el.classList.toggle('bump', k < 1);
        if (k < 1) this._xpAnim = requestAnimationFrame(tick);
      };
      this._xpAnim = requestAnimationFrame(tick);
    }
    renderRankChip(this.$('rank'), target);
  }

  // Full-screen reward card: district stamp, line certificate, city completion,
  // rank-up. Cards queue so a stamp and a rank-up on the same drill both play.
  celebrate(c) {
    this._ceremonies.push(c);
    if (!this.overlay.isOpen('ceremony')) this._nextCeremony();
  }
  _nextCeremony() {
    const c = this._ceremonies.shift();
    if (!c) return;
    const el = this.$('ceremony');
    const card = el.querySelector('.card');
    card.className = `card ${c.kind}`;
    const line = c.lineKey ? LINE_NAMES[c.lineKey] : '';
    const inner = {
      stamp: () => `<div class="stamp-art"><div class="stamp-ring" style="border-color:${lineHex(c.lineKey)}"><span>🎫</span></div></div>
        <div class="eyebrow">METRO PASS · STAMPED</div><h3>${esc(c.zoneName)}</h3>
        <p>${esc(c.dialect || '')}${line ? ' · ' + line : ''}</p><div class="xp">+${c.xp} XP</div>
        <p class="sub">${c.stamps}/${c.stampsTotal} districts stamped</p>`,
      certificate: () => `<div class="cert-art">📜</div><div class="eyebrow">LINE CERTIFICATE</div><h3>${line}</h3>
        <p>Every station on the line is stamped. The line is yours.</p><div class="xp">+${c.xp} XP</div>`,
      city: () => `<div class="cert-art">🏙️</div><div class="eyebrow">CITY COMPLETE</div><h3>English Metropolis</h3>
        <p>All 44 districts stamped. You know how the whole world speaks English.</p><div class="xp">+${c.xp} XP</div>`,
      rank: () => `<div class="rank-art">${c.rank.glyph}</div><div class="eyebrow">RANK UP</div><h3>${c.rank.name}</h3>
        <p>${c.rank.next ? `${c.rank.next - c.rank.floor} XP to ${c.rank.nextName}` : 'The top of the ladder.'}</p>`,
    }[c.kind]();
    card.innerHTML = inner + `<div class="tap">${this.isTouch() ? 'tap' : 'click or Esc'} to continue</div>`;
    this.audio?.fanfare?.();
    this.overlay.open('ceremony');
    clearTimeout(this._ceremonyTimer);
    this._ceremonyTimer = setTimeout(() => { if (this.overlay.isOpen('ceremony')) this.overlay.close('ceremony'); }, c.kind === 'rank' ? 3200 : 3800);
  }

  // ---------- dialog ----------
  _openDialogPanel() {
    const d = this.$('dialog');
    this.overlay.open('dialog');
    d.style.display = 'block';
    this.setPrompt(null);
    this.setTalkReady(false);
    return d;
  }
  _dialogHidden() {
    this.$('dialog').style.display = 'none';
    this.voice?.stop();
    this._session = null;
    this.onDialogClose?.();
  }
  closeDialog() { this.overlay.close('dialog'); }

  openDialog(npc, hooks = {}) {
    const d = this._openDialogPanel();
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

    // main task: the grammar drill (completes this local for the round).
    // The label is the level the bank can actually serve, never a C1 it cannot.
    if (npc.grammar) {
      const m = masteryFor(npc.grammar.concept);
      const served = LEVELS[Math.min(LEVELS.indexOf(npc.grammar.level), LEVELS.indexOf(maxLevelFor(npc.grammar.concept)))];
      const drillBtn = document.createElement('button');
      drillBtn.className = 'primary';
      drillBtn.innerHTML = `❗ <b>${esc(npc.grammar.conceptName)}</b> — ${DRILL_N} questions · ${served}` +
        (m.recentN ? ` <span class="dim">(${m.recentPct}% first-try)</span>` : '') +
        (m.dueCount ? ` <span class="rev">↻ ${Math.min(2, m.dueCount)} review</span>` : '') +
        ` <span class="dim">→ helps this local</span>`;
      drillBtn.addEventListener('click', () => this.openDrill(npc, hooks));
      opts.append(drillBtn);
    }

    // warm-up: single dialect question, once per round, doesn't complete the
    // local but is the district's "Talk" beat. First click decides.
    if (npc.exercise && hooks.warmupAvailable !== false) {
      const start = document.createElement('button');
      start.textContent = `📖 Warm-up: ${npc.exercise.title}  (+${npc.exercise.reward} XP)`;
      start.addEventListener('click', () => {
        const ex = npc.exercise;
        const sh = shuffledOptions(ex);
        d.querySelector('.text').textContent = ex.prompt;
        opts.innerHTML = '';
        let answered = false;
        const buttons = sh.options.map((opt, i) => {
          const ob = document.createElement('button');
          ob.textContent = opt;
          ob.addEventListener('click', () => {
            if (answered) return;
            answered = true;
            const right = i === sh.answerIndex;
            const claimed = hooks.claimWarmup?.() !== false;
            buttons.forEach((b) => { b.disabled = true; });
            buttons[sh.answerIndex].classList.add(right ? 'right' : 'reveal');
            // The explanation (and the Polish gloss when the item has one)
            // shows on BOTH outcomes, like the street dialog: the dialect
            // point is the lesson, the click only checks it. Content-11/24.
            const note = document.createElement('div');
            note.className = 'explain';
            note.innerHTML = (right ? `✓ <b>${esc(sh.options[sh.answerIndex])}</b>.` : `💡 The answer was <b>${esc(sh.options[sh.answerIndex])}</b>.`) +
              (ex.explain ? ` ${esc(ex.explain)}` : '') +
              (ex.pl ? `<br><span class="pl">🇵🇱 ${esc(ex.pl)}</span>` : '') +
              (right ? '' : ` <i>No XP this time — the drill is still waiting.</i>`);
            d.querySelector('.text').appendChild(note);
            for (const b of buttons) b.remove();
            const ok = document.createElement('button');
            if (right) {
              this.audio?.correct();
              if (claimed) this.addXP(ex.reward);
              hooks.onWarmup?.(npc, true);
              ok.textContent = claimed ? `✦ +${ex.reward} XP — now take their drill` : '✦ Now take their drill';
              ok.addEventListener('click', () => {
                this.closeDialog();
                this.toast('📖 Warm-up done — now take their drill to finish helping them!');
              });
            } else {
              ob.classList.add('wrong');
              this.audio?.wrong();
              hooks.onWrong?.(npc);
              hooks.onWarmup?.(npc, false);
              ok.textContent = 'Got it';
              ok.addEventListener('click', () => this.closeDialog());
            }
            opts.appendChild(ok);
          });
          opts.appendChild(ob);
          return ob;
        });
      });
      opts.append(start);
    }

    const later = document.createElement('button');
    later.textContent = 'Maybe later';
    later.addEventListener('click', () => this.closeDialog());
    opts.append(later);
  }

  // A passer-by's one-question exercise: the district's "Overhear" beat.
  // Lighter than a drill, one click decides, the explanation shows either way.
  openStreetDialog(speaker, hooks = {}) {
    const d = this._openDialogPanel();
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
    const sh = shuffledOptions(ex);
    text.innerHTML = `<span class="quote">“${esc(speaker.line)}”</span><br><br>${esc(ex.prompt)}`;
    let answered = false;
    const buttons = sh.options.map((opt, i) => {
      const b = document.createElement('button');
      b.textContent = opt;
      b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const right = i === sh.answerIndex;
        buttons.forEach((x) => { x.disabled = true; });
        buttons[sh.answerIndex].classList.add(right ? 'right' : 'reveal');
        if (!right) b.classList.add('wrong');
        if (right) this.audio?.correct(); else this.audio?.wrong();
        hooks.onAnswer?.(right);
        text.innerHTML = `<span class="quote">“${esc(speaker.line)}”</span><br><br>` +
          `<b>${right ? '✓ ' : ''}${esc(ex.explain || (right ? 'Spot on.' : `The answer was “${sh.options[sh.answerIndex]}”.`))}</b>`;
        for (const x of buttons) x.remove();
        const done = document.createElement('button');
        done.textContent = right ? `✦ +${ex.reward || 8} XP — cheers!` : '✦ Noted — cheers anyway';
        done.addEventListener('click', () => this.closeDialog());
        opts.prepend(done);
      });
      opts.appendChild(b);
      return b;
    });
    const later = document.createElement('button');
    later.textContent = 'Maybe later';
    later.addEventListener('click', () => this.closeDialog());
    opts.appendChild(later);
  }

  // ---------- grammar drill (multi-question MCQ session, first click counts) ----------
  openDrill(npc, hooks = {}, { session = null, reviewOnly = false } = {}) {
    const g = npc.grammar;
    session ||= buildSession(g.concept, g.level, DRILL_N, npc.dialectCode);
    const N = session.questions.length;            // bank may run short of DRILL_N
    const PASS = Math.max(1, Math.ceil(N * 0.7));  // 7q → 5 to pass
    this._session = session;                       // debug/testing handle
    const d = this.$('dialog');
    const who = d.querySelector('.who');
    const text = d.querySelector('.text');
    const opts = d.querySelector('.opts');
    const results = [];                            // first-try outcome per question
    let qi = 0, correct = 0;

    const dots = () => results.map((r) => `<span class="dot ${r ? 'ok' : 'miss'}">●</span>`).join('') +
      '<span class="dot">○</span>'.repeat(Math.max(0, N - results.length));

    const finish = () => {
      const passed = correct >= PASS;
      const fam = npc.barkFam || 'isles';
      this.voice?.speak(`bark_${fam}_${correct === N ? 'perfect' : passed ? 'pass' : 'fail'}`,
        passed ? 'Nice work. Your English is levelling up.' : 'Good effort. Practice makes perfect.',
        { profile: npc.accentProfile });
      who.innerHTML = `${esc(npc.name)} · <span class="dim">${esc(session.conceptName)}</span> <span class="dots">${dots()}</span>`;
      const reward = reviewOnly ? 4 * correct : XP_PER_FIRST_TRY * correct + (passed ? XP_PASS_BONUS : 0);
      text.innerHTML = `<b>${esc(session.conceptName)}</b><br>First-try score <b>${correct}/${N}</b>. ` +
        (reviewOnly ? (passed ? 'Review cleared — those items move up a box.' : 'Keep at it — missed items come back sooner.')
          : passed ? (correct === N ? 'Perfect! ' : 'Sharp! ') + 'You\'ve helped this local for the round. ✓'
            : `You need <b>${PASS}/${N}</b> on the first try to help this local — have another go with a fresh set.`);
      opts.innerHTML = '';
      progress.state.stats.drills++;
      if (reward) this.addXP(reward);
      if (passed && !reviewOnly) {
        this.audio?.fanfare?.();
        if (!npc.done) { npc.done = true; npc.refreshMarker?.(); hooks.onCorrect?.(npc); }
      } else if (!passed) {
        this.audio?.wrong?.();
        hooks.onFail?.(npc);
      }
      const done = document.createElement('button');
      done.className = passed ? 'primary' : '';
      done.textContent = `✦ +${reward} XP — ${passed ? 'done' : 'close'}`;
      done.addEventListener('click', () => this.closeDialog());
      opts.appendChild(done);
      if (!passed && !reviewOnly) {
        const retry = document.createElement('button');
        retry.className = 'primary';
        retry.textContent = '↻ Try a fresh set';
        retry.addEventListener('click', () => this.openDrill(npc, hooks));
        opts.appendChild(retry);
      }
    };

    const showQuestion = () => {
      const q = session.questions[qi];
      const sh = shuffledOptions(q);
      who.innerHTML = `${esc(npc.name)} · <span class="dim">${esc(q.review && q.concept !== session.concept ? conceptName(q.concept) : session.conceptName)}</span>` +
        (q.review ? ' <span class="rev">↻ review</span>' : '') +
        (q.fromConcept ? ` <span class="dim">· from ${esc(conceptName(q.fromConcept))}</span>` : '') +
        `<span class="dots">${qi + 1}/${N} ${dots()}</span>`;
      text.innerHTML = esc(q.prompt);
      opts.innerHTML = '';
      let answered = false;
      const optionButtons = sh.options.map((opt, i) => {
        const ob = document.createElement('button');
        ob.textContent = opt;
        ob.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const isRight = i === sh.answerIndex;
          results.push(isRight);
          recordAnswer(q.concept, q.id, isRight, { firstTry: true, review: !!q.review });
          optionButtons.forEach((b) => { b.disabled = true; });
          mic?.remove();
          if (isRight) {
            ob.classList.add('right');
            correct++;
            this.audio?.correct();
            setTimeout(() => { if (this._session !== session) return; qi++; qi >= N ? finish() : showQuestion(); }, 750);
          } else {
            ob.classList.add('wrong');
            optionButtons[sh.answerIndex].classList.add('reveal');
            this.audio?.wrong();
            hooks.onWrong?.(npc);
            // reveal the teaching explanation; the question is lost, read on
            const ex = document.createElement('div');
            ex.className = 'explain';
            ex.innerHTML = `💡 ${esc(q.explain)}` +
              (q.localValid ? `<br><i>(Heads up: locals here might actually say the other one!)</i>` : '') +
              `<br><i>↻ This one comes back in a later drill.</i>`;
            text.appendChild(ex);
            const next = document.createElement('button');
            next.className = 'primary';
            next.textContent = qi + 1 >= N ? 'See my score ▸' : 'Next ▸';
            next.addEventListener('click', () => { if (this._session !== session) return; qi++; qi >= N ? finish() : showQuestion(); });
            opts.appendChild(next);
          }
        });
        opts.appendChild(ob);
        return ob;
      });

      // speak the answer — only when this browser can actually hear (no mic
      // button that ends in "didn't catch that" on a browser without a recogniser)
      let mic = null;
      if (this.voice?.canListen?.()) {
        mic = document.createElement('button');
        mic.className = 'mic';
        mic.innerHTML = '🎤 <i>say the correct sentence</i>';
        mic.addEventListener('click', async () => {
          if (answered) return;
          const res = await this.voice.listen((state) => {
            mic.innerHTML = state === 'listening' ? '🎤 <b>listening…</b> (8 s)'
              : state === 'thinking' ? '🎤 <i>thinking…</i>'
                : '🎤 <i>say the correct sentence</i>';
          }, npc.accentProfile);
          if (answered) return;
          if (!res.text) {
            this.toast(res.reason === 'denied' ? '🎤 Microphone access was refused — tap an answer instead'
              : res.reason === 'unavailable' ? '🎤 Voice answers are not available in this browser'
                : '🎤 Didn\'t catch that — try again or tap an answer');
            return;
          }
          const idx = this.voice.matchOption(res.text, sh.options);
          if (idx >= 0) { this.toast(`🎤 “${res.text}”`); optionButtons[idx].click(); }
          else this.toast(`🎤 Heard “${res.text}” — no match, tap or try again`);
        });
        opts.appendChild(mic);
      }
    };

    // Card 0: the concept hint as a one-line pre-teach, plus what this set is
    // made of (review items, a top-up from a neighbouring concept, the level).
    who.innerHTML = `${esc(npc.name)} · <span class="dim">${esc(session.conceptName)}</span>`;
    text.innerHTML = `<b>${esc(session.conceptName)}</b> · ${N} questions · ${esc(session.servedLevel)}` +
      (session.hint ? `<div class="explain">💡 ${esc(session.hint)}</div>` : '') +
      `<div class="setnote">Your <b>first answer</b> counts — pass at ${PASS}/${N}.` +
      (session.reviewCount ? ` <span class="rev">↻ ${session.reviewCount} review item${session.reviewCount > 1 ? 's' : ''}</span> from earlier misses.` : '') +
      (session.toppedUp ? ` Topped up with <b>${esc(session.toppedUpName)}</b> — this concept's bank is short.` : '') +
      `</div>`;
    opts.innerHTML = '';
    const start = document.createElement('button');
    start.className = 'primary';
    start.textContent = 'Start ▸';
    start.addEventListener('click', showQuestion);
    opts.appendChild(start);
    const later = document.createElement('button');
    later.textContent = 'Maybe later';
    later.addEventListener('click', () => this.closeDialog());
    opts.appendChild(later);
  }

  // Review drill from the journal: only due items, anywhere in the city.
  startReview() {
    const due = progress.dueIds();
    if (!due.length) { this.toast('↻ Nothing due for review right now'); return; }
    const firstConcept = due[0].concept;
    const session = buildSession(firstConcept, 'A2', Math.min(5, due.length), null, { review: true });
    session.questions = session.questions.filter((q) => q.review);
    if (!session.questions.length) { this.toast('↻ Nothing due for review right now'); return; }
    session.conceptName = 'Metro Pass review';
    this.overlay.close('journal');
    this._openDialogPanel();
    this.openDrill({ name: 'Metro Pass', role: 'review', grammar: { concept: firstConcept, level: 'A2', conceptName: 'Review' }, barkFam: 'isles' }, {}, { session, reviewOnly: true });
  }

  // The frame counter is a developer readout, not player-facing. Hidden unless ?debug.
  setFPS(fps, scale) {
    const el = this.$('fps');
    if (!UI.debugHUD) { el.style.display = 'none'; return; }
    el.textContent = `${fps | 0} fps · ${(scale * 100) | 0}%`
      + (this.qualityTier ? ` · ${this.qualityTier}${this.qualityManual ? '*' : ''}` : '');
  }
  setQualityTier(tier, manual) {
    this.qualityTier = tier;
    this.qualityManual = !!manual;
  }

  // ---------- city map (M) ----------
  // Desktop: hover names a station, click rides. Touch: first tap selects and
  // labels the station, second tap (or the Ride button) rides. Visited and
  // stamped stations always carry their label. The map stays open when a ride
  // is refused (the player is not on a platform) — the refusal is a toast.
  showCityMap(zoneMgr, playerPos, onPick) {
    this.zoneMgr = zoneMgr;
    if (this.mapOpen) { this.overlay.close('citymap'); return; }
    const canvas = this.$('citymap-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, C = W / 2, SCALE = W / 920;   // world ±430 → canvas
    const px = (x) => C + x * SCALE, pz = (z) => C + z * SCALE;
    const touch = this.isTouch();
    const caption = this.$('citymap').querySelector('.caption');
    caption.textContent = touch ? 'Tap a station to name it · tap again to ride (from a platform)' : 'Hover a station · click to ride the metro from a platform';
    const fog = this.minimap?.fog;
    let selected = null;
    const justStamped = this._justStamped; this._justStamped = null;
    let animT0 = performance.now();

    // The two districts at one stop share a station dot, so their labels sit
    // on their own side of the line (side -1 left, +1 right) at dot height,
    // instead of stacking above it; stops are 42 m ≈ 24 px apart so a 20 px
    // label per side never collides with its neighbour.
    const label = (z, strong) => {
      const hx = px(z.stopPos.x), hy = pz(z.stopPos.y);
      ctx.font = `${strong ? '700 15px' : '600 13px'} 'Space Grotesk', sans-serif`;
      const name = z.data.zoneName;
      const wpx = ctx.measureText(name).width + 16;
      const h = strong ? 26 : 20;
      const right = z.side > 0;
      const bx = Math.min(Math.max(right ? hx + 10 : hx - 10 - wpx, 4), W - wpx - 4);
      const by = Math.min(Math.max(hy - h / 2, 4), W - h - (strong ? 24 : 4));
      ctx.fillStyle = strong ? 'rgba(42,30,18,0.94)' : 'rgba(42,30,18,0.78)';
      ctx.fillRect(bx, by, wpx, h);
      ctx.fillStyle = '#f6ead2';
      ctx.fillText(name, bx + 8, by + (strong ? 18 : 14));
      if (strong) {
        ctx.font = "13px 'Space Grotesk', sans-serif";
        const sub = `${z.data.dialect} · ${LINE_NAMES[z.lineKey]}`;
        const w2 = ctx.measureText(sub).width + 16;
        const bx2 = Math.min(Math.max(right ? hx + 10 : hx - 10 - w2, 4), W - w2 - 4);
        ctx.fillStyle = 'rgba(42,30,18,0.9)';
        ctx.fillRect(bx2, by + h, w2, 20);
        ctx.fillStyle = '#f3dca6';
        ctx.fillText(sub, bx2 + 8, by + h + 14);
      }
    };

    const draw = (hover) => {
      // parchment ground — an in-world prop, so the paper look is allowed here
      ctx.fillStyle = '#efe0c0';
      ctx.fillRect(0, 0, W, W);
      for (const z of zoneMgr.zones) {
        ctx.fillStyle = z.data.palette.accent + '55';
        ctx.beginPath();
        ctx.arc(px(z.center.x), pz(z.center.y), 26 * SCALE * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // metro lines in the one line palette (zones.js LINES); a certified line is solid, others dashed
      for (const [key, L] of Object.entries(LINES)) {
        ctx.strokeStyle = lineHex(key);
        ctx.lineWidth = progress.state.certificates[key] ? 6 : 4;
        ctx.setLineDash(progress.state.certificates[key] ? [] : [10, 6]);
        ctx.beginPath();
        ctx.moveTo(px(0), pz(0));
        ctx.lineTo(px(Math.cos(L.angle) * 420), pz(-Math.sin(L.angle) * 420));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const z of zoneMgr.zones) {
        const stamped = !!zoneMgr.progressFor(z.data.code).stamped;
        const big = z === hover || z === selected;
        ctx.beginPath();
        ctx.arc(px(z.stopPos.x), pz(z.stopPos.y), big ? 7.5 : 5, 0, Math.PI * 2);
        ctx.fillStyle = stamped ? lineHex(z.lineKey) : '#f6ead2';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#4a3826';
        ctx.stroke();
        if (stamped) { ctx.fillStyle = '#1b1230'; ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓', px(z.stopPos.x), pz(z.stopPos.y) + 3.4); ctx.textAlign = 'left'; }
      }
      // stamp animation: the station just stamped pulses for a couple of seconds
      if (justStamped) {
        const z = zoneMgr.zones.find((zz) => zz.data.code === justStamped);
        if (z) {
          const t = (performance.now() - animT0) / 1000;
          const k = (t * 1.2) % 1;
          ctx.beginPath(); ctx.arc(px(z.stopPos.x), pz(z.stopPos.y), 8 + k * 22, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(217,70,239,${(1 - k) * 0.9})`; ctx.lineWidth = 3; ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(C, C, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#6b4fa0'; ctx.fill();
      ctx.strokeStyle = '#f6ead2'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(px(playerPos.x), pz(playerPos.z), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#c9302c'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      // always-on labels for visited / stamped stations, strong label for the hovered or selected one
      for (const z of zoneMgr.zones) {
        if (z === hover || z === selected) continue;
        const seen = !!zoneMgr.progressFor(z.data.code).stamped || (fog && fog.visited(z.stopPos.x, z.stopPos.y));
        if (seen) label(z, false);
      }
      if (hover || selected) label(hover || selected, true);
    };
    draw(null);
    this._mapAnim = !!justStamped;
    const loop = () => { if (!this._mapAnim || !this.mapOpen) return; draw(selected); requestAnimationFrame(loop); };
    if (this._mapAnim) { requestAnimationFrame(loop); setTimeout(() => { this._mapAnim = false; if (this.mapOpen) draw(selected); }, 2600); }

    const toWorld = (e) => {
      const r = canvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (W / r.width);
      const cy = (e.clientY - r.top) * (W / r.height);
      return { x: (cx - C) / SCALE, z: (cy - C) / SCALE, cssScale: W / r.width };
    };
    const nearest = (e) => {
      const w = toWorld(e);
      // pick radius is in CSS px (22 on touch, 18 with a mouse) so a phone tap
      // does not need pixel precision
      let best = null, bd = ((touch ? 22 : 18) * w.cssScale) / SCALE;
      for (const z of zoneMgr.zones) {
        const d = Math.hypot(w.x - z.stopPos.x, w.z - z.stopPos.y);
        if (d < bd) { bd = d; best = z; }
      }
      return best;
    };
    const ride = (z) => {
      this._travelling = false;
      onPick(z);
      if (this._travelling) this.overlay.close('citymap');   // fadeTravel began → the ride is happening
    };
    canvas.onmousemove = touch ? null : (e) => draw(nearest(e));
    canvas.onclick = (e) => {
      const z = nearest(e);
      if (!z) { if (touch) { selected = null; draw(null); } return; }
      if (!touch) { ride(z); return; }
      if (selected === z) ride(z);
      else { selected = z; draw(null); }
    };
    this.overlay.open('citymap');
  }

  // ---------- metro map (fast travel) ----------
  showMetro(zoneMgr, onPick) {
    this.zoneMgr = zoneMgr;
    if (this.metroOpen) { this.overlay.close('metro'); return; }
    const body = this.$('metro').querySelector('.rows');
    body.innerHTML = '';
    const byLine = { isles: [], liberty: [], sunward: [] };
    for (const z of zoneMgr.zones) byLine[z.lineKey].push(z);
    const here = zoneMgr.current?.data.code || 'hub';
    const hub = document.createElement('div');
    hub.className = 'mrow' + (here === 'hub' ? ' here' : '');
    hub.innerHTML = `<span>🚉</span> Metropolis Central <em>${here === 'hub' ? 'you are here' : 'hub'}</em>`;
    hub.addEventListener('click', () => { this.overlay.close('metro'); onPick(null); });
    body.appendChild(hub);
    for (const [k, list] of Object.entries(byLine)) {
      const h = document.createElement('div');
      h.className = 'jline';
      const stamped = list.filter((z) => zoneMgr.progressFor(z.data.code).stamped).length;
      h.innerHTML = `${lineDot(k)} ${LINE_NAMES[k].toUpperCase()} <em>${stamped}/${list.length} stamped${progress.state.certificates[k] ? ' · 📜' : ''}</em>`;
      body.appendChild(h);
      for (const z of list) {
        const row = document.createElement('div');
        const p = zoneMgr.progressFor(z.data.code);
        row.className = 'mrow' + (here === z.data.code ? ' here' : '');
        row.innerHTML = `<span>${p.stamped ? '🎫' : Object.keys(p.d).length || Object.keys(p.street || {}).length ? '◔' : '·'}</span> ${esc(z.data.zoneName)}` +
          `<em>${here === z.data.code ? 'you are here · ' : ''}${esc(z.data.dialect)}</em>`;
        row.addEventListener('click', () => { this.overlay.close('metro'); onPick(z); });
        body.appendChild(row);
      }
    }
    this.overlay.open('metro');
  }

  fadeTravel(action) {
    this._travelling = true;
    const f = this.$('fade');
    f.classList.add('on');
    setTimeout(() => { action(); setTimeout(() => f.classList.remove('on'), 120); }, 480);
  }

  // ---------- journal: Mission · Passport · Mastery · Review ----------
  toggleJournal(zoneMgr) {
    this.zoneMgr = zoneMgr || this.zoneMgr;
    if (this.journalOpen) { this.overlay.close('journal'); return; }
    if (!this.zoneMgr) return;
    this._renderJournal();
    this.overlay.open('journal');
  }

  _renderJournal() {
    const zoneMgr = this.zoneMgr;
    const body = this.$('journal').querySelector('.rows');
    const tabs = this.$('journal').querySelector('.jtabs');
    const due = progress.dueIds().length;
    const TABS = [['mission', '🎯 Mission'], ['passport', '🎫 Passport'], ['mastery', '📚 Mastery'], ['review', `↻ Review${due ? ` (${due})` : ''}`]];
    tabs.innerHTML = TABS.map(([k, l]) => `<button class="jtab${this._journalTab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('');
    const r = rankFor(this.xp);
    let html = `<div class="jxp">${r.glyph} <b>${r.name}</b> · ✦ ${this.xp} XP` +
      (r.next ? ` <em>${r.next - this.xp} XP to ${r.nextName}</em>` : ' <em>top rank</em>') +
      (progress.streak > 1 ? ` <em>🔥 ${progress.streak}-day streak</em>` : '') + `</div>`;
    const tab = this._journalTab;
    if (tab === 'mission') html += this._journalMission(zoneMgr);
    else if (tab === 'passport') html += this._journalPassport(zoneMgr);
    else if (tab === 'mastery') html += this._journalMastery();
    else html += this._journalReview();
    body.innerHTML = html;
  }

  _journalMission(zoneMgr) {
    const here = zoneMgr.current;
    const hereCode = here ? here.data.code : 'hub';
    const st = zoneMgr.roundStatus(hereCode);
    const beat = { overhear: '👂 Overhear the street locals (gold dots)', talk: '💬 Talk to the quest locals (warm-ups)', drill: '❗ Pass the quest locals\' drills', stamped: '🎫 Stamped — ride on!' }[st.beat];
    let html = `<div class="jline">🎯 YOUR MISSION</div>`;
    html += `<div class="jrow"><span>📍</span> <b>${esc(zoneMgr.circuitName(hereCode))}</b>${here ? ` · ${esc(here.data.dialect)}` : ''}<em>Round ${st.round}</em></div>`;
    html += `<div class="beats">` +
      (st.street.total ? `<div class="jrow"><span>👂</span> Overhear<em>${st.street.done}/${st.street.total} overheard</em></div>` : '') +
      `<div class="jrow"><span>💬</span> Talk (warm-ups)<em>${st.warm.done}/${st.warm.total}</em></div>` +
      `<div class="jrow"><span>❗</span> Drills passed<em>${st.done}/${st.total} locals helped</em></div>` +
      `<div class="jrow"><span>🎫</span> Stamp<em>${st.stamped ? 'stamped ✓' : 'close the round'}</em></div></div>`;
    html += `<div class="jnote"><b>Next:</b> ${beat}<br>${SYSTEM_SENTENCE}</div>`;
    const stamped = zoneMgr.zones.filter((z) => zoneMgr.progressFor(z.data.code).stamped).length;
    html += `<div class="jline">🏙 CITY GOAL</div>`;
    html += `<div class="jrow"><span>${stamped >= zoneMgr.zones.length ? '✅' : '·'}</span> Stamp every district<em>${stamped}/${zoneMgr.zones.length} stamped</em></div>`;
    const hubSt = zoneMgr.roundStatus('hub');
    html += `<div class="jrow"><span>${hubSt.stamped ? '🎫' : '·'}</span> Metropolis Central circuit<em>Round ${hubSt.round} · ${hubSt.done}/${hubSt.total}</em></div>`;
    for (const k of Object.keys(LINES)) {
      const list = zoneMgr.zones.filter((z) => z.lineKey === k);
      const n = list.filter((z) => zoneMgr.progressFor(z.data.code).stamped).length;
      html += `<div class="jline">${lineDot(k)} ${LINE_NAMES[k].toUpperCase()} <em>${n}/${list.length} stamped${progress.state.certificates[k] ? ' · 📜 certified' : ''}</em></div>`;
      for (const z of list) {
        const s = zoneMgr.roundStatus(z.data.code);
        const mark = s.stamped ? '🎫' : s.done > 0 || s.street.done > 0 ? '◔' : '·';
        html += `<div class="jrow"><span>${mark}</span> ${esc(z.data.zoneName)}` +
          `<em>${esc(z.data.dialect)} — R${s.round} · ${s.done}/${s.total}${s.street.total ? ` · 👂 ${s.street.done}/${s.street.total}` : ''}</em></div>`;
      }
    }
    return html;
  }

  _journalPassport(zoneMgr) {
    let html = `<div class="jline">📜 CERTIFICATES</div><div class="certs">`;
    for (const k of Object.keys(LINES)) {
      const list = zoneMgr.zones.filter((z) => z.lineKey === k);
      const n = list.filter((z) => zoneMgr.progressFor(z.data.code).stamped).length;
      const got = !!progress.state.certificates[k];
      html += `<div class="cert${got ? ' got' : ''}" style="--line:${lineHex(k)}"><div class="cert-t">${got ? '📜' : '·'} ${LINE_NAMES[k]}</div>` +
        `<div class="cert-s">${got ? 'Certified ' + new Date(progress.state.certificates[k]).toLocaleDateString() : `${n}/${list.length} stations stamped`}</div></div>`;
    }
    html += `</div>`;
    if (progress.state.cityComplete) html += `<div class="jrow"><span>🏙️</span> <b>City complete</b><em>${new Date(progress.state.cityComplete).toLocaleDateString()}</em></div>`;
    html += `<div class="jline">🎫 STAMPS</div><div class="passport">`;
    const hub = zoneMgr.progressFor('hub');
    html += `<div class="stamp${hub.stamped ? ' got' : ''}" style="--line:#9B63FF"><div class="s-name">Metropolis Central</div><div class="s-sub">${hub.stamped ? 'Round ' + hub.laps : 'hub circuit'}</div></div>`;
    for (const z of zoneMgr.zones) {
      const p = zoneMgr.progressFor(z.data.code);
      html += `<div class="stamp${p.stamped ? ' got' : ''}" style="--line:${lineHex(z.lineKey)}" title="${esc(z.data.dialect)}">` +
        `<div class="s-name">${esc(z.data.zoneName)}</div><div class="s-sub">${p.stamped ? `R${p.laps} · ${new Date(p.stamped).toLocaleDateString()}` : esc(z.data.dialect)}</div></div>`;
    }
    html += `</div>`;
    return html;
  }

  _journalMastery() {
    let html = `<div class="jline">📚 GRAMMAR MASTERY</div>` +
      `<div class="jnote">First-try accuracy over your last ${20} answers per concept. 🥉 60% · 🥈 80% · 🥇 95% (after 15 answers).</div>`;
    for (const c of overallMastery()) {
      const badge = c.badge === 'gold' ? '🥇' : c.badge === 'silver' ? '🥈' : c.badge === 'bronze' ? '🥉' : c.recentN ? '◔' : '·';
      html += `<div class="jrow"><span>${badge}</span> ${esc(c.name)}` +
        `<em>${c.recentN ? `${c.recentPct}% first-try · ${c.recentN} seen` : 'not yet'}${c.dueCount ? ` · ↻ ${c.dueCount} due` : ''} · ${c.doneUnique}/${c.total}</em></div>`;
    }
    const s = progress.state.stats;
    html += `<div class="jline">📈 TOTALS</div><div class="jrow"><span>·</span> Drills taken<em>${s.drills}</em></div>` +
      `<div class="jrow"><span>·</span> First-try answers<em>${s.firstTry}/${s.answered}${s.answered ? ` · ${Math.round(s.firstTry / s.answered * 100)}%` : ''}</em></div>`;
    return html;
  }

  _journalReview() {
    const due = progress.dueIds();
    const total = progress.reviewQueueSize();
    let html = `<div class="jline">↻ REVIEW QUEUE</div>` +
      `<div class="jnote">Questions you miss come back: after 10 minutes, then a day, four days, a fortnight. Up to two due items join every drill, labelled ↻ review. ${total} item${total === 1 ? '' : 's'} in the queue, ${due.length} due now.</div>`;
    if (due.length) html += `<button class="jbtn" data-review="1">↻ Review ${Math.min(5, due.length)} due item${due.length > 1 ? 's' : ''} now</button>`;
    const byConcept = {};
    for (const d of due) byConcept[d.concept] = (byConcept[d.concept] || 0) + 1;
    for (const [cid, n] of Object.entries(byConcept)) html += `<div class="jrow"><span>↻</span> ${esc(conceptName(cid))}<em>${n} due</em></div>`;
    if (!due.length && total) {
      const soon = Object.values(progress.state.grammar).flatMap((c) => Object.values(c.wrong || {})).sort((a, b) => a.due - b.due)[0];
      if (soon) html += `<div class="jrow"><span>⏳</span> Next item due<em>${new Date(soon.due).toLocaleString()}</em></div>`;
    }
    return html;
  }

  // journal hook for main: a district was just stamped → the map pulses it
  noteStamp(code) { this._justStamped = code; }
}
