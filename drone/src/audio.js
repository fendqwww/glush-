// синтез звука в WebAudio: моторы, ветер, помехи, взрывы
export class Audio {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    // пустой буфер для разблокировки на iOS
    const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // моторы
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 2;
    this.motorLP = lp;
    this.motorGain.connect(this.master);
    lp.connect(this.motorGain);
    this.osc = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
      const g = ctx.createGain(); g.gain.value = 0.22;
      o.connect(g); g.connect(lp); o.start();
      this.osc.push(o);
    }
    // шум пропеллеров и ветра
    this.windSrc = this.loop(); this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 600; this.windBP.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windSrc.connect(this.windBP); this.windBP.connect(this.windGain); this.windGain.connect(this.master);
    // помехи
    this.statSrc = this.loop(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    this.statGain = ctx.createGain(); this.statGain.gain.value = 0;
    this.statSrc.connect(hp); hp.connect(this.statGain); this.statGain.connect(this.master);
  }

  loop() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(0); return s;
  }

  setMute(m) { this.on = !m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }

  update(motor, speed, signal, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 90 + motor * 360;
    this.osc.forEach((o, i) => o.frequency.setTargetAtTime(base * (1 + i * 0.013) + Math.sin(t * 7 + i) * 3, t, 0.03));
    this.motorGain.gain.setTargetAtTime(active ? 0.05 + motor * 0.12 : 0, t, 0.05);
    this.motorLP.frequency.setTargetAtTime(900 + motor * 3000, t, 0.05);
    this.windGain.gain.setTargetAtTime(active ? Math.min(0.35, speed * 0.008) + motor * 0.03 : 0, t, 0.1);
    this.windBP.frequency.setTargetAtTime(400 + speed * 25, t, 0.1);
    this.statGain.gain.setTargetAtTime(active ? Math.pow(1 - signal, 2) * 0.25 : 0, t, 0.05);
  }

  boom(dist, big) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.min(1, dist / 340);
    const vol = Math.min(1.2, 30 / (dist + 10)) * (big ? 1.3 : 1);
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    s.connect(lp); lp.connect(g); g.connect(this.master); s.start(t); s.stop(t + 2);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 1);
  }

  shot(dist) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + dist / 340;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900;
    const g = ctx.createGain(); const v = Math.min(0.5, 12 / (dist + 10));
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.15);
  }

  beep(f, d, v) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(v || 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + (d || 0.1));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + (d || 0.1) + 0.05);
  }

  whistle() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(500, t + 1.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.7);
  }

  thud(v) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.6, v * 0.05), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    s.connect(lp); lp.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.25);
  }
}
