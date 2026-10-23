// процедурный звук: всё синтезируется в WebAudio, внешних файлов нет
export class Sound {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.indoor = false;
    this.chase = 0; // 0..1
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);

    // буфер белого шума
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // реверб из синтетического импульса
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.5, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
    }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    this.ready = true;
    this._ambience();
  }

  noiseSrc(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = loop;
    s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9;
    return s;
  }

  _ambience() {
    const ctx = this.ctx;
    // дождь
    const rain = this.noiseSrc();
    const rbp = ctx.createBiquadFilter(); rbp.type = 'highpass'; rbp.frequency.value = 900;
    this.rainLP = ctx.createBiquadFilter(); this.rainLP.type = 'lowpass'; this.rainLP.frequency.value = 6000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0.06;
    rain.connect(rbp); rbp.connect(this.rainLP); this.rainLP.connect(this.rainGain); this.rainGain.connect(this.amb);
    rain.start();
    // ветер
    const wind = this.noiseSrc();
    const wlp = ctx.createBiquadFilter(); wlp.type = 'bandpass'; wlp.frequency.value = 300; wlp.Q.value = 0.8;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(wlp.frequency); lfo.start();
    wind.connect(wlp); wlp.connect(wg); wg.connect(this.amb); wind.start();
    this.windGain = wg;
    // гул (дрон)
    this.drone = ctx.createGain(); this.drone.gain.value = 0;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 260;
    [55, 55.5, 82.4, 65.4].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = i < 2 ? 0.05 : 0.03;
      o.connect(g); g.connect(dlp); o.start();
    });
    const dl = ctx.createOscillator(); dl.frequency.value = 0.05;
    const dlg = ctx.createGain(); dlg.gain.value = 120; dl.connect(dlg); dlg.connect(dlp.frequency); dl.start();
    dlp.connect(this.drone); this.drone.connect(this.music);
    this.drone.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 6);
    // погоня: тремоло струнных + пульс
    this.chaseGain = ctx.createGain(); this.chaseGain.gain.value = 0;
    const cbp = ctx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 900; cbp.Q.value = 3;
    [233.1, 246.9, 349.2].forEach(f => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.05;
      const tr = ctx.createOscillator(); tr.frequency.value = 11 + Math.random() * 2;
      const tg = ctx.createGain(); tg.gain.value = 0.05; tr.connect(tg); tg.connect(g.gain); tr.start();
      o.connect(g); g.connect(cbp); o.start();
    });
    cbp.connect(this.chaseGain); this.chaseGain.connect(this.music);
    this._beatT = 0;
  }

  setIndoor(v) {
    if (!this.ready || v === this.indoor) return;
    this.indoor = v;
    const t = this.ctx.currentTime;
    this.rainLP.frequency.setTargetAtTime(v ? 700 : 6000, t, 0.4);
    this.rainGain.gain.setTargetAtTime(v ? 0.05 : 0.07, t, 0.4);
    this.windGain.gain.setTargetAtTime(v ? 0.02 : 0.05, t, 0.4);
  }
  setUnderground(v) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(v ? 0.006 : 0.05, t, 0.5);
    this.verbGain.gain.setTargetAtTime(v ? 0.6 : 0.35, t, 0.5);
  }

  update(dt, chase, heartRate) {
    if (!this.ready) return;
    this.chase += (chase - this.chase) * Math.min(1, dt * 1.5);
    this.chaseGain.gain.value = this.chase * 0.9;
    this._beatT -= dt;
    if (heartRate > 0 && this._beatT <= 0) {
      this._beatT = 60 / heartRate;
      this.heartbeat(0.25 + this.chase * 0.5);
    }
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, dest = this.sfx, at = 0, slideTo = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return g;
  }

  burst(freq, q, dur, vol, type = 'bandpass', at = 0, dest = this.sfx) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const s = this.noiseSrc(false);
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); this.env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.1);
    return { f, g };
  }

  step(surface, run) {
    const v = run ? 0.35 : 0.22;
    if (surface === 'grass') { this.burst(1800, 0.6, 0.09, v * 0.6, 'bandpass'); this.burst(400, 1, 0.06, v * 0.5); }
    else if (surface === 'stone') { this.burst(2400, 2, 0.04, v * 0.6); this.tone(110, 0.06, 'sine', v * 0.4); }
    else { this.burst(700 + Math.random() * 200, 2.5, 0.07, v * 0.7); this.tone(90 + Math.random() * 20, 0.08, 'sine', v * 0.6);
      if (Math.random() < 0.08) this.creak(0.4, 0.06); }
  }

  creak(dur = 1.2, vol = 0.12) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    for (let i = 1; i < 12; i++) o.frequency.setValueAtTime(60 + Math.random() * 60, t + dur * i / 12);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 12;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 2600; f2.gain.value = 8;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.1); g.gain.setValueAtTime(vol, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(f2); f2.connect(g); g.connect(this.sfx); g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.1);
  }

  thunder() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSrc(false); s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 4);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.indoor ? 0.5 : 0.8, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    s.connect(f); f.connect(g); g.connect(this.sfx); g.connect(this.verb); s.start(t); s.stop(t + 5.2);
  }

  heartbeat(vol) { this.tone(58, 0.16, 'sine', vol, this.sfx, 0, 40); this.tone(52, 0.18, 'sine', vol * 0.8, this.sfx, 0.22, 38); }

  stinger() {
    if (!this.ready) return;
    [311, 329.6, 466, 493.9, 739].forEach((f, i) => {
      const g = this.tone(f, 2.2, 'sawtooth', 0.06, this.sfx, i * 0.01);
    });
    this.burst(3000, 0.5, 0.8, 0.25, 'highpass');
    this.tone(45, 2.5, 'sine', 0.5, this.sfx, 0, 30);
  }

  beep(ok = true) { ok ? this.tone(1200, 0.07, 'square', 0.06) : this.tone(140, 0.35, 'square', 0.1); }
  unlock() { this.burst(2500, 3, 0.05, 0.3); this.burst(1500, 3, 0.07, 0.3, 'bandpass', 0.12); this.tone(180, 0.12, 'triangle', 0.2, this.sfx, 0.12); }
  metal() { this.tone(70, 0.6, 'sine', 0.5, this.sfx, 0, 45); this.burst(800, 4, 0.4, 0.3); this.tone(523, 1.4, 'sine', 0.05, this.verb); }
  pickup() { this.tone(660, 0.25, 'sine', 0.12); this.tone(990, 0.4, 'sine', 0.08, this.sfx, 0.08); }
  paper() { this.burst(4000, 0.7, 0.18, 0.15, 'highpass'); this.burst(2500, 0.7, 0.12, 0.1, 'highpass', 0.15); }
  whoosh() { const r = this.burst(600, 1.5, 0.25, 0.3); if (r) r.f.frequency.exponentialRampToValueAtTime(2500, this.ctx.currentTime + 0.22); }
  hit() { this.tone(120, 0.18, 'square', 0.25, this.sfx, 0, 50); this.burst(1500, 1, 0.12, 0.5); this.bones(0.4); }
  hurt() { this.tone(200, 0.3, 'sawtooth', 0.18, this.sfx, 0, 80); this.burst(500, 1, 0.3, 0.3); }
  bones(vol = 0.25) { for (let i = 0; i < 6; i++) this.burst(2000 + Math.random() * 2500, 8, 0.03, vol, 'bandpass', Math.random() * 0.35); }
  twang() {
    if (!this.ready) return;
    // Карплус-Стронг: щипок тетивы
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * 0.8), p = Math.floor(sr / 110);
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < p; i++) d[i] = Math.random() * 2 - 1;
    for (let i = p; i < n; i++) d[i] = 0.996 * 0.5 * (d[i - p] + d[i - p + 1]);
    const s = ctx.createBufferSource(); s.buffer = b;
    const g = ctx.createGain(); g.gain.value = 0.5; s.connect(g); g.connect(this.sfx); s.start();
    this.whoosh();
  }
  whisper() {
    for (let i = 0; i < 5; i++) {
      const r = this.burst(2500 + Math.random() * 3000, 6, 0.4 + Math.random() * 0.3, 0.06, 'bandpass', i * 0.25, this.verb);
    }
  }
  flash() { this.tone(2000, 0.03, 'square', 0.04); }

  // ---------- музыка меню: свой мрачный трэп-бит ----------
  startBeat() {
    if (!this.ready || this.beatOn) return;
    this.beatOn = true;
    const ctx = this.ctx, bpm = 140, s16 = 60 / bpm / 4;
    const bus = this.beatBus = ctx.createGain(); bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 1.5);
    bus.connect(this.music);
    // до-минор: C Eb G Ab Bb
    const bass = [36, 36, 39, 34], mel = [[72, 75, 79, 75], [72, 75, 80, 79], [75, 79, 82, 79], [70, 74, 77, 74]];
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    let step = 0, next = ctx.currentTime + 0.1;
    const hatRolls = new Set([14, 30, 46, 62]);
    const sched = () => {
      if (!this.beatOn) return;
      while (next < ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 16) % 4, s = step % 16, t = next;
        // хэты
        if (step % 2 === 0 || hatRolls.has(step % 64)) {
          const roll = hatRolls.has(step % 64);
          const n = roll ? 3 : 1;
          for (let k = 0; k < n; k++) this._hat(t + k * s16 / n, bus, roll ? 0.05 : 0.08);
        }
        // клэп на 3-ю долю
        if (s === 8) this._clap(t, bus);
        // 808
        if (s === 0 || s === 7 || (s === 10 && bar % 2) || (s === 14 && bar === 3)) this._808(t, mtof(bass[bar]), bus, s === 0 ? 1.2 : 0.6);
        // колокольчиковая мелодия
        if (s % 4 === 0) this._bell(t, mtof(mel[bar][s / 4]), bus);
        if (s === 0) this._pad(t, mtof(bass[bar] + 24), bus, s16 * 16);
        next += s16; step++;
      }
      this._beatTimer = setTimeout(sched, 60);
    };
    sched();
  }
  stopBeat() {
    if (!this.beatOn) return;
    this.beatOn = false; clearTimeout(this._beatTimer);
    const b = this.beatBus; b.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
    setTimeout(() => b.disconnect(), 2000);
  }
  _hat(t, bus, v) {
    const s = this.noiseSrc(false), f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
    const g = this.ctx.createGain(); this.env(g, t, 0.001, v, 0.04);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.08);
  }
  _clap(t, bus) {
    for (let i = 0; i < 3; i++) {
      const s = this.noiseSrc(false), f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1;
      const g = this.ctx.createGain(); this.env(g, t + i * 0.012, 0.001, 0.35, i === 2 ? 0.25 : 0.02);
      s.connect(f); f.connect(g); g.connect(bus); g.connect(this.verb); s.start(t); s.stop(t + 0.4);
    }
  }
  _808(t, f, bus, len) {
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const sh = this.ctx.createWaveShaper(); const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.5); }
    sh.curve = c;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(sh); sh.connect(g); g.connect(bus); o.start(t); o.stop(t + len + 0.05);
  }
  _bell(t, f, bus) {
    [1, 2.01, 3.98].forEach((m, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
      const g = this.ctx.createGain(); this.env(g, t, 0.003, [0.07, 0.025, 0.01][i], 0.9 - i * 0.25);
      o.connect(g); g.connect(bus); g.connect(this.verb); o.start(t); o.stop(t + 1.2);
    });
  }
  _pad(t, f, bus, len) {
    [1, 1.189, 1.498].forEach(m => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * m * 0.5;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025, t + len * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o.stop(t + len + 0.1);
    });
  }
}

