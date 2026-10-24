// ПОДПОЛЬНАЯ ФЕРМА — точка входа
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sim } from './sim.js';
import { Room, SPOTS } from './room.js';
import { Post } from './post.js';
import { UI, rubK } from './ui.js';
import { Audio } from './audio.js';
import { DAY_SEC, GPU_BY_ID, GOAL } from './data.js';

const $ = id => document.getElementById(id);
const KEY = 'mfarm_save_v1';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
};
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

class Game {
  constructor() {
    this.canvas = $('c');
    let renderer;
    try {
      const opts = { canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false };
      if (/gl1/.test(location.search)) opts.context = this.canvas.getContext('webgl', { antialias: false, stencil: false });
      renderer = new THREE.WebGLRenderer(opts);
    } catch (e) {
      $('loading').innerHTML = 'WebGL недоступен в этом браузере :(';
      throw e;
    }
    this.renderer = renderer;
    this.q = isTouch ? 0 : 1;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // в sRGB переводит пост-шейдер
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPR = Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 1.5);
    this.pr = Math.min(this.maxPR, isTouch ? 1.3 : 1.25);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050608);
    scene.fog = new THREE.Fog(0x050608, 14, 34);
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
      pm.dispose();
    } catch (e) { /* без отражений */ }
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
    this.room = new Room(scene, this.q);
    this.post = new Post(renderer, this.q);
    this.audio = new Audio();
    this.audio.setMute(store.get('mfarm_mute') === '1');
    this.ui = new UI(this);
    this.speed = 1;
    this.paused = true;
    this.state = 'menu';
    // камера-орбита
    this.cam = { yaw: -0.18, pitch: 0.58, dist: 9.5, tx: 0.3, ty: 0.6, tz: -0.4 };
    this.camT = Object.assign({}, this.cam);
    this.ray = new THREE.Raycaster();
    this.bindInput();
    this.toasts = [];
    this.hintQ = [];
    this.clock = new THREE.Clock();
    this.frameAcc = 0; this.frameN = 0; this.hudT = 0; this.saveT = 0; this.scrT = 0; this.beepT = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());
    // фоновая ферма для меню
    const saved = store.get(KEY);
    this.startSim(saved ? new Sim(saved) : this.demoSim(), !saved);
    this.bindMenu(!!saved);
    $('loading').style.display = 'none';
    this.showMenu(true);
    renderer.setAnimationLoop(() => this.loop());
  }

  demoSim() {
    const s = new Sim();
    s.money = 1e7;
    s.room = 0;
    s.buyRig(1); s.buyRig(2); s.buyRig(3);
    const ids = ['rx470', 'rtx3060', 'rtx3080', 'rx580'];
    for (let k = 0; k < 22; k++) s.buyCard(ids[k % 4]);
    s.coolers.fan = 2; s.coolers.ac = 1;
    s.rigs[3].imm = true;
    s.roomT = 24;
    for (const r of s.rigs) for (const c of r.cards) c.temp = 55 + Math.random() * 20;
    s.demo = true;
    return s;
  }

  startSim(sim, demo) {
    this.sim = sim;
    this.demo = !!demo;
    this.ui.bind(sim);
    sim.on((t, a, b) => this.onSim(t, a, b));
    this.room.rebuild(sim);
    this.room.rebuildCoolers(sim);
    this.room.applyUpgrades(sim);
    this.room.select(-1);
    this.room.drawScreen(sim, sim.bestCoin());
    this.room.monthShown = -1;
    this.fitCamera(true);
  }

  bindMenu(hasSave) {
    $('bCont').style.display = hasSave ? '' : 'none';
    $('bCont').onclick = () => { this.audio.unlock(); this.play(); };
    $('bNew').onclick = () => {
      this.audio.unlock();
      if (store.get(KEY) && !confirm('Начать заново? Текущая ферма пропадёт.')) return;
      store.del(KEY);
      this.startSim(new Sim(), false);
      this.hintQ = [];
      this.play();
      this.queueHint('добро пожаловать в подвал! у тебя 45 000 ₽ и пустой риг. открой 🛒 МАГАЗИН и купи пару видеокарт — б/у RX 470 быстро окупается');
    };
    $('bResume').onclick = () => this.play();
    $('bMute').onclick = () => this.toggleMute();
    $('bMenu2').onclick = () => { this.save(); location.reload(); };
  }

  play() {
    if (this.demo) { store.del(KEY); this.startSim(new Sim(), false); this.queueHint('добро пожаловать в подвал! у тебя 45 000 ₽ и пустой риг. открой 🛒 МАГАЗИН и купи пару видеокарт — б/у RX 470 быстро окупается'); }
    this.state = 'play';
    this.paused = false;
    $('menu').style.display = 'none';
    $('pause').style.display = 'none';
    $('hud').style.display = 'block';
    this.ui.hud();
    this.tryFullscreen();
  }

  showMenu(first) {
    if (this.state === 'play' && !first) { this.paused = true; $('pause').style.display = 'flex'; return; }
    if (this.state === 'play') { this.paused = true; $('pause').style.display = 'flex'; return; }
    $('menu').style.display = 'flex';
    $('hud').style.display = 'none';
  }

  tryFullscreen() {
    const d = document.documentElement;
    if (!isTouch || document.fullscreenElement || !d.requestFullscreen) return;
    try { const p = d.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* iPhone не умеет */ }
  }

  toggleMute() {
    this.audio.setMute(!this.audio.mute);
    store.set('mfarm_mute', this.audio.mute ? '1' : '0');
    $('bSound').textContent = this.audio.mute ? '🔇' : '🔊';
    $('bMute').textContent = this.audio.mute ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ';
  }

  setSpeed(v) {
    if (v === 0) { this.paused = !this.paused; }
    else { this.speed = v; this.paused = false; }
    $('bPauseT').classList.toggle('on', this.paused);
    this.ui.hud();
  }

  save() { if (this.sim && !this.demo && this.state === 'play' && !this.sim.over) store.set(KEY, this.sim.save()); }
  dirty() { this.room.rebuild(this.sim); this.room.rebuildCoolers(this.sim); this.room.applyUpgrades(this.sim); this.room.select(this.ui.rigSel >= 0 && this.sim.rigs[this.ui.rigSel] ? this.sim.rigs[this.ui.rigSel].spot : -1); }

  onSim(t, a, b) {
    if (this.demo) return;
    const s = this.sim;
    switch (t) {
      case 'news': this.toast(a, b); this.ticker(a, b); if (b === 'bad') this.audio.bad(); break;
      case 'hint': this.queueHint(a); break;
      case 'install': case 'rig': case 'dead': case 'room': case 'up': case 'cooler': case 'sell': this.dirty(); if (t === 'room') this.fitCamera(); break;
      case 'buy':
        if (!this.hint1) { this.hint1 = 1; setTimeout(() => this.queueHint('карта встала в риг и уже майнит! доход сразу меняется на рубли. следи за ценой света (⚡ ЭНЕРГИЯ), жарой (🌡 КЛИМАТ) и курсом (📈 БИРЖА). тапни по ригу в подвале, чтобы настроить его'), 1500); }
        break;
      case 'trip': this.audio.trip(); this.room.sparkBurst(this.room.panelPos, 40); this.shake = 0.4; break;
      case 'fire': this.room.startFire(a); this.audio.noise(1.2, 0.3); this.audio.siren(); this.shake = 0.6; this.dirty(); break;
      case 'raid': this.audio.siren(); this.flash = 1; this.dirty(); this.modal('🚨 РЕЙД', `в подвал зашли люди в форме.<br>изъято карт: <b>${a}</b><br>штраф: <b>${rubK(b)}</b><br><br>палево сброшено. начинай заново потише.`); break;
      case 'warn': this.raidModal(); break;
      case 'nomoney': this.toast('💸 не хватает денег', 'bad'); this.audio.bad(); break;
      case 'win': this.modal('🏆 ' + rubK(GOAL) + '!', `ты сколотил состояние на подпольном майнинге. можно уезжать на бали...<br>или продолжить строить империю — ферма остаётся с тобой.`); this.audio.coin(); break;
      case 'over': this.modal('💀 БАНКРОТ', 'долги больше всего имущества. свет отключили, карты забрали коллекторы.', true); store.del(KEY); break;
      case 'day': if (s.lastTick % 3 === 0) this.room.drawScreen(s, s.bestCoin()); break;
    }
  }

  modal(title, body, restart) {
    $('mTitle').innerHTML = title; $('mBody').innerHTML = body;
    $('mOk').textContent = restart ? 'НОВАЯ ИГРА' : 'ПОНЯТНО';
    $('mOk').onclick = () => { $('modal').style.display = 'none'; if (restart) { store.del(KEY); location.reload(); } else this.paused = this.wasPaused; };
    $('modal').style.display = 'flex';
    this.wasPaused = this.paused; this.paused = true;
  }

  raidModal() {
    const s = this.sim;
    $('raidCost').textContent = rubK(s.bribeCost());
    $('raidBribe').classList.toggle('off', s.money < s.bribeCost() || s.bribeCD > 0);
    $('raid').style.display = 'flex';
  }

  toast(text, c) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (c || '');
    el.textContent = text;
    box.insertBefore(el, box.firstChild);
    while (box.children.length > 3) box.removeChild(box.lastChild);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4500);
  }
  ticker(text, c) {
    const t = $('ticker');
    t.innerHTML = `<span class="${c || ''}">📰 ${text}</span>`;
  }

  queueHint(t) { this.hintQ.push(t); if ($('hint').style.display !== 'flex') this.nextHint(); }
  nextHint() {
    const t = this.hintQ.shift();
    if (!t) return;
    $('hintT').textContent = t;
    $('hint').style.display = 'flex';
  }

  onPanel(tab, rigSel) {
    const s = this.sim;
    if (tab === 'farm' && rigSel >= 0 && s.rigs[rigSel]) {
      const r = s.rigs[rigSel];
      this.room.select(r.spot);
      const [x, z] = SPOTS[r.spot];
      this.camT.tx = x; this.camT.tz = z + 0.2; this.camT.ty = 0.7; this.camT.dist = 4.2; this.camT.pitch = 0.45;
    } else {
      this.room.select(-1);
      if (this.focused) this.fitCamera();
    }
    this.focused = tab === 'farm' && rigSel >= 0;
    this.resize();
  }

  fitCamera(now) {
    const r = this.sim.room;
    const c = this.camT;
    c.tx = [0.3, 3.8, 0][r]; c.ty = 0.5; c.tz = [-0.7, -0.4, -0.4][r];
    c.dist = [8.2, 13.5, 18.5][r]; c.pitch = 0.6; c.yaw = -0.12;
    if (now) Object.assign(this.cam, c);
  }

  // ===== управление камерой =====
  bindInput() {
    const el = this.canvas;
    const P = this.ptrs = new Map();
    let tap = null, pinch = null;
    el.addEventListener('pointerdown', e => {
      this.audio.unlock();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (P.size === 1) tap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      else { tap = null; pinch = null; }
    });
    el.addEventListener('pointermove', e => {
      const p = P.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (tap) tap.moved += Math.abs(dx) + Math.abs(dy);
      const c = this.camT;
      if (P.size === 1) {
        c.yaw -= dx * 0.006; c.pitch += dy * 0.005;
      } else if (P.size === 2) {
        const [a, b] = [...P.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2;
        if (pinch) {
          c.dist *= pinch.d / Math.max(10, d);
          const k = c.dist / window.innerHeight * 0.9;
          c.tx -= (mx - pinch.mx) * k * Math.cos(c.yaw);
          c.tz += (mx - pinch.mx) * k * Math.sin(c.yaw);
        }
        pinch = { d, mx };
      }
      this.clampCam();
    });
    const up = e => {
      P.delete(e.pointerId);
      if (P.size < 2) pinch = null;
      if (tap && P.size === 0 && tap.moved < 12 && performance.now() - tap.t < 450) this.onTap(e.clientX, e.clientY);
      if (P.size === 0) tap = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', e => { P.delete(e.pointerId); tap = null; pinch = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.camT.dist *= Math.exp(e.deltaY * 0.001); this.clampCam(); }, { passive: false });
    window.addEventListener('keydown', e => {
      if (this.state !== 'play') return;
      if (e.code === 'Space') { this.setSpeed(0); e.preventDefault(); }
      if (e.code === 'Digit1') this.setSpeed(1);
      if (e.code === 'Digit2') this.setSpeed(3);
      if (e.code === 'Digit3') this.setSpeed(8);
      if (e.code === 'Escape') this.ui.open(null);
    });
  }

  clampCam() {
    const c = this.camT, r = this.sim ? this.sim.room : 0;
    c.pitch = clamp(c.pitch, 0.18, 1.2);
    c.yaw = clamp(c.yaw, -0.95, 0.95);
    c.dist = clamp(c.dist, 2.8, [12, 17, 22][r]);
    c.tx = clamp(c.tx, [-2.5, -2.5, -10][r], [3, 10, 10][r]);
    c.tz = clamp(c.tz, -2.4, 2);
  }

  onTap(x, y) {
    if (this.state !== 'play') return;
    const w = window.innerWidth, h = window.innerHeight;
    this.ray.setFromCamera(new THREE.Vector2(x / w * 2 - 1, -(y / h) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects(this.room.picks, false)[0];
    if (!hit) { if (this.ui.tab) this.ui.open(null); return; }
    const u = hit.object.userData;
    this.audio.click();
    if (u.free) {
      const s = this.sim;
      if (s.money >= s.rigPrice()) { const r = s.buyRig(u.spot); if (r) { this.audio.buy(); this.toast('🛠️ новый риг собран за ' + rubK(s.rigPrice()), 'good'); this.ui.open('farm', s.rigs.indexOf(r)); } }
      else this.toast('риг стоит ' + rubK(s.rigPrice()) + ' — не хватает денег', 'bad');
    } else this.ui.open('farm', u.rig);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    const bw = Math.floor(w * this.pr), bh = Math.floor(h * this.pr);
    this.post.setSize(bw, bh);
    this.camera.aspect = w / h;
    // при открытой панели сдвигаем картинку влево
    const pw = this.ui.tab ? Math.min(420, w * 0.5) : 0;
    if (pw) this.camera.setViewOffset(w, h, pw / 2, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.room.setScale(bh * 0.9);
    $('rotate').style.display = isTouch && h > w ? 'flex' : 'none';
  }

  loop() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const s = this.sim;
    if (!this.paused && !s.over) s.step(dt / DAY_SEC * this.speed);
    else if (this.demo && this.state === 'menu') s.step(dt / DAY_SEC * 0.5);
    if (this.demo) { s.money = 1e7; s.sus = 0; s.tripped = false; s.blackout = 0; }
    // камера
    if (this.state === 'menu') this.camT.yaw = Math.sin(performance.now() * 0.00012) * 0.6;
    const c = this.cam, T = this.camT, k = 1 - Math.exp(-dt * 6);
    for (const key in T) c[key] += (T[key] - c[key]) * k;
    const cp = Math.cos(c.pitch);
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake -= dt; sx = (Math.random() - 0.5) * this.shake * 0.15; sy = (Math.random() - 0.5) * this.shake * 0.15; }
    this.camera.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist + sx, c.ty + Math.sin(c.pitch) * c.dist + sy, c.tz + Math.cos(c.yaw) * cp * c.dist);
    this.camera.lookAt(c.tx, c.ty, c.tz);
    const info = this.room.update(s, dt, this.camera);
    // пост
    const u = this.post.mFinal.uniforms;
    u.time.value += dt;
    u.heat.value += (clamp((s.roomT - 29) / 14, 0, 1) - u.heat.value) * Math.min(1, dt * 2);
    const danger = info.maxT > 90 || s.raidT > 0;
    u.alarm.value = danger ? 0.25 + 0.25 * Math.sin(u.time.value * 7) : (this.flash > 0 ? this.flash : 0);
    if (this.flash > 0) this.flash -= dt * 0.5;
    u.exposure.value = 1.2;
    this.post.render(this.scene, this.camera);
    // интерфейс
    this.hudT -= dt;
    if (this.state === 'play' && this.hudT <= 0) { this.hudT = 0.12; this.ui.hud(); this.ui.render(false); }
    // звук
    let fans = 0; if (s.powered()) for (const r of s.rigs) if (r.on && r.off <= 0 && !r.imm) for (const cd of r.cards) fans += GPU_BY_ID[cd.id].fans || 2;
    for (const kk in s.coolers) fans += s.coolers[kk] * 3;
    if (this.state === 'play') this.audio.ambient(fans, s.flow.kw, clamp((info.maxT - 60) / 30, 0, 1));
    this.beepT -= dt;
    if (this.state === 'play' && info.maxT > 90 && this.beepT <= 0) { this.beepT = 1.2; this.audio.alarmBeep(); }
    // автосохранение
    this.saveT += dt;
    if (this.saveT > 5) { this.saveT = 0; this.save(); }
    this.adapt(dt);
  }

  // подстройка разрешения под fps
  adapt(dt) {
    this.frameAcc += dt; this.frameN++;
    if (this.frameAcc < 2) return;
    const avg = this.frameAcc / this.frameN;
    this.frameAcc = 0; this.frameN = 0;
    let pr = this.pr;
    if (avg > 1 / 40) pr = Math.max(0.75, pr - 0.15);
    else if (avg < 1 / 57) pr = Math.min(this.maxPR, pr + 0.05);
    if (Math.abs(pr - this.pr) > 0.01) { this.pr = pr; this.resize(); }
  }
}

window.addEventListener('load', () => {
  try { window.game = new Game(); } catch (e) { console.error(e); $('loading').textContent = 'ошибка: ' + e.message; }
});
