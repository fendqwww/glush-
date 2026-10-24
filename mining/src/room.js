// 3D-подвал: стены, свет, декор, риги, охлаждение, эффекты
import * as THREE from 'three';
import * as T from './tex.js';
import { Particles } from './particles.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GPU_BY_ID, COINS, MONTHS_N } from './data.js';

const H = 2.7; // высота потолка
export const SPOTS = [
  [-1.6, -2.25], [0.4, -2.25], [2.4, -2.25], [2.5, 0.75],
  [5.4, -2.25], [7.6, -2.25], [9.8, -2.25], [5.4, 0.9], [7.6, 0.9], [9.8, 0.9],
  [-5.6, -2.25], [-7.8, -2.25], [-10.0, -2.25], [-5.6, 0.9], [-7.8, 0.9], [-10.0, 0.9],
];
export const SECTIONS = [{ x0: -4, x1: 4 }, { x0: 4, x1: 11.5 }, { x0: -11.5, x1: -4 }];
const MAXC = SPOTS.length * 6;

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

export class Room {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    this.root = new THREE.Group(); scene.add(this.root);
    this.time = 0;
    this.picks = [];
    this.rigViews = [];
    this.coolerViews = [];
    this.spinners = []; // вентиляторы охлаждения
    this.mats();
    this.lights();
    this.buildShell();
    this.buildDecor();
    this.buildInstanced();
    this.buildFx();
    this.season = -1;
    this.monthShown = -1;
  }

  // ===== материалы =====
  mats() {
    const env = 0.35;
    const S = p => { const e = p.env !== undefined ? p.env : env; p = Object.assign({}, p); delete p.env; const m = new THREE.MeshStandardMaterial(p); m.envMapIntensity = e; return m; };
    this.S = S;
    const floor = T.floorTex(); floor.repeat.set(1, 1);
    this.floorMat = S({ map: floor, roughness: 0.82, metalness: 0, env: 0.5 });
    this.wallT = T.wallTex();
    this.bunkerT = T.bunkerTex();
    this.wallMat = S({ map: this.wallT, roughness: 0.95, side: THREE.DoubleSide, env: 0.2 });
    this.bunkerMat = S({ map: this.bunkerT, roughness: 0.95, side: THREE.DoubleSide, env: 0.2 });
    this.capMat = S({ color: 0x2a2826, roughness: 1, env: 0.1 });
    this.metalT = T.metalTex();
    this.steel = S({ map: this.metalT, color: 0x5d6168, roughness: 0.5, metalness: 0.7 });
    this.darkSteel = S({ map: this.metalT, color: 0x2b2e33, roughness: 0.55, metalness: 0.6 });
    this.alu = S({ map: this.metalT, color: 0xc4c8ce, roughness: 0.32, metalness: 0.85, env: 0.6 });
    this.black = S({ color: 0x111214, roughness: 0.6, metalness: 0.2 });
    this.pipeMat = S({ color: 0x8c8f87, roughness: 0.7, metalness: 0.3 });
    this.rust = S({ color: 0x6b3a22, roughness: 0.9, metalness: 0.3 });
    this.wood = S({ color: 0x7b5634, roughness: 0.8 });
    this.cardboard = S({ color: 0xa47b4b, roughness: 0.95 });
    this.pcb = S({ map: T.pcbTex(), roughness: 0.6, metalness: 0.2 });
    this.red = S({ color: 0xb3221b, roughness: 0.5, metalness: 0.2 });
    this.blue = S({ color: 0x1d4d9a, roughness: 0.5 });
    this.fabric = S({ color: 0x3d4a5e, roughness: 1, env: 0.1 });
    this.glow = T.glowTex();
    this.foamT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#3a3d44'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const gr = g.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32); const f = (x + y) % 2; gr.addColorStop(0, f ? '#6a6e78' : '#2a2c31'); gr.addColorStop(1, f ? '#2a2c31' : '#646872'); g.fillStyle = gr; g.beginPath(); g.moveTo(x * 32 + 16, y * 32 + 2); g.lineTo(x * 32 + 30, y * 32 + 16); g.lineTo(x * 32 + 16, y * 32 + 30); g.lineTo(x * 32 + 2, y * 32 + 16); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  }

  box(w, h, d, mat, x, y, z, parent, cast = true, recv = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = recv;
    (parent || this.root).add(m);
    return m;
  }
  cyl(r, h, mat, x, y, z, parent, seg = 14, rt) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt !== undefined ? rt : r, r, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    (parent || this.root).add(m);
    return m;
  }
  // плоскость с UV в метрах (текстура = 4 м)
  plane(w, h, mat, parent, uvScale = 4, uvH) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / uvScale, uv.getY(i) * (uvH ? h / uvH : 1));
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    (parent || this.root).add(m);
    return m;
  }
  emissive(color, k) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }); }

  // ===== свет =====
  lights() {
    const sc = this.root;
    this.hemi = new THREE.HemisphereLight(0x8fa3c0, 0x2a2018, 0.7);
    sc.add(this.hemi);
    const sp = this.spot = new THREE.SpotLight(0xffd6a0, 60, 14, 1.25, 0.75, 1.3);
    sp.position.set(0.3, 2.42, -0.7);
    sp.target.position.set(0.3, 0, -0.9);
    sp.castShadow = true;
    sp.shadow.mapSize.set(this.q > 0 ? 1024 : 768, this.q > 0 ? 1024 : 768);
    sp.shadow.bias = -0.0004; sp.shadow.normalBias = 0.025;
    sp.shadow.camera.near = 0.2; sp.shadow.camera.far = 8;
    sc.add(sp, sp.target);
    this.secLights = [null];
    for (const [x, c] of [[7.6, 0xffe0b0], [-7.8, 0xd8e4ff]]) {
      const p = new THREE.PointLight(c, 0, 13, 1.3);
      p.position.set(x, 2.35, -0.6);
      sc.add(p); this.secLights.push(p);
    }
    this.alarm = new THREE.PointLight(0xff2010, 0, 9, 1.5);
    this.alarm.position.set(0, 2.2, 0.5); sc.add(this.alarm);
    this.fireL = new THREE.PointLight(0xff7a20, 0, 6, 1.6);
    sc.add(this.fireL);
    // свет из окна
    const wl = this.winLight = new THREE.SpotLight(0x9ab8ff, 6, 7, 0.5, 0.9, 1.4);
    wl.position.set(0.4, 2.3, -2.9); wl.target.position.set(1.0, 0, 0.3);
    sc.add(wl, wl.target);
  }

  // ===== коробка подвала =====
  buildShell() {
    this.sec = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(); this.root.add(g);
      const s = SECTIONS[i], w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
      const wm = i === 2 ? this.bunkerMat : this.wallMat;
      const fl = this.plane(w, 6, this.floorMat, g, 4, 4);
      fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0, 0);
      const bw = this.plane(w, H, wm, g, 4); bw.position.set(cx, H / 2, -3);
      bw.userData.wall = 1; bw.userData.keep = 1;
      // разрез: торцы стен и плиты пола
      this.box(w, 0.4, 0.3, this.capMat, cx, -0.2, 3.15, g, false, false);
      this.box(w + 0.01, 0.12, 0.3, this.capMat, cx, H + 0.06, -3.15, g, false, false);
      // потолок изнутри (снизу виден, сверху отсечён)
      const ce = this.plane(w, 6, S_CEIL(this), g, 4, 4); ce.rotation.x = Math.PI / 2; ce.position.set(cx, H, 0);
      ce.receiveShadow = false;
      // трубы вдоль задней стены
      for (const [y, r, m] of [[2.38, 0.07, this.pipeMat], [2.53, 0.05, this.rust]]) {
        const p = this.cyl(r, w, m, cx, y, -2.84, g, 12); p.rotation.z = Math.PI / 2;
        for (let x = s.x0 + 0.8; x < s.x1; x += 1.9) { const f = this.cyl(r * 1.4, 0.05, this.darkSteel, x, y, -2.84, g, 12); f.rotation.z = Math.PI / 2; }
      }
      g.userData.noMerge = 1;
      this.sec.push(g);
      if (i === 1) { const ew = this.plane(6, H, wm, g, 4); ew.rotation.y = -Math.PI / 2; ew.position.set(11.5, H / 2, 0); ew.userData.wall = 1; ew.userData.keep = 1; this.box(0.3, H + 0.12, 0.3, this.capMat, 11.6, H / 2, 3.15, g, false, false); this.box(0.3, 0.12, 6.3, this.capMat, 11.65, H + 0.06, 0, g, false, false); }
      if (i === 2) { const ew = this.plane(6, H, wm, g, 4); ew.rotation.y = Math.PI / 2; ew.position.set(-11.5, H / 2, 0); ew.userData.wall = 1; ew.userData.keep = 1; this.box(0.3, H + 0.12, 0.3, this.capMat, -11.6, H / 2, 3.15, g, false, false); this.box(0.3, 0.12, 6.3, this.capMat, -11.65, H + 0.06, 0, g, false, false); }
    }
    // перегородки с проёмами: x = 4 и x = -4
    this.parts = [];
    for (const [x, m] of [[4, this.wallMat], [-4, this.bunkerMat]]) {
      const g = new THREE.Group(); this.root.add(g);
      const z0 = -1.6, z1 = 0.4, dh = 2.1;
      const a = this.plane(z0 + 3, H, this.wallMat, g, 4); a.rotation.y = -Math.PI / 2; a.position.set(x, H / 2, (-3 + z0) / 2);
      const b = this.plane(3 - z1, H, this.wallMat, g, 4); b.rotation.y = -Math.PI / 2; b.position.set(x, H / 2, (z1 + 3) / 2);
      const l = this.plane(z1 - z0, H - dh, this.wallMat, g, 4); l.rotation.y = -Math.PI / 2; l.position.set(x, dh + (H - dh) / 2, (z0 + z1) / 2);
      const plug = this.plane(z1 - z0, dh, this.wallMat, g, 4); plug.userData.keep = 1; plug.rotation.y = -Math.PI / 2; plug.position.set(x, dh / 2, (z0 + z1) / 2);
      this.box(0.25, 0.12, 6.3, this.capMat, x, H + 0.06, 0, g, false, false);
      this.box(0.25, H + 0.12, 0.3, this.capMat, x, H / 2, 3.15, g, false, false);
      // обломки и рамка проёма — после пролома
      const open = new THREE.Group(); g.add(open);
      this.box(0.3, 0.12, z1 - z0 + 0.3, this.steel, x, dh + 0.06, (z0 + z1) / 2, open);
      this.box(0.3, dh, 0.12, this.steel, x, dh / 2, z0 - 0.06, open);
      this.box(0.3, dh, 0.12, this.steel, x, dh / 2, z1 + 0.06, open);
      for (let k = 0; k < 9; k++) { const r = this.box(0.12 + Math.random() * 0.2, 0.06 + Math.random() * 0.1, 0.1 + Math.random() * 0.2, this.capMat, x + (Math.random() - 0.5) * 0.9, 0.04, z1 + 0.3 + Math.random() * 0.6, open); r.rotation.y = Math.random() * 3; }
      open.visible = true; mergeStatic(open); open.visible = false; open.userData.noMerge = 1;
      mergeStatic(g); g.userData.noMerge = 1;
      this.parts.push({ g, plug, open });
    }
  }

  // ===== декор =====
  buildDecor() {
    const R = this.root;
    // дверь в щитовую
    const door = this.box(0.92, 2.02, 0.07, this.S({ color: 0x3e5a4a, roughness: 0.7, metalness: 0.5, map: this.metalT }), -3.1, 1.01, -2.96);
    this.box(0.04, 0.04, 0.12, this.alu, -2.75, 1.0, -2.88);
    this.box(1.04, 0.07, 0.1, this.darkSteel, -3.1, 2.06, -2.95);
    this.sign(T.labelTex([{ t: 'ПОСТОРОННИМ', f: 'bold 30px Arial' }, { t: 'ВХОД', f: 'bold 30px Arial' }, { t: 'ВОСПРЕЩЁН', f: 'bold 30px Arial' }], { bg: '#e9e1c8', border: '#b3221b', y0: 80 }), 0.34, 0.34, -3.1, 1.55, -2.92, 0);
    // окно под потолком
    const win = this.winMat = new THREE.MeshBasicMaterial({ map: T.windowTex(0), toneMapped: false });
    win.color.setScalar(1.6);
    const wp = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38), win); wp.position.set(0.4, 2.22, -2.99); R.add(wp);
    this.box(1.1, 0.06, 0.12, this.darkSteel, 0.4, 2.02, -2.94);
    this.box(1.1, 0.06, 0.12, this.darkSteel, 0.4, 2.43, -2.94);
    for (let i = 0; i < 6; i++) this.cyl(0.008, 0.4, this.darkSteel, -0.05 + i * 0.18, 2.22, -2.93, R, 6);
    this.seasonTex = [0, 1, 2, 3].map(s => T.windowTex(s));
    // луч света из окна
    const beamG = new THREE.CylinderGeometry(0.45, 1.4, 3.2, 20, 1, true);
    beamG.translate(0, -1.6, 0);
    const beamM = new THREE.MeshBasicMaterial({ color: 0x6c88c0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = this.beam = new THREE.Mesh(beamG, beamM);
    beam.position.set(0.4, 2.25, -2.9); beam.rotation.x = 0.75; R.add(beam);
    // щиток
    const pn = new THREE.Group(); pn.position.set(3.45, 1.5, -2.9); R.add(pn);
    this.box(0.55, 0.75, 0.16, this.S({ color: 0x8b8f93, roughness: 0.6, metalness: 0.5, map: this.metalT }), 0, 0, 0, pn);
    const pd = this.box(0.55, 0.75, 0.02, this.S({ color: 0x7c8084, roughness: 0.6, metalness: 0.5 }), 0.25, 0, 0.18, pn); pd.rotation.y = -1.9; pd.position.set(0.52, 0, 0.12);
    for (let i = 0; i < 8; i++) this.box(0.045, 0.09, 0.05, i % 3 === 0 ? this.red : this.black, -0.19 + i * 0.054, 0.12, 0.09, pn);
    for (let i = 0; i < 4; i++) this.box(0.06, 0.1, 0.05, this.black, -0.12 + i * 0.08, -0.12, 0.09, pn);
    this.panelLamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), this.emissive(0x30ff60, 3)); this.panelLamp.position.set(0.18, 0.28, 0.09); pn.add(this.panelLamp);
    this.panelPos = new THREE.Vector3(3.45, 1.5, -2.75);
    this.sign(T.labelTex([{ t: '⚡', f: 'bold 120px Arial', c: '#111', dy: 100 }, { t: '380 В', f: 'bold 44px Arial' }], { bg: '#f3c623', y0: 90 }), 0.18, 0.18, 3.45, 2.02, -2.95, 0);
    this.box(0.08, 1.15, 0.06, this.darkSteel, 3.45, 0.58, -2.92); // кабель-канал вниз
    // стол с монитором, лицом к камере
    const dk = new THREE.Group(); dk.position.set(-2.75, 0, 2.15); R.add(dk);
    this.box(1.3, 0.04, 0.65, this.wood, 0, 0.74, 0, dk);
    for (const [x, z] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]]) this.box(0.04, 0.72, 0.04, this.darkSteel, x, 0.36, z, dk);
    const crt = this.box(0.44, 0.36, 0.38, this.S({ color: 0xcfc6ad, roughness: 0.7 }), -0.15, 0.95, 0.02, dk);
    crt.rotation.y = Math.PI;
    this.box(0.3, 0.26, 0.2, this.S({ color: 0xbdb49b, roughness: 0.7 }), -0.15, 0.93, 0.27, dk);
    this.screenC = T.screenCanvas();
    this.screenT = T.canvasTex(this.screenC);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), new THREE.MeshBasicMaterial({ map: this.screenT, toneMapped: false }));
    scr.material.color.setScalar(1.5);
    scr.position.set(-0.15, 0.96, -0.175); scr.rotation.y = Math.PI; dk.add(scr);
    this.box(0.42, 0.02, 0.14, this.black, -0.15, 0.77, -0.2, dk);
    // банки энергетиков и кружка
    const can = this.S({ color: 0x1fb04a, roughness: 0.3, metalness: 0.8 });
    const can2 = this.S({ color: 0x1a4fd0, roughness: 0.3, metalness: 0.8 });
    for (let i = 0; i < 4; i++) this.cyl(0.033, 0.12, i % 2 ? can : can2, 0.32 + (i % 2) * 0.09, 0.82, -0.12 + Math.floor(i / 2) * 0.12, dk, 12);
    const cn = this.cyl(0.033, 0.12, can, 0.6, 0.035, 0.5, dk, 12); cn.rotation.z = Math.PI / 2;
    this.cyl(0.045, 0.1, this.S({ color: 0xe9e6dd, roughness: 0.4 }), 0.12, 0.81, 0.12, dk, 14);
    this.box(0.38, 0.05, 0.38, this.cardboard, 0.45, 0.785, 0.15, dk).rotation.y = 0.2; // коробка пиццы
    // стул
    const ch = new THREE.Group(); ch.position.set(-0.2, 0, -0.65); ch.rotation.y = 0.3; dk.add(ch);
    this.box(0.46, 0.08, 0.46, this.fabric, 0, 0.48, 0, ch);
    this.box(0.46, 0.55, 0.07, this.fabric, 0, 0.8, -0.22, ch);
    this.cyl(0.03, 0.42, this.darkSteel, 0, 0.23, 0, ch, 8);
    for (let i = 0; i < 5; i++) { const l = this.box(0.32, 0.03, 0.04, this.darkSteel, 0, 0.04, 0, ch); l.rotation.y = i / 5 * 6.28; l.translateX(0.14); }
    // ноутбук бота (появится с апгрейдом)
    const lap = this.botLap = new THREE.Group(); lap.position.set(0.35, 0.76, 0.12); dk.add(lap);
    this.box(0.32, 0.015, 0.22, this.darkSteel, 0, 0.008, 0, lap);
    const ls = this.box(0.32, 0.2, 0.012, this.darkSteel, 0, 0.11, 0.11, lap); ls.rotation.x = 0.25;
    this.botScr = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.17), this.emissive(0x30ff80, 1.2));
    this.botScr.position.set(0, 0.11, 0.1); this.botScr.rotation.set(0.25, Math.PI, 0); lap.add(this.botScr);
    lap.visible = false;
    // плакат и календарь
    this.sign(T.posterTex(), 0.5, 0.7, -3.97, 1.6, -2.1, Math.PI / 2);
    this.calC = document.createElement('canvas'); this.calC.width = 192; this.calC.height = 256;
    this.calT = T.canvasTex(this.calC);
    this.sign(this.calT, 0.3, 0.4, -2.35, 1.45, -2.96, 0);
    // матрас в углу
    const mt = new THREE.Group(); mt.position.set(3.05, 0, 2.15); mt.rotation.y = 0.08; R.add(mt);
    this.box(0.9, 0.16, 1.9, this.S({ color: 0x8d8778, roughness: 1, env: 0.1 }), 0, 0.08, 0, mt);
    this.box(0.92, 0.06, 1.2, this.S({ color: 0x6a2f2f, roughness: 1, env: 0.1 }), 0, 0.19, 0.3, mt).rotation.y = 0.05;
    this.box(0.5, 0.1, 0.3, this.S({ color: 0xd8d2c4, roughness: 1, env: 0.1 }), 0, 0.21, -0.7, mt);
    // коробки из-под видеокарт
    for (let i = 0; i < 5; i++) { const b = this.box(0.32, 0.12, 0.42, this.S({ color: [0x262b31, 0x1c1c1c, 0xb11d1d][i % 3], roughness: 0.7 }), -3.55 + (i % 2) * 0.05, 0.06 + i * 0.12, 0.6 + (i % 3) * 0.03); b.rotation.y = (Math.random() - 0.5) * 0.4; }
    this.box(0.5, 0.45, 0.45, this.cardboard, -3.55, 0.225, -0.2).rotation.y = 0.15;
    // лампы-подвесы
    this.lamps = [];
    for (const [x, z, sec] of [[0.3, -0.7, 0], [7.6, -0.6, 1], [-7.8, -0.6, 2]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); R.add(g);
      this.cyl(0.006, 0.25, this.black, 0, H - 0.125, 0, g, 6);
      const sh = this.cyl(0.2, 0.14, this.S({ color: sec === 2 ? 0x2f3a2c : 0x24343b, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }), 0, H - 0.3, 0, g, 18, 0.05);
      sh.material.side = THREE.DoubleSide;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), this.emissive(0xffd9a0, 8)); bulb.position.y = H - 0.36; g.add(bulb);
      this.lamps.push({ g, bulb, sec });
      if (sec) this.sec[sec].add(g);
    }
    this.buildSectionDecor();
    for (const sg of this.sec) mergeStatic(sg);
    // огнетушители и камера (апгрейды)
    this.extG = new THREE.Group(); R.add(this.extG);
    for (const [x, z] of [[-2.45, -2.88], [3.85, 1.4], [10.5, -2.88], [-9.0, -2.88]]) {
      this.cyl(0.07, 0.42, this.red, x, 0.25, z, this.extG, 12);
      this.cyl(0.02, 0.06, this.black, x, 0.49, z, this.extG, 8);
    }
    this.extG.visible = false;
    this.camG = new THREE.Group(); this.camG.position.set(3.85, 2.5, 2.8); R.add(this.camG);
    const cb = this.box(0.12, 0.08, 0.2, this.S({ color: 0xe6e6e6, roughness: 0.4 }), 0, 0, 0, this.camG); cb.rotation.set(0.5, 0.8, 0);
    this.camLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), this.emissive(0xff2020, 4)); this.camLed.position.set(-0.05, -0.03, -0.07); this.camG.add(this.camLed);
    this.camG.visible = false;
    // теплообменник «тёплый пол»
    this.dryerG = new THREE.Group(); this.dryerG.position.set(-1.0, 0, 1.9); R.add(this.dryerG);
    this.box(0.7, 0.9, 0.4, this.S({ color: 0xd04020, roughness: 0.5, metalness: 0.4 }), 0, 0.45, 0, this.dryerG);
    this.cyl(0.06, H - 0.9, this.red, 0.2, 0.9 + (H - 0.9) / 2, 0, this.dryerG, 10);
    this.cyl(0.06, H - 0.9, this.blue, -0.2, 0.9 + (H - 0.9) / 2, 0, this.dryerG, 10);
    this.dryerG.visible = false;
    for (const o of [this.extG, this.camG, this.dryerG, this.botLap]) o.userData.noMerge = 1;
    mergeStatic(this.root);
  }

  buildSectionDecor() {
    const B = this.sec[1], C = this.sec[2];
    // отсек B: ящики, вентрешётка
    for (let i = 0; i < 4; i++) this.box(0.6, 0.4, 0.4, this.wood, 10.8, 0.2 + (i % 2) * 0.4, 2.0 + Math.floor(i / 2) * 0.45, B).rotation.y = (Math.random() - 0.5) * 0.2;
    const gr = this.box(0.6, 0.4, 0.03, this.darkSteel, 11.48, 2.0, 1.6, B); gr.rotation.y = Math.PI / 2;
    this.sign(T.labelTex([{ t: 'НЕ КУРИТЬ', f: 'bold 36px Arial', c: '#b3221b' }], { bg: '#efe9d8', border: '#b3221b', y0: 128, h: 256 }), 0.3, 0.3, 11.45, 1.6, -1.6, -Math.PI / 2, B);
    // отсек C: гермодверь, нары, противогазы
    const hd = new THREE.Group(); hd.position.set(-9.2, 0, -2.92); C.add(hd);
    this.box(1.5, 2.1, 0.14, this.S({ color: 0x55604f, roughness: 0.6, metalness: 0.6, map: this.metalT }), 0, 1.05, 0, hd);
    const wh = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), this.red); wh.position.set(0, 1.1, 0.12); hd.add(wh);
    for (const y of [0.4, 1.7]) this.box(0.24, 0.12, 0.12, this.darkSteel, -0.62, y, 0.1, hd);
    const bunk = new THREE.Group(); bunk.position.set(-11.0, 0, 2.0); C.add(bunk);
    for (const y of [0.45, 1.35]) { this.box(0.8, 0.06, 1.9, this.wood, 0, y, 0, bunk); this.box(0.75, 0.08, 1.8, this.fabric, 0, y + 0.07, 0, bunk); }
    for (const [x, z] of [[-0.38, -0.92], [0.38, -0.92], [-0.38, 0.92], [0.38, 0.92]]) this.box(0.05, 1.7, 0.05, this.darkSteel, x, 0.85, z, bunk);
    for (let i = 0; i < 4; i++) { const gm = this.cyl(0.08, 0.14, this.S({ color: 0x3f4a3a, roughness: 0.9 }), -6.5 + i * 0.3, 1.6, -2.9, C, 10); gm.rotation.x = Math.PI / 2; }
    this.sign(T.labelTex([{ t: 'ГРАЖДАНСКАЯ', f: 'bold 26px Arial' }, { t: 'ОБОРОНА', f: 'bold 40px Arial', c: '#b3221b' }, { t: 'ГО', f: '900 70px Arial', dy: 70 }], { bg: '#f1e7c6', y0: 70 }), 0.45, 0.45, -11.45, 1.6, -0.8, Math.PI / 2, C);
  }

  sign(t, w, h, x, y, z, ry, parent) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.S({ map: t, roughness: 0.8, env: 0.1 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
    (parent || this.root).add(m);
    return m;
  }

  // ===== инстансы видеокарт =====
  buildInstanced() {
    const bodyM = this.S({ map: T.shroudTex(), roughness: 0.45, metalness: 0.35, env: 0.5 });
    this.cardI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyM, MAXC);
    this.cardI.castShadow = true; this.cardI.receiveShadow = true;
    const fanM = this.S({ map: T.fanTex(), alphaTest: 0.5, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
    this.fanI = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 20), fanM, MAXC * 3);
    this.ledI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAXC);
    for (const m of [this.cardI, this.fanI, this.ledI]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(m); }
    this.cardI.setColorAt(0, tmpC.set(0xffffff));
    this.ledI.setColorAt(0, tmpC.set(0xffffff));
    this.cards = []; // { rigIdx, card, base pos, fans: [index], len }
    this.fanData = [];
  }

  // ===== эффекты =====
  buildFx() {
    this.smoke = new Particles(this.root, 260, T.smokeTex(), false);
    this.fire = new Particles(this.root, 160, T.flameTex(), true);
    this.sparks = new Particles(this.root, 120, this.glow, true);
    this.dust = new Particles(this.root, 240, this.glow, true);
    this.bubbles = new Particles(this.root, 200, this.glow, true);
    this.fireRig = null; this.fireT = 0;
  }

  setScale(px) { for (const p of [this.smoke, this.fire, this.sparks, this.dust, this.bubbles]) p.mat.uniforms.scale.value = px; }

  // ===== риги =====
  rebuild(sim) {
    for (const v of this.rigViews) { this.root.remove(v.g); v.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.rigViews = [];
    this.picks = [];
    this.cards = [];
    let ci = 0, fi = 0;
    // свободные места
    for (let s = 0; s < sim.spots(); s++) {
      if (sim.rigs.some(r => r.spot === s)) continue;
      const [x, z] = SPOTS[s];
      const g = new THREE.Group(); g.position.set(x, 0, z); this.root.add(g);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.6), this.spotMat || (this.spotMat = this.makeSpotMat()));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.01; g.add(m);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.6, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.3; hit.userData = { spot: s, free: true }; g.add(hit);
      this.picks.push(hit);
      this.rigViews.push({ g, free: true, spot: s });
    }
    sim.rigs.forEach((r, ri) => {
      const [x, z] = SPOTS[r.spot];
      const g = new THREE.Group(); g.position.set(x, 0, z); this.root.add(g);
      this.buildRig(g, r);
      this.cable(g, x, z);
      mergeStatic(g);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.55; hit.userData = { rig: ri, spot: r.spot }; g.add(hit);
      this.picks.push(hit);
      // свечение под ригом
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshBasicMaterial({ map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.6 }));
      gl.rotation.x = -Math.PI / 2; gl.position.y = 0.012; g.add(gl);
      const sel = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.78, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffae1a).multiplyScalar(2.5), transparent: true, depthWrite: false, toneMapped: false }));
      sel.rotation.x = -Math.PI / 2; sel.position.y = 0.015; sel.visible = false; g.add(sel);
      const view = { g, rig: r, ri, glow: gl, sel, ledStrip: g.userData.strip, tank: g.userData.tank, cards: [] };
      // карты
      r.cards.forEach((c, k) => {
        const G = GPU_BY_ID[c.id];
        const cx = x - 0.4 + k * 0.16, cy = 0.56 + G.len / 2, cz = z + 0.02;
        const entry = { ci, card: c, G, x: cx, y: cy, z: cz, fans: [], rig: r };
        tmpM.compose(tmpP.set(cx, cy, cz), tmpQ.identity(), tmpS.set(0.11, G.len, 0.045));
        this.cardI.setMatrixAt(ci, tmpM);
        const col = new THREE.Color(G.col).lerp(new THREE.Color(0xffffff), 0.15);
        this.cardI.setColorAt(ci, col);
        tmpM.compose(tmpP.set(cx + 0.058, cy, cz), tmpQ.identity(), tmpS.set(0.006, G.len * 0.82, 0.03));
        this.ledI.setMatrixAt(ci, tmpM);
        const nf = G.fans;
        for (let f = 0; f < nf; f++) {
          const fy = cy - G.len / 2 + G.len * (f + 0.5) / nf;
          entry.fans.push(fi);
          this.fanData[fi] = { x: cx, y: fy, z: cz + 0.0235, d: Math.min(0.095, G.len / nf * 0.92), a: Math.random() * 6, card: c, rig: r };
          fi++;
        }
        this.cards.push(entry); view.cards.push(entry);
        ci++;
      });
      this.rigViews.push(view);
    });
    this.cardI.count = ci; this.ledI.count = ci; this.fanI.count = fi;
    this.fanN = fi;
    this.cardI.instanceMatrix.needsUpdate = true; this.ledI.instanceMatrix.needsUpdate = true;
    if (this.cardI.instanceColor) this.cardI.instanceColor.needsUpdate = true;
    this.cardI.computeBoundingSphere && (this.cardI.boundingSphere = null);
  }

  makeSpotMat() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,190,60,0.9)'; g.lineWidth = 5; g.setLineDash([16, 10]); g.strokeRect(6, 6, 244, 116);
    g.fillStyle = 'rgba(255,190,60,0.9)'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', 128, 56);
    g.font = 'bold 20px Arial'; g.fillText('МЕСТО ПОД РИГ', 128, 104);
    const t = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) });
  }

  buildRig(g, r) {
    // стеллаж
    const st = this.steel;
    for (const [x, z] of [[-0.53, -0.25], [0.53, -0.25], [-0.53, 0.25], [0.53, 0.25]]) this.box(0.035, 0.55, 0.035, st, x, 0.275, z, g);
    this.box(1.12, 0.03, 0.56, this.darkSteel, 0, 0.54, 0, g);
    this.box(1.12, 0.025, 0.56, this.darkSteel, 0, 0.12, 0, g);
    // материнка и блоки питания
    const mb = this.box(0.3, 0.012, 0.24, this.pcb, 0.25, 0.562, -0.12, g);
    mb.castShadow = false;
    const psuM = r.psu ? this.S({ color: 0x8a6d1d, roughness: 0.35, metalness: 0.8 }) : this.black;
    this.box(0.16, 0.09, 0.18, psuM, -0.3, 0.18, 0, g);
    if (r.psu) this.box(0.16, 0.09, 0.18, psuM, -0.1, 0.18, 0, g);
    const grl = new THREE.Mesh(new THREE.CircleGeometry(0.035, 14), this.darkSteel); grl.position.set(-0.3, 0.226, 0); grl.rotation.x = -Math.PI / 2; g.add(grl);
    // алюминиевая рама
    if (!r.imm) {
      for (const [x, z] of [[-0.52, -0.2], [0.52, -0.2], [-0.52, 0.2], [0.52, 0.2]]) this.box(0.025, 0.42, 0.025, this.alu, x, 0.76, z, g);
      this.box(1.06, 0.025, 0.025, this.alu, 0, 0.97, -0.2, g);
      this.box(1.06, 0.025, 0.025, this.alu, 0, 0.97, 0.2, g);
      this.box(1.06, 0.02, 0.03, this.alu, 0, 0.575, 0.02, g); // рейка под карты
    } else {
      const tank = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.44, 0.5), new THREE.MeshStandardMaterial({ color: 0x52b8ff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, emissive: 0x0b3a66, emissiveIntensity: 0.6, depthWrite: false }));
      tank.position.set(0, 0.78, 0.02); tank.renderOrder = 1; g.add(tank);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(tank.geometry), new THREE.LineBasicMaterial({ color: 0x9fd8ff }));
      edges.position.copy(tank.position); g.add(edges);
      this.box(1.1, 0.03, 0.52, this.darkSteel, 0, 1.0, 0.02, g); // крышка
      g.userData.tank = tank;
    }
    // светодиодная планка статуса
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0x40ff80, toneMapped: false }));
    strip.position.set(0, 0.52, 0.285); g.add(strip);
    g.userData.strip = strip;
    // райзеры
    for (let k = 0; k < r.cards.length; k++) this.box(0.08, 0.02, 0.06, this.blue, -0.4 + k * 0.16, 0.565, 0.1, g, false);
    // жгут питания
    const pts = [new THREE.Vector3(-0.3, 0.23, -0.05), new THREE.Vector3(-0.35, 0.4, -0.22), new THREE.Vector3(-0.1, 0.6, -0.15), new THREE.Vector3(0.2, 0.62, -0.06)];
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 5), this.black);
    tube.castShadow = true; g.add(tube);
  }

  cable(g, x, z) {
    const P = this.panelPos;
    const back = -2.8;
    const pts = [new THREE.Vector3(-0.3, 0.15, -0.1), new THREE.Vector3(-0.3, 0.02, -0.4), new THREE.Vector3(0, 0.02, back - z + 0.05)];
    const L = new THREE.Vector3(P.x - x, 0.03, back - z);
    pts.push(new THREE.Vector3((L.x) * 0.5, 0.02, back - z + 0.02), new THREE.Vector3(L.x - 0.1, 0.03, back - z), new THREE.Vector3(L.x, 0.4, back - z - 0.05));
    const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.014, 5), this.black);
    t.receiveShadow = true;
    g.add(t);
  }

  // ===== охлаждение =====
  rebuildCoolers(sim) {
    for (const v of this.coolerViews) this.root.remove(v);
    this.coolerViews = []; this.spinners = [];
    const open = s => s === 0 || (s === 1 && sim.room >= 1) || (s === 2 && sim.room >= 2);
    const take = (list, n) => list.filter(a => open(a.sec)).slice(0, n);
    // вытяжные вентиляторы на стене
    const fans = take([
      { sec: 0, x: 1.6, y: 2.15, z: -2.97, ry: 0 }, { sec: 0, x: -0.95, y: 2.15, z: -2.97, ry: 0 },
      { sec: 0, x: 3.97, y: 2.1, z: 2.0, ry: -Math.PI / 2 }, { sec: 0, x: -3.97, y: 2.1, z: 1.2, ry: Math.PI / 2 },
    ], sim.coolers.fan);
    for (const a of fans) {
      const g = new THREE.Group(); g.position.set(a.x, a.y, a.z); g.rotation.y = a.ry; this.root.add(g); this.coolerViews.push(g);
      this.box(0.46, 0.46, 0.1, this.S({ color: 0xd9d9d0, roughness: 0.5, metalness: 0.3 }), 0, 0, 0.05, g);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.2, 24), this.darkSteel); ring.position.z = 0.105; g.add(ring);
      const bl = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), this.S({ map: T.fanTex(), alphaTest: 0.5, color: 0xbfbfbf, side: THREE.DoubleSide }));
      bl.position.z = 0.09; g.add(bl);
      this.spinners.push({ m: bl, k: 14 });
    }
    // короба промышленной вытяжки под потолком
    const hoods = take([{ sec: 0, x: 3.3 }, { sec: 0, x: -3.3 }, { sec: 1, x: 11.0 }, { sec: 2, x: -11.0 }, { sec: 1, x: 6.5 }], sim.coolers.hood);
    const galv = this.S({ map: this.metalT, color: 0xb0b5b8, roughness: 0.4, metalness: 0.85, env: 0.6 });
    for (const a of hoods) {
      // короб идёт от задней стены к зрителю, чтобы не загораживать риги
      const g = new THREE.Group(); g.position.set(a.x, 0, -2.75); g.rotation.y = -Math.PI / 2; this.root.add(g); this.coolerViews.push(g);
      const len = 5.3;
      this.box(len, 0.32, 0.42, galv, len / 2, H - 0.2, 0, g);
      for (let x = 0.9; x < len - 0.3; x += 1.1) this.box(0.4, 0.02, 0.3, this.darkSteel, x, H - 0.37, 0, g, false);
      for (let x = 1.4; x < len; x += 1.1) this.box(0.04, 0.36, 0.46, this.darkSteel, x, H - 0.2, 0, g);
      this.box(0.5, 0.6, 0.6, galv, 0.25, H - 0.35, 0, g);
      const bl = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), this.S({ map: T.fanTex(), alphaTest: 0.5, side: THREE.DoubleSide }));
      bl.position.set(0.505, H - 0.35, 0); bl.rotation.y = Math.PI / 2; g.add(bl);
      this.spinners.push({ m: bl, k: 22 });
    }
    // кондиционеры
    const acs = take([
      { sec: 0, x: 3.9, y: 2.2, z: -1.0, ry: -Math.PI / 2 }, { sec: 0, x: -3.9, y: 2.2, z: 2.2, ry: Math.PI / 2 },
      { sec: 1, x: 11.4, y: 2.2, z: -0.4, ry: -Math.PI / 2 }, { sec: 2, x: -11.4, y: 2.2, z: 0.6, ry: Math.PI / 2 },
      { sec: 0, x: 2.4, y: 1.6, z: -2.9, ry: 0 }, { sec: 0, x: -1.6, y: 1.6, z: -2.9, ry: 0 },
    ], sim.coolers.ac);
    const white = this.S({ color: 0xf2f2ee, roughness: 0.35, metalness: 0.05 });
    for (const a of acs) {
      const g = new THREE.Group(); g.position.set(a.x, a.y, a.z); g.rotation.y = a.ry; this.root.add(g); this.coolerViews.push(g);
      this.box(0.9, 0.3, 0.2, white, 0, 0, 0.1, g);
      this.box(0.86, 0.04, 0.04, this.darkSteel, 0, -0.13, 0.19, g, false);
      const led = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.015), this.emissive(0x40a0ff, 4)); led.position.set(0.3, 0.05, 0.201); g.add(led);
      g.userData.ac = true;
    }
    // чиллеры
    const ch = take([{ sec: 2, x: -7.0, z: 2.3 }, { sec: 2, x: -9.5, z: 2.3 }], sim.coolers.chiller);
    for (const a of ch) {
      const g = new THREE.Group(); g.position.set(a.x, 0, a.z); this.root.add(g); this.coolerViews.push(g);
      this.box(1.7, 1.25, 0.85, this.S({ color: 0x3c6e9e, roughness: 0.5, metalness: 0.5, map: this.metalT }), 0, 0.625, 0, g);
      for (let i = 0; i < 2; i++) {
        const bl = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), this.S({ map: T.fanTex(), alphaTest: 0.5, side: THREE.DoubleSide }));
        bl.position.set(-0.42 + i * 0.84, 1.26, 0); bl.rotation.x = -Math.PI / 2; g.add(bl);
        this.spinners.push({ m: bl, k: 18, ax: 'z' });
      }
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.1), this.emissive(0x30ff70, 3)); p.position.set(0.55, 0.95, 0.426); g.add(p);
      this.cyl(0.07, H - 1.25, this.blue, 0.6, 1.25 + (H - 1.25) / 2, -0.3, g, 10);
    }
  }

  applyUpgrades(sim) {
    for (let i = 0; i < 3; i++) this.sec[i].visible = i <= sim.room;
    for (const [i, p] of this.parts.entries()) {
      const opened = sim.room >= i + 1;
      p.plug.visible = !opened; p.open.visible = opened;
    }
    for (let i = 1; i < 3; i++) this.secLights[i].intensity = sim.room >= i ? 40 : 0;
    this.extG.visible = !!sim.up.sensor;
    this.camG.visible = !!sim.up.cams;
    this.botLap.visible = !!sim.up.bot;
    this.dryerG.visible = !!sim.up.dryer;
    const m = sim.up.insul ? this.foamMat || (this.foamMat = this.S({ map: this.foamT, roughness: 1, side: THREE.DoubleSide, env: 0.05 })) : null;
    this.root.traverse(o => {
      if (!o.userData.wall) return;
      if (m) { if (!o.userData.orig) o.userData.orig = o.material; o.material = m; const uv = o.geometry.attributes.uv; if (!o.userData.uvx) { o.userData.uvx = 1; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 10, uv.getY(k) * 7); uv.needsUpdate = true; } }
    });
  }

  select(spot) { for (const v of this.rigViews) if (v.sel) v.sel.visible = v.rig && v.rig.spot === spot; this.selSpot = spot; }

  // ===== каждый кадр =====
  update(sim, dt, cam) {
    this.time += dt;
    const t = this.time;
    const powered = sim.powered();
    // вентиляторы карт
    let maxT = 0, hotRig = null;
    for (let i = 0; i < this.fanN; i++) {
      const f = this.fanData[i];
      const on = powered && f.rig.on && f.rig.off <= 0 && !f.rig.imm;
      const spd = on ? 12 + Math.max(0, f.card.temp - 40) * 1.3 : 0;
      f.v = (f.v || 0) + (spd - (f.v || 0)) * Math.min(1, dt * 2);
      f.a += f.v * dt;
      tmpE.set(0, 0, f.a);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(f.x, f.y, f.z), tmpQ, tmpS.set(f.d, f.d, f.d));
      this.fanI.setMatrixAt(i, tmpM);
    }
    this.fanI.instanceMatrix.needsUpdate = true;
    // светодиоды
    for (const e of this.cards) {
      const c = e.card, r = e.rig;
      const on = powered && r.on && r.off <= 0;
      if (!on) tmpC.setRGB(0.02, 0.02, 0.02);
      else if (c.temp > 85) { const b = (Math.sin(t * 12) > 0) ? 3 : 0.3; tmpC.setRGB(b, 0.05 * b, 0.02 * b); }
      else if (c.temp > 75) tmpC.setRGB(3.4, 1.8, 0.08);
      else tmpC.setHSL((t * 0.08 + e.ci * 0.07) % 1, 1, 0.5).multiplyScalar(3.5);
      this.ledI.setColorAt(e.ci, tmpC);
      if (c.temp > maxT) { maxT = c.temp; hotRig = e; }
      // дым от перегрева
      if (on && c.temp > 90 && Math.random() < dt * (c.temp - 88) * 0.5) this.smoke.spawn(e.x + (Math.random() - 0.5) * 0.05, e.y + 0.18, e.z, (Math.random() - 0.5) * 0.08, 0.25 + Math.random() * 0.15, 0, 3, 0.25, 0.35, 0.33, 0.32, 0.55, 3, 0.3);
      // пузыри в иммерсии
      if (on && r.imm && Math.random() < dt * 4) this.bubbles.spawn(e.x + (Math.random() - 0.5) * 0.1, 0.58, e.z + (Math.random() - 0.5) * 0.3, 0, 0.35, 0, 1.1, 0.025, 0.6, 0.85, 1.0, 0.7);
    }
    if (this.ledI.instanceColor) this.ledI.instanceColor.needsUpdate = true;
    // статус ригов
    for (const v of this.rigViews) {
      if (!v.rig) continue;
      const r = v.rig, works = sim.rigWorks(r);
      let mt = 0; for (const c of r.cards) mt = Math.max(mt, c.temp);
      const col = !works ? (r.cards.length ? [0.5, 0.5, 0.55] : [0.25, 0.25, 0.25]) : mt > 85 ? [3, 0.15, 0.05] : mt > 75 ? [2.5, 1.4, 0.1] : [0.3, 2.4, 0.9];
      const blink = works && mt > 85 ? (0.6 + 0.4 * Math.sin(t * 10)) : 1;
      v.ledStrip.material.color.setRGB(col[0] * blink * 1.5, col[1] * blink * 1.5, col[2] * blink * 1.5);
      const gk = works ? 0.22 : 0.03;
      v.glow.material.color.setRGB(col[0] * gk, col[1] * gk, col[2] * gk);
      if (v.sel) v.sel.material.opacity = 0.6 + 0.4 * Math.sin(t * 4);
    }
    // вентиляторы охлаждения
    for (const s of this.spinners) s.m.rotation.z += (powered ? s.k : 0) * dt;
    // лампы
    const flick = sim.blackout ? 0 : (powered ? 1 : 0.15);
    const heat = Math.max(0, Math.min(1, (sim.roomT - 28) / 15));
    let fl = 1;
    if (sim.line === 0 && sim.flow.kw > sim.lineKw() * 0.85 && Math.random() < 0.08) fl = 0.4 + Math.random() * 0.5;
    this.spot.intensity = 60 * flick * fl;
    this.spot.color.setRGB(1, 0.84 - heat * 0.2, 0.63 - heat * 0.3);
    for (let i = 1; i < 3; i++) if (sim.room >= i) this.secLights[i].intensity = 40 * flick * fl;
    for (const l of this.lamps) l.bulb.material.color.setRGB(8 * flick * fl, 6.8 * flick * fl, 5 * flick * fl);
    this.hemi.intensity = 0.7 * (0.3 + 0.7 * flick);
    // тревога
    const danger = maxT > 90 || sim.raidT > 0 || sim.tripped;
    this.alarm.intensity = danger ? Math.max(0, Math.sin(t * 7)) * 14 : 0;
    // щиток
    this.panelLamp.material.color.setRGB(sim.tripped ? (Math.sin(t * 9) > 0 ? 4 : 0.2) : 0.2, sim.tripped ? 0.1 : 3, 0.2);
    if ((sim.tripped && Math.random() < dt * 3) || (sim.flow.kw > sim.lineKw() * 0.9 && Math.random() < dt * 2)) this.sparkBurst(this.panelPos, 12);
    this.camLed.material.color.setRGB(Math.sin(t * 3) > 0.3 ? 4 : 0.2, 0, 0);
    if (this.botLap.visible) this.botScr.material.color.setRGB(0.2, 1.2 + 0.3 * Math.sin(t * 5), 0.5);
    // пыль в луче
    if (Math.random() < dt * 20) this.dust.spawn(-1 + Math.random() * 3, 0.3 + Math.random() * 2, -2.6 + Math.random() * 3, (Math.random() - 0.5) * 0.04, 0.02, (Math.random() - 0.5) * 0.04, 8, 0.02, 1, 0.9, 0.75, 0.35);
    // огонь
    if (this.fireT > 0) {
      this.fireT -= dt;
      const p = this.firePos;
      for (let i = 0; i < 3; i++) this.fire.spawn(p.x + (Math.random() - 0.5) * 0.9, p.y + Math.random() * 0.3, p.z + (Math.random() - 0.5) * 0.3, 0, 0.8 + Math.random() * 0.6, 0, 0.6 + Math.random() * 0.4, 0.4, 2.5, 1.2, 0.4, 0.9, -0.4, 1);
      if (Math.random() < dt * 20) this.smoke.spawn(p.x, p.y + 0.6, p.z, (Math.random() - 0.5) * 0.3, 0.6, 0, 4, 0.5, 0.12, 0.11, 0.1, 0.8, 3, 0.2);
      this.fireL.position.set(p.x, p.y + 0.5, p.z + 0.3);
      this.fireL.intensity = (8 + Math.random() * 8) * Math.min(1, this.fireT);
    } else this.fireL.intensity = 0;
    for (const p of [this.smoke, this.fire, this.sparks, this.dust, this.bubbles]) p.update(dt);
    // окно и календарь
    const m = sim.month();
    const season = m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3;
    if (season !== this.season) { this.season = season; this.winMat.map = this.seasonTex[season]; this.winMat.needsUpdate = true; this.winLight.color.set(season === 0 ? 0xb8ccff : 0x9ab8ff); }
    if (m !== this.monthShown) { this.monthShown = m; this.drawCalendar(sim); }
    this.beam.material.opacity = 0.035 + 0.015 * Math.sin(t * 0.7);
    return { maxT, hotRig };
  }

  sparkBurst(p, n) {
    for (let i = 0; i < n; i++) this.sparks.spawn(p.x + (Math.random() - 0.5) * 0.2, p.y + (Math.random() - 0.5) * 0.2, p.z + 0.05, (Math.random() - 0.5) * 2, Math.random() * 1.5, Math.random() * 1.2, 0.4 + Math.random() * 0.4, 0.035, 3, 1.8, 0.6, 1, -0.5, 0.5, 6);
  }
  startFire(r) {
    const [x, z] = SPOTS[r.spot];
    this.firePos = new THREE.Vector3(x, 0.6, z);
    this.fireT = 4;
  }
  smokePuff(r) {
    const [x, z] = SPOTS[r.spot];
    for (let i = 0; i < 30; i++) this.smoke.spawn(x + (Math.random() - 0.5), 0.6 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, 3, 0.5, 0.7, 0.7, 0.7, 0.4, 2, 0.4);
  }

  drawCalendar(sim) {
    const g = this.calC.getContext('2d'), w = 192, h = 256;
    g.fillStyle = '#f2ede0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3221b'; g.fillRect(0, 0, w, 56);
    g.fillStyle = '#fff'; g.font = 'bold 28px Arial'; g.textAlign = 'center'; g.fillText(MONTHS_N[sim.month()], w / 2, 38);
    g.fillStyle = '#333'; g.font = '16px Arial';
    for (let i = 0; i < 30; i++) g.fillText(String(i + 1), 20 + (i % 7) * 25, 84 + Math.floor(i / 7) * 34);
    g.fillStyle = '#111'; g.font = 'bold 18px Arial'; g.fillText(String(sim.date().getUTCFullYear()), w / 2, 246);
    this.calT.needsUpdate = true;
  }

  // экран старого монитора: график монеты
  drawScreen(sim, id) {
    const g = this.screenC.getContext('2d'), w = 512, h = 320;
    g.fillStyle = '#031107'; g.fillRect(0, 0, w, h);
    const c = COINS.find(x => x.id === id);
    const hs = sim.hist[id].slice(-90);
    let lo = Infinity, hi = -Infinity; for (const v of hs) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    g.strokeStyle = 'rgba(60,255,120,0.15)'; g.lineWidth = 1;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
    g.strokeStyle = c.color; g.lineWidth = 4; g.beginPath();
    hs.forEach((v, i) => { const x = 20 + i / (hs.length - 1) * (w - 40), y = h - 30 - (v - lo) / (hi - lo + 1e-9) * (h - 110); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    const last = hs[hs.length - 1], prev = hs[hs.length - 2] || last;
    const ch = (last / prev - 1) * 100;
    g.fillStyle = '#5cff8a'; g.font = 'bold 34px Courier New, monospace'; g.textAlign = 'left';
    g.fillText(id + ' $' + fmtP(last), 20, 44);
    g.fillStyle = ch >= 0 ? '#5cff8a' : '#ff5a4a';
    g.fillText((ch >= 0 ? '▲' : '▼') + Math.abs(ch).toFixed(1) + '%', 330, 44);
    // сканлайны
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
    this.screenT.needsUpdate = true;
  }
}


// склейка статичной геометрии по материалам: сотни мешей → десяток draw call'ов
function mergeStatic(container) {
  container.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const groups = new Map(), kill = [];
  const walk = o => {
    for (const ch of o.children) {
      if (ch.userData.noMerge || ch.userData.keep || ch.isInstancedMesh || ch.isPoints || ch.isLine) continue;
      if (ch.isMesh) {
        const m = ch.material;
        if (!m.isMeshStandardMaterial || m.transparent || !ch.visible) continue;
        const g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        if (!g.attributes.uv) continue;
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
        const key = m.uuid + (ch.castShadow ? 'c' : '');
        if (!groups.has(key)) groups.set(key, { m, cast: ch.castShadow, list: [] });
        groups.get(key).list.push(g);
        kill.push(ch);
      }
      if (ch.children.length) walk(ch);
    }
  };
  walk(container);
  if (kill.length < 2) return;
  for (const k of kill) { k.parent.remove(k); }
  for (const { m, cast, list } of groups.values()) {
    const geo = list.length > 1 ? mergeGeometries(list, false) : list[0];
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    container.add(mesh);
  }
}

function fmtP(v) { return v >= 100 ? Math.round(v).toLocaleString('en').replace(/,/g, ' ') : v >= 1 ? v.toFixed(2) : v.toFixed(4); }

let ceilMat = null;
function S_CEIL(room) { if (!ceilMat) ceilMat = room.S({ color: 0x8a867c, roughness: 1, env: 0.1 }); return ceilMat; }
