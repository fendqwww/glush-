// звук целиком синтезируется в WebAudio: гул ферм, писк дросселей, касса, сирена
export class Audio {
  constructor() { this.ctx = null; this.mute = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.mute ? 0 : 0.8; this.master.connect(c.destination);
    // шум для гула вентиляторов
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 6; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.humF = c.createBiquadFilter(); this.humF.type = 'lowpass'; this.humF.frequency.value = 400;
    this.hum = c.createGain(); this.hum.gain.value = 0;
    src.connect(this.humF); this.humF.connect(this.hum); this.hum.connect(this.master); src.start();
    // низкий гул трансформатора 50 Гц
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50;
    const of = c.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 160;
    this.buzz = c.createGain(); this.buzz.gain.value = 0;
    o.connect(of); of.connect(this.buzz); this.buzz.connect(this.master); o.start();
    // писк дросселей
    const w = c.createOscillator(); w.type = 'sine'; w.frequency.value = 7800;
    this.whine = c.createGain(); this.whine.gain.value = 0;
    w.connect(this.whine); this.whine.connect(this.master); w.start();
    this.whineO = w;
  }
  setMute(m) { this.mute = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  // fans — сколько вентиляторов крутится, load — киловатты
  ambient(fans, load, hot) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hum.gain.setTargetAtTime(Math.min(0.5, fans * 0.012), t, 0.3);
    this.humF.frequency.setTargetAtTime(300 + Math.min(1600, fans * 25) + hot * 400, t, 0.5);
    this.buzz.gain.setTargetAtTime(Math.min(0.05, load * 0.004), t, 0.3);
    this.whine.gain.setTargetAtTime(load > 0.2 ? 0.004 + Math.min(0.006, load * 0.0006) : 0, t, 0.3);
    this.whineO.frequency.setTargetAtTime(7600 + Math.sin(t * 0.7) * 300, t, 0.5);
  }
  tone(f, dur, type = 'sine', vol = 0.2, f2) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  click() { this.tone(1800, 0.04, 'square', 0.04); }
  coin() { this.tone(1320, 0.09, 'square', 0.07); setTimeout(() => this.tone(1980, 0.22, 'square', 0.06), 70); }
  buy() { this.tone(520, 0.08, 'triangle', 0.15); setTimeout(() => this.tone(780, 0.14, 'triangle', 0.13), 60); }
  bad() { this.tone(220, 0.35, 'sawtooth', 0.12, 110); }
  trip() { this.tone(90, 0.5, 'square', 0.25, 40); this.noise(0.25, 0.4); }
  noise(dur, vol) {
    if (!this.ctx) return;
    const c = this.ctx, n = c.sampleRate * dur, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = b; const g = c.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
  }
  siren() {
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) setTimeout(() => this.tone(700, 0.45, 'sawtooth', 0.08, 1100), i * 500);
  }
  alarmBeep() { this.tone(2400, 0.08, 'square', 0.05); }
}
