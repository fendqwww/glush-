// FPV: ПОСЛЕДНЯЯ МИЛЯ — точка входа
import * as THREE from 'three';
import { World } from './world.js';
import { Drone, TYPES } from './drone.js';
import { FX } from './fx.js';
import { Vehicles } from './vehicles.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { MODES, setupMode, fmt } from './modes.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('fpv_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fpv_' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
};

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const settings = Object.assign({ quality: isTouch ? 0 : 1, analog: true, sens: 1, sound: true, mode: 'ANGLE', drone: null }, store.get('settings', {}));

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = settings.quality > 0 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.maxPR = Math.min(window.devicePixelRatio || 1, settings.quality > 0 ? 2 : 1.5);
    this.pr = Math.min(this.maxPR, isTouch ? 1.25 : 1.5);

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1400);
    scene.add(this.camera);
    this.buildSky();
    this.world = new World(scene, settings.quality);
    this.fx = new FX(scene, settings.quality);
    this.vehicles = new Vehicles(scene, this.world, this.fx);
    this.drone = new Drone(scene, settings.drone || 'kamikaze');
    this.post = new Post(renderer);
    this.audio = new Audio();
    this.audio.setMute(!settings.sound);
    this.gates = [];
    this.bombs = [];
    this.inputQ = [];
    this.buildPad();
    this.buildCable();
    this.buildAimMarker();

    this.ui = {
      baseL: $('baseL'), knobL: $('knobL'), baseR: $('baseR'), knobR: $('knobR'),
      hud: $('hud'), hc: $('hudc'),
    };
    this.hctx = this.ui.hc.getContext('2d');
    this.input = new Input($('touch'), this.ui);
    this.input.sens = settings.sens;
    this.input.setMode(settings.mode);
    this.drone.mode = settings.mode;
    this.state = 'menu';
    this.cam = 'fpv';
    this.signal = 1;
    this.lostT = 0;
    this.clock = new THREE.Clock();
    this.frameAcc = 0; this.frameN = 0;
    this.shakeV = 0;
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.tmpN = new THREE.Vector3();
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.vehicles.onKill = v => this.onKill(v);
    this.vehicles.onDamage = (v, d, spot) => this.toast(`${v.T.name}: ПОВРЕЖДЁН${spot ? ' · ' + spot : ''}`, '');
    this.vehicles.onShot = p => this.audio.shot(p.distanceTo(this.drone.pos));
    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    // меню на фоне облёта
    this.menuT = 0;
    this.setupMenuScene();
    $('loading').style.display = 'none';
    $('menu').style.display = 'flex';
    renderer.setAnimationLoop(() => this.loop());
  }

  buildSky() {
    const sun = this.sunDir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
    const g = new THREE.SphereGeometry(1200, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: sun }, time: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }',
      fragmentShader: `
        uniform vec3 sun; uniform float time; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD);
          float h = max(d.y, 0.0);
          vec3 zen = vec3(0.10, 0.22, 0.48), hor = vec3(0.78, 0.74, 0.70), gnd = vec3(0.30, 0.30, 0.28);
          vec3 c = mix(hor, zen, pow(h, 0.55));
          if (d.y < 0.0) c = mix(hor, gnd, min(1.0, -d.y * 6.0));
          float s = max(dot(d, sun), 0.0);
          c += vec3(1.0, 0.8, 0.55) * pow(s, 8.0) * 0.45;
          c += vec3(1.0, 0.9, 0.7) * pow(s, 900.0) * 30.0;
          c += vec3(1.0, 0.7, 0.4) * pow(1.0 - h, 6.0) * pow(s, 2.0) * 0.4;
          // облака
          vec2 uv = d.xz / max(0.08, d.y) * 0.6 + vec2(time * 0.006, time * 0.002);
          float n = sin(uv.x * 1.3 + sin(uv.y * 0.7)) * sin(uv.y * 1.1 + sin(uv.x * 0.9)) + 0.5 * sin(uv.x * 3.1 - uv.y * 2.3);
          float cl = smoothstep(0.35, 1.0, n) * smoothstep(0.0, 0.25, d.y) * 0.65;
          c = mix(c, vec3(0.95, 0.93, 0.9) + vec3(0.2, 0.12, 0.0) * pow(s, 4.0), cl);
          gl_FragColor = vec4(c * 1.15, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(g, m);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xb4b2ad, 60, 900);
    const hemi = new THREE.HemisphereLight(0xc4d4f0, 0x5a5040, 1.15);
    this.scene.add(hemi);
    const dl = this.sunLight = new THREE.DirectionalLight(0xfff0dc, 3.2);
    dl.castShadow = true;
    const S = settings.quality > 0 ? 2048 : 1024;
    dl.shadow.mapSize.set(S, S);
    const ext = settings.quality > 0 ? 70 : 55;
    Object.assign(dl.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 400 });
    dl.shadow.camera.updateProjectionMatrix();
    dl.shadow.bias = -0.0006;
    dl.shadow.normalBias = 0.03;
    this.scene.add(dl); this.scene.add(dl.target);
    this.shadowExt = ext;
  }

  buildPad() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.15, 24), new THREE.MeshStandardMaterial({ color: 0x3c3f35, roughness: 0.8 }));
    base.position.y = 0.075; base.receiveShadow = true; g.add(base);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xffaa22 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.16; g.add(ring);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.5 }));
    h.rotation.x = -Math.PI / 2; h.position.y = 0.161; g.add(h);
    // операторская позиция: ящики, антенна, маскировочная сеть
    const crate = new THREE.MeshStandardMaterial({ color: 0x4b5233, roughness: 0.9 });
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), crate); c.position.set(-2.6, 0.25 + (i === 2 ? 0.5 : 0), -1 + (i % 2) * 0.7); c.castShadow = true; g.add(c); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    mast.position.set(-3.2, 2, 1); g.add(mast);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    panel.position.set(-3.2, 4, 1); g.add(panel);
    this.pad = g; this.scene.add(g);
    // блиндаж для обороны
    const b = new THREE.Group();
    const logs = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 });
    const earth = new THREE.MeshStandardMaterial({ color: 0x4a4230, roughness: 1 });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), earth);
    mound.scale.y = 0.4; b.add(mound);
    for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), logs); l.rotation.z = Math.PI / 2; l.position.set(0, 2.3, -2 + i * 0.6); b.add(l); }
    b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    b.visible = false; this.bunker = b; this.scene.add(b);
  }

  buildCable() {
    this.cableMax = 2400;
    this.cablePos = new Float32Array(this.cableMax * 3);
    const g = new THREE.BufferGeometry();
    this.cableAttr = new THREE.BufferAttribute(this.cablePos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.cableAttr);
    g.setDrawRange(0, 0);
    this.cable = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe8e2b0, transparent: true, opacity: 0.8 }));
    this.cable.frustumCulled = false;
    this.scene.add(this.cable);
    this.cableN = 0; this.cableLen = 0;
  }

  buildAimMarker() {
    const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 24), new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.85, depthTest: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 5; m.visible = false;
    this.aim = m; this.scene.add(m);
  }

  // ---------- UI ----------
  bindUI() {
    const modeBox = $('modes');
    for (const id in MODES) {
      const d = MODES[id];
      const el = document.createElement('div');
      el.className = 'card'; el.dataset.id = id;
      const best = this.best(id);
      el.innerHTML = `<b>${d.name}</b><span>${d.desc}</span>${best ? `<i>рекорд: ${id === 'race' ? fmt(best) : best}</i>` : ''}`;
      el.onclick = () => { this.selMode = id; [...modeBox.children].forEach(c => c.classList.toggle('on', c === el)); this.selDrone = d.drone; this.renderDrones(); };
      modeBox.appendChild(el);
    }
    this.selMode = store.get('lastMode', 'strike');
    this.selDrone = settings.drone || MODES[this.selMode].drone;
    [...modeBox.children].forEach(c => c.classList.toggle('on', c.dataset.id === this.selMode));
    this.renderDrones();
    $('start').onclick = () => this.start();
    const tog = (id, key, labels) => {
      const el = $(id);
      const upd = () => { el.textContent = labels(settings[key]); };
      el.onclick = () => { this.changeSetting(key); upd(); };
      upd();
    };
    tog('optFlight', 'mode', v => `ПОЛЁТ: ${v}`);
    tog('optAnalog', 'analog', v => `АНАЛОГ: ${v ? 'ВКЛ' : 'ВЫКЛ'}`);
    tog('optSens', 'sens', v => `ЧУВСТВ.: ${Math.round(v * 100)}%`);
    tog('optSound', 'sound', v => `ЗВУК: ${v ? 'ВКЛ' : 'ВЫКЛ'}`);
    tog('optQ', 'quality', v => `ГРАФИКА: ${v ? 'ВЫСОКАЯ' : 'СРЕДНЯЯ'}`);
    const btn = (id, a) => {
      const el = $(id);
      const f = e => { e.preventDefault(); e.stopPropagation(); this.audio.unlock(); this.action(a); };
      el.addEventListener('touchstart', f, { passive: false });
      el.addEventListener('mousedown', f);
    };
    btn('bFire', 'drop'); btn('bCam', 'cam'); btn('bMode', 'mode'); btn('bPause', 'pause');
    $('resume').onclick = () => this.pause(false);
    $('quit').onclick = () => this.toMenu();
    $('again').onclick = () => this.start();
    $('toMenu').onclick = () => this.toMenu();
    $('fs').onclick = () => {
      const d = document.documentElement;
      const f = d.requestFullscreen || d.webkitRequestFullscreen;
      if (f) { try { f.call(d); } catch (e) { /* iPhone не умеет */ } }
    };
    if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('fs').style.display = 'none';
    const unlock = () => this.audio.unlock();
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    // запрет жестов Safari
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (this.state === 'play') e.preventDefault(); }, { passive: false });
    if (!isTouch) document.body.classList.add('desktop');
    const standalone = window.navigator.standalone;
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone) $('a2hs').style.display = 'block';
  }

  renderDrones() {
    const box = $('drones');
    box.innerHTML = '';
    for (const id in TYPES) {
      const t = TYPES[id];
      const el = document.createElement('div');
      el.className = 'dcard' + (id === this.selDrone ? ' on' : '');
      el.innerHTML = `<b>${t.name}</b><span>${t.desc}</span>`;
      el.onclick = () => { this.selDrone = id; this.renderDrones(); };
      box.appendChild(el);
    }
  }

  changeSetting(key) {
    if (key === 'mode') settings.mode = settings.mode === 'ANGLE' ? 'ACRO' : 'ANGLE';
    if (key === 'analog') settings.analog = !settings.analog;
    if (key === 'sens') settings.sens = settings.sens >= 1.4 ? 0.6 : Math.round((settings.sens + 0.2) * 10) / 10;
    if (key === 'sound') { settings.sound = !settings.sound; this.audio.setMute(!settings.sound); }
    if (key === 'quality') { settings.quality = settings.quality ? 0 : 1; store.set('settings', settings); location.reload(); return; }
    this.input.sens = settings.sens;
    this.input.setMode(settings.mode);
    this.drone.mode = settings.mode;
    store.set('settings', settings);
  }

  best(id) { return store.get('best_' + id, 0); }

  toast(text, cls) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), cls === 'big' ? 2200 : 1600);
    setTimeout(() => t.remove(), 2600);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  shake(a) { this.shakeV = Math.max(this.shakeV, a); }

  setupMenuScene() {
    this.vehicles.clear();
    const r = this.vehicles.randomRoute(16);
    this.vehicles.spawn('tank', r, {});
    this.vehicles.spawn('apc', this.vehicles.randomRoute(16), {});
    this.vehicles.spawn('truck', this.vehicles.randomRoute(16), {});
    this.drone.mesh.visible = false;
    this.pad.visible = false;
  }

  // ---------- игровой цикл ----------
  start() {
    this.audio.unlock();
    store.set('lastMode', this.selMode);
    settings.drone = this.selDrone; store.set('settings', settings);
    $('menu').style.display = 'none'; $('result').style.display = 'none'; $('pause').style.display = 'none';
    $('hud').style.display = 'block'; $('touch').style.display = 'block';
    this.bombs.forEach(b => this.scene.remove(b.mesh)); this.bombs.length = 0;
    this.drone.setType(this.selDrone);
    this.drone.mode = settings.mode;
    this.M = setupMode(this, this.selMode);
    this.M.launched = 0;
    this.pad.visible = true;
    this.pad.position.copy(this.M.base);
    this.state = 'play';
    this.input.enabled = true;
    $('bFire').style.display = this.drone.p.warhead || this.drone.p.drops ? '' : 'none';
    $('bFire').textContent = this.drone.p.drops ? 'СБРОС' : 'ПОДРЫВ';
    this.launch();
    this.toast(this.M.def.name, 'big');
  }

  launch() {
    const M = this.M;
    const p = M.base.clone(); p.y = 0.15 + this.drone.p.radius + 0.02;
    this.drone.reset(p, M.heading);
    this.drone.armed = false;
    this.drone.mode = settings.mode;
    this.input.resetThrottle();
    this.cableN = 0; this.cableLen = 0; this.cable.visible = this.drone.type === 'fiber';
    this.addCablePoint(this.tmp.set(M.base.x - 3, 1, M.base.z + 1));
    this.lostT = 0;
    this.deadT = 0;
    this.bda = null;
    this.hurt = 0; this.hp = 1;
    this.inputQ.length = 0;
    M.launched++;
    if (M.id === 'race') { M.next = 0; M.started = false; M.lap = 0; this.updateGateColors(); }
    $('bMode').textContent = settings.mode;
  }

  addCablePoint(p) {
    if (this.cableN >= this.cableMax) return;
    const i = this.cableN * 3;
    this.cablePos[i] = p.x; this.cablePos[i + 1] = p.y; this.cablePos[i + 2] = p.z;
    this.cableN++;
    this.cable.geometry.setDrawRange(0, this.cableN);
    this.cableAttr.needsUpdate = true;
  }

  action(a) {
    if (this.state === 'play' && this.drone.alive) {
      if (a === 'drop') this.fire();
      if (a === 'cam') this.cam = this.cam === 'fpv' ? 'chase' : 'fpv';
      if (a === 'mode') { this.changeSetting('mode'); $('bMode').textContent = settings.mode; this.toast('РЕЖИМ ' + settings.mode + (settings.mode === 'ACRO' ? ': газ держится, углы руками' : ': стабилизация и удержание высоты'), ''); }
    }
    if (a === 'pause') { if (this.state === 'play') this.pause(true); else if (this.state === 'paused') this.pause(false); }
    if (a === 'restart' && (this.state === 'play' || this.state === 'result')) this.start();
  }

  pause(on) {
    this.state = on ? 'paused' : 'play';
    $('pause').style.display = on ? 'flex' : 'none';
  }

  toMenu() {
    this.state = 'menu';
    $('pause').style.display = 'none'; $('result').style.display = 'none';
    $('hud').style.display = 'none'; $('touch').style.display = 'none';
    $('menu').style.display = 'flex';
    this.input.enabled = false;
    this.gates.forEach(g => this.scene.remove(g.mesh)); this.gates.length = 0;
    this.bunker.visible = false;
    this.cable.visible = false;
    this.aim.visible = false;
    this.setupMenuScene();
  }

  fire() {
    const d = this.drone;
    if (d.p.drops) {
      if (d.dropsLeft <= 0) { this.toast('ВОГ ЗАКОНЧИЛИСЬ — СЯДЬ НА ПЛОЩАДКУ', 'bad'); return; }
      d.dropsLeft--;
      const bm = d.mesh.userData.bombs[d.dropsLeft];
      if (bm) bm.visible = false;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x3e4a2e }));
      mesh.castShadow = true;
      const pos = d.pos.clone(); pos.y -= 0.15;
      this.scene.add(mesh);
      this.bombs.push({ mesh, p: pos, v: d.vel.clone(), t: 0 });
      this.audio.beep(900, 0.06); this.audio.whistle();
    } else if (d.p.warhead) {
      this.detonate(null);
    }
  }

  detonate(direct) {
    const d = this.drone;
    this.boom(d.pos.clone(), d.p.blast, d.p.dmg, direct, 1.4);
    this.loseDrone('ПОДРЫВ', true);
  }

  boom(p, radius, dmg, direct, scale) {
    this.fx.explode(p, scale, {});
    this.audio.boom(p.distanceTo(this.camera.position), scale > 1.2);
    const killed = this.vehicles.blast(p, radius, dmg, direct);
    const dd = p.distanceTo(this.drone.pos);
    if (dd < 40) this.shake(Math.min(1.5, 12 / (dd + 4)));
    return killed;
  }

  onKill(v) {
    if (!this.M) return;
    this.M.kills++;
    const bonus = v.lastSpot ? ` · ${v.lastSpot}` : '';
    this.M.score += v.T.score + (v.lastSpot ? 100 : 0);
    this.toast(`${v.T.name} УНИЧТОЖЕН +${v.T.score}${bonus}`, 'good');
    this.audio.boom(v.mesh.position.distanceTo(this.camera.position), true);
  }

  loseDrone(reason, exploded) {
    const d = this.drone;
    if (!d.alive) return;
    d.alive = false;
    if (!exploded) { this.fx.spark(d.pos, 30); this.fx.explode(d.pos.clone(), 0.25, { debris: 4, noCrater: true }); this.audio.thud(20); }
    d.mesh.visible = false;
    this.aim.visible = false;
    this.deadReason = reason;
    this.deadT = 0;
    // камера «объективного контроля» со стороны
    const at = d.pos.clone();
    const dir = d.vel.clone(); dir.y = 0;
    if (dir.lengthSq() < 0.1) dir.set(0, 0, 1);
    dir.normalize();
    const from = at.clone().addScaledVector(dir, -22); from.y = Math.max(at.y, 0) + 14;
    this.bda = { at, from };
    if (this.M.drones !== Infinity) this.M.drones--;
    this.post.mat.uniforms.flash.value = exploded ? 1 : 0.3;
  }

  updateGateColors() {
    this.gates.forEach((g, i) => {
      g.mesh.material = i === this.M.next ? g.next : g.mat;
      g.mesh.visible = i >= this.M.next;
    });
  }

  loop() {
    let dt = this.clock.getDelta();
    if (dt > 0.1) dt = 0.1;
    this.perf(dt);
    const now = performance.now() / 1000;
    if (this.state === 'menu') this.menuUpdate(dt, now);
    else if (this.state === 'play') this.playUpdate(dt, now);
    else if (this.state === 'result') this.menuUpdate(dt * 0.3, now);
    this.fx.update(this.state === 'paused' ? 0 : dt, this.camera.position);
    this.vehicles.updateWrecks(this.state === 'paused' ? 0 : dt);
    this.drone.spin(dt);
    // тень следует за камерой
    const c = this.state === 'play' && this.drone.alive ? this.drone.pos : this.camera.position;
    const step = this.shadowExt * 2 / this.sunLight.shadow.mapSize.x;
    const tx = Math.round(c.x / step) * step, tz = Math.round(c.z / step) * step;
    this.sunLight.target.position.set(tx, 0, tz);
    this.sunLight.position.set(tx + this.sunDir.x * 200, this.sunDir.y * 200, tz + this.sunDir.z * 200);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.time.value = now;
    this.world.updateGrass(this.camera.position);
    // блик солнца в объективе
    const sp = this.tmp.copy(this.sunDir).multiplyScalar(500).add(this.camera.position);
    const sv = sp.clone().project(this.camera);
    this.sunT = (this.sunT || 0) - dt;
    if (this.sunT <= 0) { this.sunT = 0.2; this.sunOcc = this.world.lineClear(this.camera.position, this.tmp2.copy(this.sunDir).multiplyScalar(120).add(this.camera.position)) ? 1 : 0; }
    const vis = sv.z < 1 && Math.abs(sv.x) < 1.3 && Math.abs(sv.y) < 1.3 ? this.sunOcc : 0;
    this.post.mat.uniforms.sunPos.value.set(sv.x * 0.5 + 0.5, sv.y * 0.5 + 0.5, (this.post.mat.uniforms.sunPos.value.z || 0) + (vis - (this.post.mat.uniforms.sunPos.value.z || 0)) * Math.min(1, dt * 6));
    const u = this.post.mat.uniforms;
    u.time.value = now;
    u.flash.value *= Math.exp(-dt * 6);
    this.post.render(this.scene, this.camera);
  }

  perf(dt) {
    this.frameAcc += dt; this.frameN++;
    if (this.frameAcc > 1.5) {
      const avg = this.frameAcc / this.frameN;
      this.frameAcc = 0; this.frameN = 0;
      let pr = this.pr;
      if (avg > 0.024 && pr > 0.55) pr = Math.max(0.55, pr - 0.15);
      else if (avg < 0.0175 && pr < this.maxPR) pr = Math.min(this.maxPR, pr + 0.1);
      if (pr !== this.pr) { this.pr = pr; this.resize(); }
      this.fps = Math.round(1 / avg);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    const bw = Math.floor(w * this.pr), bh = Math.floor(h * this.pr);
    this.post.setSize(bw, bh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setScale(bh / (2 * Math.tan(this.camera.fov * Math.PI / 360)));
    this.ui.hc.width = w; this.ui.hc.height = h;
    $('rotate').style.display = isTouch && h > w ? 'flex' : 'none';
    this.input.R = Math.max(60, Math.min(95, h * 0.2));
  }

  menuUpdate(dt, now) {
    this.menuT += dt;
    this.vehicles.update(dt, null);
    // облёт посёлка
    const t = this.menuT * 0.05;
    const r = 120;
    this.camera.position.set(Math.cos(t) * r, 28 + Math.sin(t * 2) * 6, Math.sin(t) * r);
    this.camera.lookAt(Math.cos(t + 0.5) * 30, 4, Math.sin(t + 0.5) * 30);
    this.camera.fov = 60; this.camera.updateProjectionMatrix();
    const u = this.post.mat.uniforms;
    u.analog.value = 0.35; u.signal.value = 0.95; u.distort.value = 0.1; u.hurt.value = 0;
    this.audio.update(0, 0, 1, false);
  }

  playUpdate(dt, now) {
    const M = this.M, d = this.drone;
    for (const a of this.input.take()) this.action(a);
    let inp = this.input.poll(dt);
    M.time += dt;

    if (d.alive) {
      // сигнал: дальность, препятствия, РЭБ
      this.sigT = (this.sigT || 0) - dt;
      if (this.sigT <= 0) {
        this.sigT = 0.2;
        const op = this.tmp.set(M.base.x - 3.2, 4, M.base.z + 1);
        const dist = op.distanceTo(d.pos);
        let s = Math.min(1, Math.max(0, 1.15 - dist / 800));
        const los = this.world.lineClear(op, d.pos);
        if (!los) s *= dist < 60 ? 0.8 : 0.55;
        const jam = this.vehicles.jamAt(d.pos);
        if (jam > 0) s *= Math.max(0, 1 - jam * 1.25);
        this.jam = jam;
        if (d.type === 'fiber') s = 1;
        this.sigTarget = s;
      }
      this.signal += (this.sigTarget - this.signal) * Math.min(1, dt * 4);
      // задержка управления при плохом сигнале
      const delay = (1 - this.signal) * 0.25;
      this.inputQ.push({ t: now, thr: inp.thr, yaw: inp.yaw, pitch: inp.pitch, roll: inp.roll });
      while (this.inputQ.length > 1 && this.inputQ[1].t <= now - delay) this.inputQ.shift();
      inp = this.inputQ[0];
      if (this.signal < 0.08) {
        this.lostT += dt;
        if (this.lostT > 1.2) inp = { thr: 0, yaw: 0, pitch: 0, roll: 0 };
        if (this.lostT > 3.5) this.loseDrone('ПОТЕРЯ СВЯЗИ', false);
      } else this.lostT = 0;

      if (d.alive) {
        const ev = d.update(dt, inp, this.world, this.signal);
        if (!d.armed && d.pos.distanceTo(M.base) > 6) { d.armed = true; if (d.p.warhead) { this.toast('БЧ ВЗВЕДЕНА', ''); this.audio.beep(1400, 0.08); } }
        // техника
        const hitV = this.vehicles.collideSphere(d.pos, d.p.radius, this.tmpN);
        if (hitV) {
          if (d.p.warhead && d.armed) this.detonate(hitV);
          else { d.bounce(this.tmpN, false); }
        }
        if (d.alive && ev) {
          if (ev.type === 'detonate') this.detonate(null);
          else if (ev.type === 'crash') this.loseDrone(ev.reason ? ev.reason.toUpperCase() : 'РАЗБИЛСЯ', false);
          else if (ev.type === 'bump') { this.audio.thud(ev.speed); this.fx.spark(d.pos, 6); this.shake(0.3); }
        }
        if (d.alive && d.battery <= 0 && d.pos.y - this.world.heightAt(d.pos.x, d.pos.z) < 0.5) this.loseDrone('БАТАРЕЯ РАЗРЯЖЕНА', false);
        if (d.alive && Math.max(Math.abs(d.pos.x), Math.abs(d.pos.z)) > 640) this.loseDrone('ВНЕ ЗОНЫ', false);
        // кабель
        if (d.alive && d.type === 'fiber') {
          const last = this.tmp2.fromArray(this.cablePos, (this.cableN - 1) * 3);
          const seg = last.distanceTo(d.pos);
          if (seg > 2.5) { this.cableLen += seg; this.addCablePoint(d.pos); }
          if (this.cableLen > d.p.cable) this.loseDrone('ОБРЫВ КАБЕЛЯ', false);
        }
        // посадка на площадку бомбера = перезарядка
        if (d.alive && d.p.drops && d.dropsLeft < d.p.drops && d.speed() < 1 && d.pos.distanceTo(M.base) < 1.6 && d.pos.y < 1) {
          d.dropsLeft = d.p.drops; d.battery = 1;
          d.mesh.userData.bombs.forEach(b => (b.visible = true));
          this.toast('ПЕРЕЗАРЯДКА: 4 ВОГ, НОВАЯ БАТАРЕЯ', 'good');
          this.audio.beep(700, 0.1); this.audio.beep(1000, 0.1);
        }
        // ЗСУ попала
        if (d.alive && this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt);
      }
    } else {
      this.signal = 0;
    }

    this.vehicles.update(dt, d, e => {
      if (e === 'hit' && d.alive) {
        this.hp -= 0.26; this.hurt = 1; this.shake(0.5); this.audio.thud(30);
        d.rate.x += (Math.random() - 0.5) * 5; d.rate.z += (Math.random() - 0.5) * 5;
        if (this.hp <= 0) { if (d.p.warhead && d.armed) this.detonate(null); else this.loseDrone('СБИТ ЗСУ', false); }
        else this.toast('ПОПАДАНИЕ! ДРОН ПОВРЕЖДЁН', 'bad');
      }
    });

    this.updateBombs(dt);
    if (M.id === 'race' && d.alive) this.raceUpdate();
    M.update(dt);

    // смерть дрона → разведка → следующий
    if (!d.alive) {
      this.deadT += dt;
      if (this.deadT > 2.8 && !M.done) {
        if (M.drones > 0) this.launch();
        else { M.done = true; M.win = false; M.reason = 'дроны закончились'; }
      }
    }
    if (M.done && !this.resultShown) { this.resultT = (this.resultT || 0) + dt; if (this.resultT > (d.alive ? 1.2 : 2.2)) this.showResult(); }
    else if (!M.done) { this.resultShown = false; this.resultT = 0; }

    this.updateCamera(dt, now);
    this.updateAim();
    const u = this.post.mat.uniforms;
    const fpv = this.cam === 'fpv' && d.alive;
    u.analog.value = settings.analog ? (fpv ? 1 : (d.alive ? 0.25 : 0.5)) : 0;
    u.signal.value = d.alive ? this.signal : (this.deadT < 0.6 ? 0 : 0.85);
    u.distort.value = fpv && settings.analog ? 0.16 : 0;
    u.hurt.value = this.hurt || 0;
    this.audio.update(d.alive ? d.motor : 0, d.alive ? d.speed() : 0, d.alive ? this.signal : 1, d.alive);
    this.drawHUD(dt);
  }

  updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt;
      b.v.y -= 9.81 * dt;
      b.v.multiplyScalar(Math.exp(-dt * 0.05));
      b.p.addScaledVector(b.v, dt);
      b.mesh.position.copy(b.p);
      b.mesh.lookAt(this.tmp.copy(b.p).add(b.v));
      b.mesh.rotateX(Math.PI / 2);
      const gh = this.world.heightAt(b.p.x, b.p.z);
      const hv = this.vehicles.pointInside(b.p);
      if (b.p.y < gh + 0.05 || this.world.pointHit(b.p) || hv || b.t > 20) {
        this.boom(b.p.clone(), 6, 75, hv, 0.9);
        this.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
      }
    }
  }

  raceUpdate() {
    const M = this.M, d = this.drone;
    const g = this.gates[M.next];
    if (!g) return;
    const rel = this.tmp.copy(d.pos).sub(g.p);
    const side = rel.dot(g.n);
    if (g.side !== null && g.side < 0 && side >= 0) {
      const lat = rel.addScaledVector(g.n, -side).length();
      if (lat < g.r) {
        if (M.next === 0) { M.started = true; M.lap = 0; }
        M.next++;
        this.audio.beep(1200 + M.next * 40, 0.08, 0.1);
        if (M.next >= this.gates.length) {
          M.done = true; M.win = true;
          const best = this.best('race');
          if (!best || M.lap < best) { store.set('best_race', M.lap); this.toast('НОВЫЙ РЕКОРД ' + fmt(M.lap), 'big'); }
        }
        this.updateGateColors();
        const ng = this.gates[M.next]; if (ng) ng.side = null;
      }
    }
    g.side = side;
  }

  updateAim() {
    const d = this.drone;
    if (!d.alive || !d.p.drops || d.dropsLeft <= 0) { this.aim.visible = false; return; }
    const p = this.tmp.copy(d.pos), v = this.tmp2.copy(d.vel);
    for (let i = 0; i < 160; i++) {
      v.y -= 9.81 * 0.04; p.addScaledVector(v, 0.04);
      if (p.y < this.world.heightAt(p.x, p.z) + 0.05 || this.world.pointHit(p)) break;
    }
    this.aim.visible = true;
    this.aim.position.set(p.x, p.y + 0.1, p.z);
    const s = 0.6 + d.pos.y * 0.05;
    this.aim.scale.setScalar(s);
  }

  updateCamera(dt, now) {
    const cam = this.camera, d = this.drone;
    if (d.alive) {
      if (this.cam === 'fpv') {
        d.fpvCamera(cam);
        cam.fov = 74;
        d.mesh.visible = false;
      } else {
        d.mesh.visible = true;
        const back = this.tmp.set(0, 0, 1).applyQuaternion(d.quat); back.y = 0;
        if (back.lengthSq() < 0.01) back.set(0, 0, 1);
        back.normalize();
        const want = this.tmp2.copy(d.pos).addScaledVector(back, 3.2); want.y += 1.1;
        this.camPos.lerp(want, 1 - Math.exp(-dt * 8));
        // не уходить в стены
        const n = this.tmpN;
        this.world.collideSphere(this.camPos, 0.2, n);
        if (this.camPos.y < 0.3) this.camPos.y = 0.3;
        cam.position.copy(this.camPos);
        cam.lookAt(d.pos.x, d.pos.y + 0.3, d.pos.z);
        cam.fov = 70;
      }
    } else if (this.bda) {
      cam.position.copy(this.bda.from);
      cam.lookAt(this.bda.at);
      cam.fov = 50;
    }
    if (this.shakeV > 0.01) {
      cam.rotation.x += (Math.random() - 0.5) * this.shakeV * 0.06;
      cam.rotation.y += (Math.random() - 0.5) * this.shakeV * 0.06;
      this.shakeV *= Math.exp(-dt * 5);
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  showResult() {
    this.resultShown = true;
    const M = this.M;
    this.state = 'result';
    this.input.enabled = false;
    $('hud').style.display = 'none'; $('touch').style.display = 'none';
    let score = M.score;
    if (M.id === 'race') score = M.win ? fmt(M.lap) : '—';
    else {
      if (M.win) score += Math.max(0, Math.round(3000 - M.time * 5));
      if (M.id === 'defense') score += M.wave * 250;
      if (score > this.best(M.id)) store.set('best_' + M.id, score);
    }
    $('resTitle').textContent = M.win ? 'ЗАДАЧА ВЫПОЛНЕНА' : 'ПРОВАЛ';
    $('resTitle').className = M.win ? 'win' : 'lose';
    const lines = [
      `режим: ${M.def.name}`,
      M.reason && !M.win ? `причина: ${M.reason}` : '',
      `уничтожено: ${M.kills}`,
      M.id === 'defense' ? `волн отбито: ${Math.max(0, M.wave - 1)}` : '',
      `дронов запущено: ${M.launched}`,
      `время: ${fmt(M.time)}`,
      `очки: ${score}`,
    ].filter(Boolean);
    $('resBody').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    $('result').style.display = 'flex';
  }

  // ---------- OSD ----------
  drawHUD(dt) {
    const c = this.hctx, W = this.ui.hc.width, H = this.ui.hc.height;
    c.clearRect(0, 0, W, H);
    const d = this.drone, M = this.M;
    c.font = `bold ${Math.round(Math.max(11, H * 0.028))}px "Courier New", monospace`;
    c.textBaseline = 'middle';
    const txt = (s, x, y, al, col) => {
      c.textAlign = al || 'left';
      c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeText(s, x, y);
      c.fillStyle = col || '#fff'; c.fillText(s, x, y);
    };
    const fs = Math.max(11, H * 0.028);
    const top = Math.max(14, H * 0.05);
    // цели
    const cam = this.camera;
    const v3 = this.tmp;
    for (const v of this.vehicles.list) {
      if (!v.alive && !v.escaped) continue;
      if (!v.alive) continue;
      v3.copy(v.mesh.position); v3.y += 1.5;
      const dist = v3.distanceTo(cam.position);
      if (dist > 700) continue;
      v3.project(cam);
      if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) continue;
      const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
      const s = Math.max(10, Math.min(60, 900 / dist));
      const col = v.type === 'aa' ? '#ffd23a' : v.type === 'ew' ? '#c07bff' : v.target ? '#ff4436' : '#aaa';
      c.strokeStyle = col; c.lineWidth = 2;
      const k = s * 0.35;
      c.beginPath();
      c.moveTo(x - s, y - s + k); c.lineTo(x - s, y - s); c.lineTo(x - s + k, y - s);
      c.moveTo(x + s - k, y - s); c.lineTo(x + s, y - s); c.lineTo(x + s, y - s + k);
      c.moveTo(x - s, y + s - k); c.lineTo(x - s, y + s); c.lineTo(x - s + k, y + s);
      c.moveTo(x + s - k, y + s); c.lineTo(x + s, y + s); c.lineTo(x + s, y + s - k);
      c.stroke();
      if (dist < 220) txt(`${v.T.name} ${Math.round(dist)}м`, x, y + s + fs * 0.8, 'center', col);
    }
    // ворота гонки: стрелка на следующие
    if (M && M.id === 'race' && this.gates[M.next] && d.alive) {
      v3.copy(this.gates[M.next].p).project(cam);
      let x = v3.x, y = v3.y;
      if (v3.z > 1) { x = -x; y = -y; }
      if (v3.z > 1 || Math.abs(x) > 0.9 || Math.abs(y) > 0.9) {
        const a = Math.atan2(-y, x);
        const px = W / 2 + Math.cos(a) * H * 0.35, py = H / 2 + Math.sin(a) * H * 0.35;
        c.fillStyle = '#22ff88';
        c.beginPath(); c.moveTo(px + Math.cos(a) * 18, py + Math.sin(a) * 18); c.lineTo(px + Math.cos(a + 2.5) * 12, py + Math.sin(a + 2.5) * 12); c.lineTo(px + Math.cos(a - 2.5) * 12, py + Math.sin(a - 2.5) * 12); c.fill();
      }
    }
    if (!M) return;
    txt(M.text, W / 2, top, 'center');
    txt(M.sub, W / 2, top + fs * 1.3, 'center', '#cfd8c8');
    if (!d.alive) {
      const lost = this.deadT < 0.6;
      txt(lost ? 'НЕТ СИГНАЛА' : 'ОБЪЕКТИВНЫЙ КОНТРОЛЬ · ' + this.deadReason, W / 2, H * 0.42, 'center', lost ? '#fff' : '#ffcf5a');
      if (!lost && M.drones > 0 && !M.done) txt(`следующий дрон через ${Math.max(0, 2.8 - this.deadT).toFixed(1)}`, W / 2, H * 0.42 + fs * 1.5, 'center');
      return;
    }
    // OSD как в Betaflight
    const L = Math.max(16, W * 0.03 + (window.safeL || 0));
    const sp = d.speed() * 3.6;
    const agl = d.pos.y - this.world.heightAt(d.pos.x, d.pos.z);
    const home = d.pos.distanceTo(M.base);
    txt(`${settings.mode}  ${d.p.name}`, L, top);
    const vCol = d.voltage < 14 ? '#ff5544' : '#fff';
    txt(`${d.voltage.toFixed(1)}V  ${Math.round(d.battery * 100)}%`, L, top + fs * 1.3, 'left', vCol);
    if (d.p.warhead) txt(d.armed ? 'БЧ: ВЗВЕДЕНА' : 'БЧ: НА ПРЕДОХР.', L, top + fs * 2.6, 'left', d.armed ? '#ff6655' : '#9c9');
    if (d.p.drops) txt(`ВОГ: ${'●'.repeat(d.dropsLeft)}${'○'.repeat(d.p.drops - d.dropsLeft)}`, L, top + fs * 2.6, 'left', '#ffcc55');
    if (d.type === 'fiber') txt(`КАБЕЛЬ: ${Math.round(d.p.cable - this.cableLen)}м`, L, top + fs * 3.9, 'left', this.cableLen > d.p.cable * 0.85 ? '#ff5544' : '#e8e2b0');
    const R = W - L;
    const rssi = Math.round(this.signal * 99);
    txt(`RSSI ${rssi < 10 ? '0' : ''}${rssi}`, R, top, 'right', rssi < 35 ? '#ff5544' : '#fff');
    if (d.type === 'fiber') txt('ОПТИКА', R, top + fs * 1.3, 'right', '#e8e2b0');
    else if (this.jam > 0.05) txt(`РЭБ ${Math.round(this.jam * 100)}%`, R, top + fs * 1.3, 'right', '#c07bff');
    if (this.fps) txt(`${this.fps}fps`, R, top + fs * 2.6, 'right', '#888');
    const by = H - Math.max(18, H * 0.06);
    txt(`${Math.round(sp)}км/ч`, W / 2 - W * 0.13, by, 'center');
    txt(`${agl.toFixed(1)}м`, W / 2, by, 'center');
    txt(`⌂${Math.round(home)}м`, W / 2 + W * 0.13, by, 'center');
    if (this.signal < 0.3) txt(this.signal < 0.1 ? '!! ПОТЕРЯ СВЯЗИ !!' : 'СЛАБЫЙ СИГНАЛ', W / 2, H * 0.3, 'center', '#ff5544');
    if (d.battery < 0.2) txt('LOW BATTERY', W / 2, H * 0.3 + fs * 1.4, 'center', '#ff5544');
    // горизонт и прицел
    if (this.cam === 'fpv') {
      const cx = W / 2, cy = H / 2;
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx - 10, cy); c.lineTo(cx - 3, cy); c.moveTo(cx + 3, cy); c.lineTo(cx + 10, cy); c.moveTo(cx, cy - 10); c.lineTo(cx, cy - 3); c.moveTo(cx, cy + 3); c.lineTo(cx, cy + 10); c.stroke();
      const e = new THREE.Euler().setFromQuaternion(d.quat, 'YXZ');
      const pitch = e.x + d.p.tilt * Math.PI / 180, roll = e.z;
      c.save(); c.translate(cx, cy); c.rotate(roll);
      const off = Math.tan(Math.max(-1.2, Math.min(1.2, pitch))) * H / (2 * Math.tan(cam.fov * Math.PI / 360));
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.beginPath(); c.moveTo(-H * 0.32, off); c.lineTo(-H * 0.12, off); c.moveTo(H * 0.12, off); c.lineTo(H * 0.32, off); c.stroke();
      c.restore();
    }
    this.drawMap(c, W, H);
  }

  drawMap(c, W, H) {
    const S = Math.min(120, H * 0.24), x0 = Math.max(12, W * 0.03 + (window.safeL || 0)), y0 = H * 0.3;
    const sc = S / 760;
    const mx = x => x0 + (x + 380) * sc, my = z => y0 + (z + 380) * sc;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0, y0, S, S);
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1;
    c.beginPath();
    for (const r of [-180, -60, 60, 180]) { c.moveTo(mx(r), y0); c.lineTo(mx(r), y0 + S); c.moveTo(x0, my(r)); c.lineTo(x0 + S, my(r)); }
    c.stroke();
    for (const v of this.vehicles.list) {
      if (!v.alive) continue;
      c.fillStyle = v.type === 'aa' ? '#ffd23a' : v.type === 'ew' ? '#c07bff' : '#ff4436';
      c.fillRect(mx(v.mesh.position.x) - 2, my(v.mesh.position.z) - 2, 4, 4);
      if (v.jam) { c.strokeStyle = 'rgba(192,123,255,0.4)'; c.beginPath(); c.arc(mx(v.mesh.position.x), my(v.mesh.position.z), v.jam * sc, 0, 7); c.stroke(); }
    }
    if (this.M.id === 'race') {
      c.fillStyle = '#22ff88';
      const g = this.gates[this.M.next];
      if (g) { c.beginPath(); c.arc(mx(g.p.x), my(g.p.z), 3, 0, 7); c.fill(); }
    }
    c.fillStyle = '#ffaa22'; c.fillRect(mx(this.M.base.x) - 3, my(this.M.base.z) - 3, 6, 6);
    const d = this.drone;
    const f = d.forward(this.tmp);
    const a = Math.atan2(f.z, f.x);
    const px = mx(d.pos.x), py = my(d.pos.z);
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6); c.lineTo(px + Math.cos(a + 2.5) * 4, py + Math.sin(a + 2.5) * 4); c.lineTo(px + Math.cos(a - 2.5) * 4, py + Math.sin(a - 2.5) * 4); c.fill();
  }
}

function boot() {
  try { window.game = new Game(); }
  catch (e) {
    console.error(e);
    $('loading').innerHTML = 'ошибка запуска: ' + (e && e.message);
  }
}
// даём DOM нарисовать экран загрузки
setTimeout(boot, 30);
