// NPC voices + spoken answers.
// TTS: baked Kokoro-82M lines (public/assets/voice/<id>.wav) with a browser
//      speechSynthesis fallback while files aren't generated yet.
// STT: local faster-whisper server (the Hercules stack, http://localhost:5197)
//      with a Web Speech API fallback.
const STT_URL = 'http://localhost:5197/stt';

export class VoiceManager {
  constructor() {
    this.cache = new Map();      // id -> Audio | null (null = known missing)
    this.current = null;
    this.sttAvailable = null;    // unknown until first probe
    this.listening = false;
    this.voices = window.speechSynthesis?.getVoices?.() || [];
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
      this.voices = window.speechSynthesis.getVoices();
    });
    // the whisper server only exists on a dev machine — don't probe (and get
    // mixed-content noise) from a deployed https origin
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!local) this.sttAvailable = false;
  }

  stop() {
    if (this.current) { this.current.pause(); this.current = null; }
    window.speechSynthesis?.cancel();
  }

  // Can this browser take a spoken answer at all? The mic button is only
  // offered when the answer is yes; Firefox and Safari have no Web Speech
  // recogniser and prod has no whisper endpoint, so "didn't catch that" there
  // was a lie.
  canListen() {
    if (this.sttAvailable) return true;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition) && !!navigator.mediaDevices;
  }

  // Play a baked Kokoro line; fall back to browser TTS with the given text.
  speak(id, fallbackText, { volume = 0.9, profile = null } = {}) {
    this.stop();
    if (id && this.cache.get(id) !== null) {
      let a = this.cache.get(id);
      if (!a) {
        a = new Audio(`public/assets/voice/${id}.ogg`);
        a.addEventListener('error', () => {
          this.cache.set(id, null);                 // missing → remember + fallback
          this.speakSynth(fallbackText, profile);
        }, { once: true });
        this.cache.set(id, a);
      }
      a.volume = volume;
      a.currentTime = 0;
      const p = a.play();
      p?.catch(() => this.speakSynth(fallbackText, profile));
      this.current = a;
      return;
    }
    this.speakSynth(fallbackText, profile);
  }

  speakSynth(text, profile = null) {
    if (!text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = profile?.lang || 'en-GB';
    u.rate = profile?.rate || 1.02;
    u.pitch = profile?.pitch || 1.0;
    u.volume = 0.85;
    const voices = this.voices.length ? this.voices : speechSynthesis.getVoices();
    const hints = profile?.voiceHints || [];
    const hinted = voices.find((voice) => hints.some((hint) => voice.name.toLowerCase().includes(hint.toLowerCase())));
    const exactLocale = voices.find((voice) => voice.lang.toLowerCase() === u.lang.toLowerCase());
    const language = u.lang.split('-')[0].toLowerCase();
    u.voice = hinted || exactLocale || voices.find((voice) => voice.lang.toLowerCase().startsWith(language)) || null;
    speechSynthesis.speak(u);
  }

  // Take one spoken answer. Resolves to { text, reason } where reason is
  // 'ok' | 'unavailable' (no recogniser in this browser) | 'denied' (mic
  // permission refused) | 'silent' (nothing recognised) | 'timeout' (8 s).
  // Never hangs on "listening…": every engine is raced against the timeout.
  async listen(onState, profile = null) {
    if (this.listening) return { text: '', reason: 'busy' };
    this.listening = true;
    const TIMEOUT_MS = 8000;
    let timer = null;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ text: '', reason: 'timeout' }), TIMEOUT_MS); });
    const wrap = async (fn) => {
      try { const text = await fn(); return { text: (text || '').trim(), reason: text ? 'ok' : 'silent' }; }
      catch (e) {
        const name = String(e?.name || e || '');
        if (/not-allowed|NotAllowedError|service-not-allowed|PermissionDenied/i.test(name)) return { text: '', reason: 'denied' };
        if (/no speech recognition|NotSupported/i.test(name)) return { text: '', reason: 'unavailable' };
        console.warn('[voice] listen failed:', e);
        return { text: '', reason: 'silent' };
      }
    };
    try {
      if (this.sttAvailable === null) await this.probeWhisper();
      if (!this.canListen()) return { text: '', reason: 'unavailable' };
      const engine = this.sttAvailable ? () => this.listenWhisper(onState) : () => this.listenWebSpeech(onState, profile);
      const res = await Promise.race([wrap(engine), timeout]);
      if (res.reason === 'timeout') this._rec?.abort?.();
      return res;
    } finally {
      clearTimeout(timer);
      this.listening = false;
      onState?.('idle');
    }
  }

  async probeWhisper() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 700);
    try {
      const response = await fetch('http://localhost:5197/', {
        method: 'GET',
        signal: controller.signal,
      });
      this.sttAvailable = response.ok;
    } catch {
      this.sttAvailable = false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listenWhisper(onState) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    onState?.('listening');
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    await new Promise((r) => setTimeout(r, 3500));
    rec.stop();
    await new Promise((r) => { rec.onstop = r; });
    stream.getTracks().forEach((t) => t.stop());
    onState?.('thinking');
    const blob = new Blob(chunks, { type: rec.mimeType });
    const res = await fetch(STT_URL, { method: 'POST', body: blob });
    const j = await res.json();
    return (j.text || '').trim();
  }

  listenWebSpeech(onState, profile = null) {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return reject(new Error('no speech recognition'));
      const r = new SR();
      this._rec = r;
      r.lang = profile?.lang || 'en-US';
      r.interimResults = false;
      onState?.('listening');
      r.onresult = (e) => resolve(e.results[0][0].transcript.trim());
      r.onerror = (e) => reject(e.error);
      r.onend = () => resolve('');
      r.start();
    });
  }

  // Match spoken text to one of the MCQ options; -1 if no confident match.
  matchOption(text, options) {
    const norm = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();   // apostrophes dropped: recognisers rarely emit them
    const t = norm(text);
    if (!t) return -1;
    // "option one/two/three" or "the first/second/third one"
    const ordinals = [[/(option |number |answer )?(one|1)\b|first/, 0],
      [/(option |number |answer )?(two|2)\b|second/, 1],
      [/(option |number |answer )?(three|3)\b|third/, 2],
      [/(option |number |answer )?(four|4)\b|fourth/, 3]];
    for (const [re, idx] of ordinals) if (re.test(t) && t.split(' ').length <= 4) return idx;
    // Exact match first: for article items the wrong form is a strict token
    // subset of the right one ('I read book' ⊂ 'I read a book'), so a plain
    // overlap score ties and used to pick the earlier (wrong) option.
    const exact = options.findIndex((opt) => norm(opt) === t);
    if (exact >= 0) return exact;
    // token-overlap score against each option; ties broken toward the option
    // whose token count is closest to what was heard (the fuller sentence)
    let best = -1, bestScore = 0, bestLenDiff = Infinity;
    const tt = t.split(' ');
    options.forEach((opt, i) => {
      const o = norm(opt);
      const ot = new Set(o.split(' '));
      let hit = 0;
      for (const w of tt) if (ot.has(w)) hit++;
      const score = hit / Math.max(2, ot.size);
      const sub = o.includes(t) || t.includes(o) ? 1 : 0;
      const s = Math.max(score, sub);
      const lenDiff = Math.abs(ot.size - tt.length);
      if (s > bestScore || (s === bestScore && s > 0 && lenDiff < bestLenDiff)) { bestScore = s; best = i; bestLenDiff = lenDiff; }
    });
    return bestScore >= 0.6 ? best : -1;
  }
}