// ---------- озвучка: лучший доступный русский нейроголос ----------
export class Voice {
  constructor(subEl) {
    this.sub = subEl;
    this.enabled = 'speechSynthesis' in window;
    this.voices = [];
    this.queue = Promise.resolve();
    if (this.enabled) {
      const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^ru/i.test(v.lang)); };
      load(); speechSynthesis.onvoiceschanged = load;
    }
    this.profiles = {
      dan: { name: 'Даня', gender: 'm', pitch: 0.95, rate: 1.02, color: '#d9dde6' },
      anya: { name: 'Аня', gender: 'f', pitch: 1.18, rate: 1.0, color: '#f0b8c4' },
      ded: { name: 'Дед', gender: 'm', pitch: 0.55, rate: 0.86, color: '#9fd0e8' },
      storozh: { name: '???', gender: 'f', pitch: 0.2, rate: 0.7, color: '#e05a4a' },
      sms: { name: 'SMS', gender: 'f', pitch: 1, rate: 1.05, color: '#b6e3a8' },
    };
  }
  score(v, gender) {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/natural|neural|online|enhanced|premium|wavenet/.test(n)) s += 6;
    if (/google/.test(n)) s += 3;
    if (/microsoft/.test(n)) s += 1;
    const male = /dmitry|дмитрий|pavel|павел|yuri|юрий|maxim|максим|ruslan|aleksandr|александр|male|муж/.test(n);
    const female = /svetlana|светлана|dariya|дарья|milena|милена|irina|ирина|katya|катя|anna|анна|ekaterina|екатерина|alena|алёна|female|жен|google/.test(n);
    if (gender === 'm' && male) s += 4;
    if (gender === 'f' && female) s += 4;
    if (!v.localService) s += 1;
    return s;
  }
  pick(gender) {
    if (!this.voices.length) this.voices = this.enabled ? speechSynthesis.getVoices().filter(v => /^ru/i.test(v.lang)) : [];
    if (!this.voices.length) return null;
    return [...this.voices].sort((a, b) => this.score(b, gender) - this.score(a, gender))[0];
  }
  // одна реплика: субтитр + голос; промис завершается по окончании
  say(who, text, opts = {}) {
    this.queue = this.queue.then(() => this._say(who, text, opts));
    return this.queue;
  }
  _say(who, text, opts) {
    const p = this.profiles[who] || this.profiles.dan;
    return new Promise(res => {
      this.sub.innerHTML = `<b style="color:${p.color}">${p.name}</b> ${text}`;
      this.sub.hidden = false;
      const minDur = Math.max(1800, text.length * 62);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        setTimeout(() => { this.sub.hidden = true; res(); }, 250);
      };
      const tStart = performance.now();
      const fallback = setTimeout(finish, minDur + 6000);
      if (this.enabled && !this.muted) {
        try {
          const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ''));
          u.lang = 'ru-RU';
          const v = this.pick(p.gender); if (v) u.voice = v;
          // у мужских нейроголосов меньше сдвиг высоты: звучит естественнее
          const natural = v && this.score(v, p.gender) >= 8;
          u.pitch = natural ? 1 + (p.pitch - 1) * 0.5 : p.pitch;
          u.rate = p.rate * (opts.rate || 1);
          u.volume = 1;
          u.onend = () => { clearTimeout(fallback); const el = performance.now() - tStart; setTimeout(finish, Math.max(0, 900 - el)); };
          u.onerror = () => { clearTimeout(fallback); setTimeout(finish, minDur); };
          speechSynthesis.speak(u);
        } catch (e) { clearTimeout(fallback); setTimeout(finish, minDur); }
      } else { clearTimeout(fallback); setTimeout(finish, minDur); }
    });
  }
  stop() {
    if (this.enabled) speechSynthesis.cancel();
    this.queue = Promise.resolve();
    this.sub.hidden = true;
  }
}
