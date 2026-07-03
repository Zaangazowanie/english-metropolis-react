// Soundscape: quiet background music + real sampled SFX (WebAudio).
// All sources are real downloaded audio files (three.js example sound library);
// SFX variants are pitch-shifted playback of the sampled ping — no synthesis.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.musicGain = null;
    this.sfxGain = null;
    this.started = false;
  }

  // must be called from a user gesture (BEGIN click)
  async start() {
    if (this.started) return;
    this.started = true;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.14;             // quiet underneath
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.ctx.destination);

    const load = async (name, url) => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(buf);
      } catch (e) { console.warn('[audio] failed:', name, e); }
    };
    await Promise.all([
      load('music', 'public/assets/audio/music.mp3'),
      load('ping', 'public/assets/audio/ping.mp3'),
    ]);

    if (this.buffers.music) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.music;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
    }
  }

  play(name, { rate = 1, volume = 1 } = {}) {
    if (!this.ctx || !this.buffers[name]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  // semantic cues (sampled ping at different pitches — bright=good, low=bad)
  correct() { this.play('ping', { rate: 1.6, volume: 0.9 }); setTimeout(() => this.play('ping', { rate: 2.1, volume: 0.7 }), 110); }
  wrong()   { this.play('ping', { rate: 0.55, volume: 0.8 }); }
  click()   { this.play('ping', { rate: 1.2, volume: 0.35 }); }
  fanfare() { [1.2, 1.5, 1.8, 2.4].forEach((r, i) => setTimeout(() => this.play('ping', { rate: r, volume: 0.8 }), i * 130)); }
}
