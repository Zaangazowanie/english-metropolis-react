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

  // Record ~3.5s of mic audio and transcribe. Resolves to text ('' on failure).
  async listen(onState, profile = null) {
    if (this.listening) return '';
    this.listening = true;
    try {
      if (this.sttAvailable === null) await this.probeWhisper();
      if (this.sttAvailable) {
        const text = await this.listenWhisper(onState);
        return text;
      }
      return await this.listenWebSpeech(onState, profile);
    } catch (e) {
      console.warn('[voice] listen failed:', e);
      // one layered retry via the other engine
      try { return this.sttAvailable ? await this.listenWebSpeech(onState, profile) : ''; }
      catch { return ''; }
    } finally {
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
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ']/g, ' ').replace(/\s+/g, ' ').trim();
    const t = norm(text);
    if (!t) return -1;
    // "option one/two/three" or "the first/second/third one"
    const ordinals = [[/(option |number |answer )?(one|1)\b|first/, 0],
      [/(option |number |answer )?(two|2)\b|second/, 1],
      [/(option |number |answer )?(three|3)\b|third/, 2],
      [/(option |number |answer )?(four|4)\b|fourth/, 3]];
    for (const [re, idx] of ordinals) if (re.test(t) && t.split(' ').length <= 4) return idx;
    // token-overlap score against each option
    let best = -1, bestScore = 0;
    options.forEach((opt, i) => {
      const o = norm(opt);
      const ot = new Set(o.split(' '));
      const tt = t.split(' ');
      let hit = 0;
      for (const w of tt) if (ot.has(w)) hit++;
      const score = hit / Math.max(2, ot.size);
      // exact/substring match is decisive
      const sub = o.includes(t) || t.includes(o) ? 1 : 0;
      const s = Math.max(score, sub);
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return bestScore >= 0.6 ? best : -1;
  }
}
