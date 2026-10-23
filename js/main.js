import * as THREE from 'three';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { Sound, Voice } from './audio.js';
import { INTRO, NOTES, HINTS, OBJECTIVES } from './story.js';

// ---------------------------------------------------------------- база
const $ = id => document.getElementById(id);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
};
let QUALITY = store.get('gl_q') || (IS_TOUCH ? 'low' : 'high');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY === 'high' && !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY === 'high' ? 1.75 : 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = QUALITY === 'high';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
scene.fog = new THREE.FogExp2(0x06080d, 0.05);
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const sound = new Sound();
const voice = new Voice($('sub'));

// ---------------------------------------------------------------- процедурные текстуры
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function speckle(g, w, h, n, col, a0, a1, s0 = 1, s1 = 3) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${rnd(a0, a1)})`; const s = rnd(s0, s1); g.fillRect(rnd(0, w), rnd(0, h), s, s); }
}
const TX = {
  wallpaper: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3d4a3b'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(20,28,20,.35)'; g.fillRect(x, 0, 6, h); g.fillStyle = 'rgba(200,190,140,.08)'; g.fillRect(x + 14, 0, 2, h); }
    g.fillStyle = 'rgba(190,170,110,.18)';
    for (let y = 16; y < h; y += 40) for (let x = 16; x < w; x += 32) { g.beginPath(); g.ellipse(x + (y / 40 % 2) * 16, y, 4, 7, 0, 0, 7); g.fill(); }
    for (let i = 0; i < 6; i++) { const gr = g.createRadialGradient(rnd(0, w), rnd(0, h), 2, rnd(0, w), rnd(0, h), rnd(30, 80)); gr.addColorStop(0, 'rgba(60,45,20,.25)'); gr.addColorStop(1, 'rgba(60,45,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    speckle(g, w, h, 900, '0,0,0', 0.05, 0.2);
  }, 3, 1),
  wood: canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 32) {
      const b = rnd(55, 80); g.fillStyle = `rgb(${b},${b * 0.68},${b * 0.45})`; g.fillRect(0, y, w, 32);
      for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(30,18,8,${rnd(.1, .3)})`; g.beginPath(); const yy = y + rnd(2, 30); g.moveTo(0, yy); g.bezierCurveTo(w / 3, yy + rnd(-3, 3), w * 2 / 3, yy + rnd(-3, 3), w, yy); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y, w, 2); g.fillRect(rnd(0, w), y, 2, 32);
    }
  }, 6, 6),
  boards: canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 26) {
      const b = rnd(38, 55); g.fillStyle = `rgb(${b},${b * 0.8},${b * 0.66})`; g.fillRect(0, y, w, 26);
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, y + 24, w, 2);
      speckle(g, w, 26, 60, '0,0,0', 0.1, 0.3, 1, 2);
    }
  }, 4, 1),
  grass: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1b2116'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4000, '60,72,40', 0.2, 0.6, 1, 3); speckle(g, w, h, 1500, '10,12,8', 0.3, 0.7, 2, 5);
  }, 30, 30),
  ceiling: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#5b5a55'; g.fillRect(0, 0, w, h); speckle(g, w, h, 500, '20,20,15', 0.05, 0.2, 2, 6); }, 4, 4),
  stone: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2a2826'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32 % 2) * 32; x < w + 64; x += 64) {
      const b = rnd(55, 85); g.fillStyle = `rgb(${b},${b * 0.95},${b * 0.88})`; g.fillRect(x - 64 + 2, y + 2, 60, 28);
    }
    speckle(g, w, h, 1500, '0,0,0', 0.1, 0.35, 1, 4);
    g.fillStyle = 'rgba(40,60,30,.25)'; for (let i = 0; i < 8; i++) g.fillRect(rnd(0, w), rnd(h * .6, h), rnd(10, 40), rnd(10, 40));
  }, 3, 1),
  dirt: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#2b241d'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1500, '70,60,45', 0.2, 0.5, 1, 3); }, 4, 4),
  roof: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#26221f'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y, w, 2); } speckle(g, w, h, 400, '80,70,60', .1, .3); }, 8, 4),
  brick: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2a1712'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 16; x < w + 32; x += 32) { const b = rnd(70, 100); g.fillStyle = `rgb(${b},${b * .45},${b * .35})`; g.fillRect(x - 32 + 1, y + 1, 30, 14); }
    speckle(g, w, h, 600, '0,0,0', .2, .5);
  }, 1, 1),
};
const MAT = {
  wall: new THREE.MeshStandardMaterial({ map: TX.wallpaper, roughness: 0.95 }),
  outer: new THREE.MeshStandardMaterial({ map: TX.boards, roughness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ map: TX.wood, roughness: 0.8 }),
  ceil: new THREE.MeshStandardMaterial({ map: TX.ceiling, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ map: TX.stone, roughness: 0.95 }),
  dirt: new THREE.MeshStandardMaterial({ map: TX.dirt, roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ map: TX.grass, roughness: 1 }),
  roof: new THREE.MeshStandardMaterial({ map: TX.roof, roughness: 0.9, side: THREE.DoubleSide }),
  brick: new THREE.MeshStandardMaterial({ map: TX.brick, roughness: 0.9 }),
  darkwood: new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.7 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.4, metalness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xa88a4a, roughness: 0.35, metalness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0b1424, emissive: 0x16233a, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: 0x7a1d1d, roughness: 0.8 }),
};

// ---------------------------------------------------------------- коллизии
const colliders = []; // {x0,x1,z0,z1,y0,y1,on,walk,wall,box}
function addCol(x0, x1, z0, z1, y0, y1, o = {}) {
  const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, on: true, walk: !!o.walk, wall: !!o.wall, cam: o.cam !== false };
  c.box = new THREE.Box3(new THREE.Vector3(c.x0, y0, c.z0), new THREE.Vector3(c.x1, y1, c.z1));
  colliders.push(c); return c;
}
function box(x0, x1, y0, y1, z0, z1, mat, o = {}) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  // повтор текстуры по размеру
  if (o.uv !== false) {
    const uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      const sx = nx > 0.5 ? (z1 - z0) : (x1 - x0), sy = ny > 0.5 ? (z1 - z0) : (y1 - y0);
      uv.setXY(i, uv.getX(i) * sx / 3, uv.getY(i) * sy / 3);
    }
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.receiveShadow = true; m.castShadow = o.cast !== false;
  scene.add(m);
  if (o.col !== false) m.userData.col = addCol(x0, x1, z0, z1, y0, y1, o);
  return m;
}
// стена: внутренняя отделка + наружная для внешних стен
function wall(x0, x1, z0, z1, y0 = 0, y1 = 2.8, outerSide = null, mat = MAT.wall) {
  let m = mat;
  if (outerSide) {
    const arr = [mat, mat, MAT.ceil, MAT.ceil, mat, mat];
    const idx = { px: 0, nx: 1, pz: 4, nz: 5 }[outerSide];
    arr[idx] = MAT.outer; m = arr;
  }
  return box(x0, x1, y0, y1, z0, z1, m, { wall: true });
}

// ---------------------------------------------------------------- загрузка моделей
const loader = new GLTFLoader();
const GLB = {};
const MODEL_LIST = ['hero', 'skel', 'mage', 'anya', 'axe_1handed', 'Skeleton_Blade',
  'armchair', 'bed_double_A', 'book_set', 'cabinet_medium', 'cabinet_small_decorated', 'chair_A_wood', 'couch_pillows', 'lamp_standing', 'lamp_table',
  'pictureframe_large_A', 'pictureframe_medium', 'pictureframe_standing_A', 'rug_rectangle_stripes_A', 'rug_oval_A', 'shelf_B_large_decorated', 'shelf_A_big',
  'table_medium_long', 'table_low', 'table_small', 'candle_triple', 'candle_melted', 'skull', 'skull_candle', 'coffin_decorated', 'tree_dead_large', 'tree_dead_medium',
  'fence', 'fence_broken', 'grave_A', 'lantern_standing', 'pumpkin_orange_jackolantern', 'ribcage', 'bone_A', 'shrine_candles', 'post_lantern'];
async function loadAll(onProg) {
  let n = 0;
  await Promise.all(MODEL_LIST.map(name => new Promise(res => {
    // модели лежат как base64-текст: хостинг отдаёт только «веб»-типы файлов
    const fail = e => { console.warn('model', name, e); onProg(++n / MODEL_LIST.length); res(); };
    fetch(`./mt/${name}.txt`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => {
      const bin = atob(t.trim()), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      loader.parse(buf.buffer, './mt/', g => { GLB[name] = g; onProg(++n / MODEL_LIST.length); res(); }, fail);
    }).catch(fail);
  })));
}
function prop(name, x, y, z, rot = 0, s = 0.7, o = {}) {
  const g = GLB[name]; if (!g) return null;
  const m = g.scene.clone(true);
  m.position.set(x, y, z); m.rotation.y = rot; m.scale.setScalar(s);
  m.traverse(c => { if (c.isMesh) { c.castShadow = o.cast !== false; c.receiveShadow = true; } });
  scene.add(m);
  if (o.col !== false) {
    m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m);
    if (b.max.y - b.min.y > 0.15) {
      const sh = o.shrink ?? 0.06;
      m.userData.col = addCol(b.min.x + sh, b.max.x - sh, b.min.z + sh, b.max.z - sh, b.min.y, b.max.y, { walk: b.max.y - y < 1.05, cam: false });
    }
  }
  return m;
}

// ---------------------------------------------------------------- освещение
const hemi = new THREE.HemisphereLight(0x5a6e96, 0x14121a, 1.05);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9db4e6, 0.7);
moon.position.set(-25, 35, 10);
moon.castShadow = QUALITY === 'high';
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 });
moon.shadow.bias = -0.0008;
scene.add(moon); scene.add(moon.target); moon.target.position.set(0, 0, 8);
const flash = new THREE.SpotLight(0xfff1d8, 40, 30, 0.6, 0.65, 1.5);
flash.castShadow = QUALITY === 'high';
flash.shadow.mapSize.set(1024, 1024); flash.shadow.bias = -0.0005; flash.shadow.camera.near = 0.3;
scene.add(flash); scene.add(flash.target);
function pointLight(color, intensity, dist, x, y, z) {
  const l = new THREE.PointLight(color, intensity, dist, 1.8); l.position.set(x, y, z); scene.add(l);
  l.userData.base = intensity; return l;
}
const L = {};

// ---------------------------------------------------------------- мир
const world = { doors: {}, nodes: {}, hatch: null };
function buildWorld() {
  // земля
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), MAT.grass);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2, 18), MAT.dirt);
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.01, 18); path.receiveShadow = true; scene.add(path);
  // пол дома и потолок
  box(-10, 10, -0.25, 0.02, -8, 8, MAT.floor, { col: false });
  box(-10.2, 10.2, 2.8, 3.0, -8.2, 8.2, MAT.ceil, { col: false, cast: false });
  // крыльцо
  box(-2, 2, 0, 0.16, 8.1, 9.6, MAT.darkwood, { walk: true });
  box(-2, -1.85, 0, 2.8, 9.4, 9.55, MAT.darkwood); box(1.85, 2, 0, 2.8, 9.4, 9.55, MAT.darkwood);
  box(-2.2, 2.2, 2.8, 2.95, 8.1, 9.8, MAT.roof, { col: false });
  // наружные стены
  wall(-10.1, -0.7, 7.9, 8.1, 0, 2.8, 'pz'); wall(0.7, 10.1, 7.9, 8.1, 0, 2.8, 'pz'); box(-0.7, 0.7, 2.15, 2.8, 7.9, 8.1, MAT.outer, { col: false });
  wall(-10.1, 10.1, -8.1, -7.9, 0, 2.8, 'nz');
  wall(-10.1, -9.9, -8, 8, 0, 2.8, 'nx'); wall(9.9, 10.1, -8, 8, 0, 2.8, 'px');
  // внутренние стены с проёмами
  wall(-3.1, -2.9, -8, -4.7); wall(-3.1, -2.9, -3.3, 4.3); wall(-3.1, -2.9, 5.7, 8);
  wall(2.9, 3.1, -8, -4.7); wall(2.9, 3.1, -3.3, 4.3); wall(2.9, 3.1, 5.7, 8);
  wall(-10, -3, -0.1, 0.1); wall(3, 10, -0.1, 0.1);
  for (const [x, z] of [[-3, 5], [3, 5], [-3, -4], [3, -4]]) box(x - 0.1, x + 0.1, 2.15, 2.8, z - 0.7, z + 0.7, MAT.wall, { col: false });
  // окна
  const win = (x, z, ry) => {
    const g = new THREE.Group();
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), MAT.glass); g.add(gl);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 0.08), MAT.darkwood); fr.position.y = 0.58; g.add(fr);
    const fr2 = fr.clone(); fr2.position.y = -0.58; g.add(fr2);
    const fv = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), MAT.darkwood); g.add(fv);
    const fh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), MAT.darkwood); g.add(fh);
    g.position.set(x, 1.5, z); g.rotation.y = ry; scene.add(g);
    const g2 = g.clone(); g2.position.set(x + Math.sin(ry) * -0.24, 1.5, z + Math.cos(ry) * -0.24); g2.rotation.y = ry + Math.PI; scene.add(g2);
  };
  win(-6.5, 8.12, 0); win(6.5, 8.12, 0); win(-10.12, 4, -Math.PI / 2); win(10.12, -4, Math.PI / 2); win(-6.5, -8.12, Math.PI); win(6.5, -8.12, Math.PI); win(10.12, 1.5, Math.PI / 2);
  // крыша (двускатная)
  const roofG = new THREE.PlaneGeometry(21.2, 9.4);
  const r1 = new THREE.Mesh(roofG, MAT.roof); r1.position.set(0, 4.25, 4.15); r1.rotation.x = -Math.PI / 2 + 0.33; r1.castShadow = true; scene.add(r1);
  const r2 = new THREE.Mesh(roofG, MAT.roof); r2.position.set(0, 4.25, -4.15); r2.rotation.x = -Math.PI / 2 - 0.33; r2.castShadow = true; scene.add(r2);
  const tri = new THREE.Shape(); tri.moveTo(-8.2, 0); tri.lineTo(8.2, 0); tri.lineTo(0, 2.75); tri.lineTo(-8.2, 0);
  for (const x of [-10.1, 10.1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), MAT.outer); m.position.set(x, 2.95, 0); m.rotation.y = Math.PI / 2; m.material.side = THREE.DoubleSide; scene.add(m); }
  box(-6, -5.2, 3.5, 6.2, -3, -2.2, MAT.brick, { col: false });

  // двери
  world.doors.front = makeDoor(-0.7, 8, 1.4, 'x', -1);
  world.doors.study = makeDoor(3, -4.7, 1.4, 'z', 1);

  // двор: забор и ворота
  addCol(-15, 15, 27.3, 27.8, 0, 3, { cam: false }); addCol(-15, 15, -13.8, -13.3, 0, 3, { cam: false });
  addCol(-15.3, -14.8, -14, 28, 0, 3, { cam: false }); addCol(14.8, 15.3, -14, 28, 0, 3, { cam: false });
  for (let x = -12; x <= 12; x += 4) prop(x === 0 ? 'fence_broken' : 'fence', x, 0, 27.5, 0, 1, { col: false });
  for (let z = -12; z <= 24; z += 4) { prop('fence', -15, 0, z, Math.PI / 2, 1, { col: false }); prop('fence', 15, 0, z, Math.PI / 2, 1, { col: false }); }
  for (let x = -12; x <= 12; x += 4) prop('fence', x, 0, -13.5, 0, 1, { col: false });
  for (const [x, z, n, r] of [[-11, 21, 'tree_dead_large', 0.4], [10.5, 15, 'tree_dead_large', 2], [-12, 4, 'tree_dead_medium', 1], [12, -6, 'tree_dead_large', 3], [-4, 22, 'tree_dead_medium', 2.2], [7, 23, 'tree_dead_medium', 5], [-12.5, -10, 'tree_dead_large', 1.3]]) prop(n, x, 0, z, r, 1.2, { shrink: 0.5 });
  // могила бабушки: стоит лицом к дому
  prop('grave_A', -7.5, 0, 16.5, Math.PI, 0.8);
  prop('candle_melted', -6.6, 0, 15.7, 0, 0.6, { col: false });
  prop('lantern_standing', 2, 0, 19, 0, 0.8);
  prop('post_lantern', -2, 0, 12, 0, 0.8);
  prop('pumpkin_orange_jackolantern', 1.4, 0.16, 8.9, 0.4, 0.35);
  // почтовый ящик
  box(1.75, 1.85, 0, 1.0, 25.4, 25.5, MAT.darkwood);
  box(1.55, 2.05, 1.0, 1.35, 25.25, 25.75, MAT.metal);
  L.lantern = pointLight(0xffa04a, 4, 9, 2, 1.2, 19);
  L.porch = pointLight(0xffb070, 0, 6, 0, 2.3, 9);

  // прихожая
  prop('rug_rectangle_stripes_A', 0, 0.02, 4, Math.PI / 2, 0.7, { col: false });
  prop('rug_rectangle_stripes_A', 0, 0.02, -3.5, Math.PI / 2, 0.7, { col: false });
  prop('table_small', 2.3, 0, 7.2, 0, 0.7);
  prop('lamp_standing', -2.5, 0, 1.4, 0, 0.7);
  prop('pictureframe_medium', 2.88, 1.6, 1.5, -Math.PI / 2, 0.8, { col: false });
  prop('pictureframe_medium', -2.88, 1.6, -1.5, Math.PI / 2, 0.8, { col: false });
  // рюкзак Ани
  const bp = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), new THREE.MeshStandardMaterial({ color: 0x8a2e3b, roughness: 0.8 })); b1.position.y = 0.25; bp.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x6a1e2b })); b2.position.set(0, 0.18, 0.16); bp.add(b2);
  bp.position.set(-2.3, 0, 7.1); bp.rotation.y = 0.5; bp.traverse(c => c.castShadow = true); scene.add(bp);

  // кухня
  prop('table_medium_long', -6.5, 0, 3.4, 0, 0.7);
  prop('chair_A_wood', -7.4, 0, 2.4, 0, 0.7, { col: false }); prop('chair_A_wood', -5.6, 0, 4.4, Math.PI, 0.7, { col: false });
  prop('chair_A_wood', -7.4, 0, 4.4, Math.PI, 0.7, { col: false });
  prop('cabinet_medium', -9.6, 0, 6.6, Math.PI / 2, 0.75); prop('cabinet_medium', -9.6, 0, 4.9, Math.PI / 2, 0.75);
  prop('lamp_table', -6.2, 0.7, 3.4, 0, 0.32, { col: false });
  world.jam = prop('shelf_B_large_decorated', -5.5, 1.05, 0.1, 0, 0.9, { col: false });
  prop('shelf_B_large_decorated', -8, 1.6, 0.1, 0, 0.8, { col: false });
  world.axeProp = prop('axe_1handed', -5.2, 1.25, 0.25, 0, 0.6, { col: false });
  if (world.axeProp) world.axeProp.rotation.z = 1.4;

  // гостиная
  prop('couch_pillows', 6.5, 0, 7.3, Math.PI, 0.7);
  prop('table_low', 6.5, 0, 5.8, 0, 0.7);
  prop('rug_oval_A', 6.5, 0.02, 5.2, 0, 0.8, { col: false });
  prop('armchair', 9.0, 0, 6.6, -2.3, 0.7);
  prop('shelf_A_big', 4.2, 1.7, 7.85, Math.PI, 0.7, { col: false });
  prop('book_set', 4.2, 1.82, 7.7, Math.PI, 0.6, { col: false });
  // камин
  box(9.35, 10, 0, 1.3, 3.1, 4.9, MAT.brick); box(9.2, 10, 1.3, 1.45, 2.9, 5.1, MAT.darkwood, { col: false });
  box(9.36, 9.4, 0.1, 0.9, 3.5, 4.5, new THREE.MeshStandardMaterial({ color: 0x050505 }), { col: false });
  world.photo = prop('pictureframe_large_A', 9.88, 2.1, 4, -Math.PI / 2, 0.9, { col: false });
  // гроб у окна, рядом "наглядное пособие"
  prop('coffin_decorated', 7.6, 0, 2.2, Math.PI / 2, 0.7);
  prop('candle_triple', 9.0, 0, 1.0, 0, 0.7, { col: false }); prop('candle_triple', 6.2, 0, 1.0, 1, 0.7, { col: false });
  L.coffin = pointLight(0xff8a3a, 3, 7, 7.6, 1.0, 1.1);
  // часы
  world.clock = makeClock(5.0, 1.9, 0.12);

  // кабинет
  prop('table_medium_long', 7, 0, -6.3, 0, 0.6);
  prop('chair_A_wood', 7, 0, -5.2, Math.PI, 0.7, { col: false });
  prop('book_set', 7.4, 0.6, -6.2, 0.3, 0.5, { col: false });
  prop('lamp_table', 6.0, 0.6, -6.6, 0, 0.32, { col: false });
  prop('pictureframe_standing_A', 7.9, 0.6, -6.6, -0.4, 0.6, { col: false });
  prop('shelf_B_large_decorated', 5.5, 1.3, -7.9, 0, 0.9, { col: false });
  prop('shelf_B_large_decorated', 5.5, 0.4, -7.9, 0, 0.9, { col: false });
  prop('skull', 4.6, 1.45, -7.75, 0.4, 0.25, { col: false });
  L.study = pointLight(0xffc27a, 0, 6, 6.0, 1.2, -6.4);
  world.safe = makeSafe(9.55, -1.6);

  // спальня
  prop('bed_double_A', -8.2, 0, -2, Math.PI / 2, 0.7);
  world.wardrobe = prop('cabinet_small_decorated', -4.3, 0, -7.35, 0, 1.15);
  prop('lamp_table', -9.5, 0, -4.2, 0, 0.5);
  prop('pictureframe_large_A', -9.88, 1.7, -2, Math.PI / 2, 0.7, { col: false });
  world.rug = prop('rug_oval_A', -7, 0.02, -6, 0, 0.6, { col: false });
  world.hatch = box(-7.5, -6.5, 0.02, 0.06, -6.5, -5.5, MAT.darkwood, { col: false });
  box(-7.1, -6.9, 0.06, 0.18, -5.6, -5.45, MAT.metal, { col: false });

  // ---------------- подвал (y = -4)
  const B = -4;
  box(-10, 3, B - 0.2, B, -8, 0, MAT.stone, { col: false });
  box(-10, 3, -1.3, -1.1, -8, 0, MAT.stone, { col: false, cast: false });
  wall(-10.2, -10, -8, 0, B, -1.2, null, MAT.stone); wall(3, 3.2, -8, 0, B, -1.2, null, MAT.stone);
  wall(-10, 3, -8.2, -8, B, -1.2, null, MAT.stone); wall(-10, 3, 0, 0.2, B, -1.2, null, MAT.stone);
  for (const [x, z] of [[-4.5, -2], [-4.5, -6], [0.5, -6]]) box(x - 0.25, x + 0.25, B, -1.2, z - 0.25, z + 0.25, MAT.stone, { wall: true });
  // лестница
  const lad = new THREE.Group();
  for (const sx of [-0.35, 0.35]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3, 0.06), MAT.darkwood); r.position.set(sx, 1.5, 0); lad.add(r); }
  for (let i = 0; i < 9; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), MAT.darkwood); r.position.set(0, 0.3 + i * 0.33, 0); lad.add(r); }
  lad.position.set(-7, B, -6.2); lad.rotation.x = -0.18; scene.add(lad);
  // ритуальный круг
  const circle = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.6, 48), new THREE.MeshBasicMaterial({ color: 0x8a1010, transparent: true, opacity: 0.7 }));
  circle.rotation.x = -Math.PI / 2; circle.position.set(-1.5, B + 0.02, -3.5); scene.add(circle);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; prop('candle_melted', -1.5 + Math.cos(a) * 1.8, B, -3.5 + Math.sin(a) * 1.8, a, 0.5, { col: false }); }
  prop('shrine_candles', -1.5, B, -0.7, Math.PI, 0.7);
  prop('ribcage', -8.5, B + 0.25, -1.2, 0.5, 0.6, { col: false }); prop('skull', -8.9, B, -1.8, 1, 0.3, { col: false });
  prop('bone_A', -6, B, -2.5, 1, 0.5, { col: false }); prop('skull_candle', 2.4, B, -1, 0, 0.5, { col: false });
  prop('cabinet_medium', -9.6, B, -3, Math.PI / 2, 0.75);
  L.base1 = pointLight(0xff7a2a, 4, 9, -1.5, B + 1.0, -3.5);
  L.base2 = pointLight(0xff9a4a, 1.5, 7, 2.2, B + 1.2, -1);
  world.chest = makeChest(2.2, B, -7.3);
  world.chalk = makeChalk(-3, B + 1.4, -7.89);
  // призрачный свет
  L.ghost = pointLight(0x7fb8ff, 0, 6, 0, 1.5, 0);

  // узлы навигации Сторожа (первый этаж)
  const N = world.nodes = {
    h7: [0, 7], h4: [0, 4], h0: [0, 0.5], hm4: [0, -4], hm7: [0, -7],
    kd: [-2.2, 5], kd2: [-3.8, 5], k1: [-6.5, 5.6], k2: [-8.6, 5.6], k3: [-8.6, 1.5], k4: [-4.6, 1.5],
    ld: [2.2, 5], ld2: [3.8, 5], l1: [6.5, 4.4], l2: [5, 1.2], l3: [4.2, 6.8],
    sd: [2.2, -4], sd2: [3.8, -4], s1: [6.5, -3.8], s2: [8.8, -2.5],
    bd: [-2.2, -4], bd2: [-3.8, -4], b1: [-5.5, -4.6], b2: [-6, -0.8],
  };
  world.edges = [['h7', 'h4'], ['h4', 'h0'], ['h0', 'hm4'], ['hm4', 'hm7'], ['h4', 'kd'], ['kd', 'kd2'], ['kd2', 'k1'], ['k1', 'k2'], ['k2', 'k3'], ['kd2', 'k4'],
    ['h4', 'ld'], ['ld', 'ld2'], ['ld2', 'l1'], ['l1', 'l2'], ['ld2', 'l3'], ['hm4', 'sd'], ['sd', 'sd2'], ['sd2', 's1'], ['s1', 's2'], ['hm4', 'bd'], ['bd', 'bd2'], ['bd2', 'b1'], ['b1', 'b2']];
}

function makeDoor(x, z, w, axis, dir) {
  // поворотная дверь: шарнир в (x,z), полотно вдоль оси axis
  const pivot = new THREE.Group(); pivot.position.set(x, 0, z); scene.add(pivot);
  const geo = axis === 'x' ? new THREE.BoxGeometry(w, 2.15, 0.07) : new THREE.BoxGeometry(0.07, 2.15, w);
  const m = new THREE.Mesh(geo, MAT.darkwood); m.castShadow = true;
  if (axis === 'x') m.position.set(w / 2, 1.075, 0); else m.position.set(0, 1.075, w / 2);
  pivot.add(m);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05), MAT.brass);
  if (axis === 'x') knob.position.set(w - 0.15, 1.0, 0.06 * dir * -1); else knob.position.set(0.06, 1.0, w - 0.15);
  pivot.add(knob);
  const col = axis === 'x' ? addCol(x, x + w, z - 0.1, z + 0.1, 0, 2.2, { wall: true }) : addCol(x - 0.1, x + 0.1, z, z + w, 0, 2.2, { wall: true });
  return { pivot, col, open: false, target: 0, dir, axis,
    setOpen(v, instant) { this.open = v; this.col.on = !v; this.target = v ? (this.axis === 'x' ? 1.75 * this.dir : -1.75 * this.dir) : 0; if (instant) this.pivot.rotation.y = this.target; } };
}
function makeClock(x, y, z) {
  const tex = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#d8ceb4'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#2a1a0a'; g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['XII', 'III', 'VI', 'IX'].forEach((t, i) => { const a = i * Math.PI / 2 - Math.PI / 2; g.fillText(t, 128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90); });
    const hand = (a, len, wd) => { g.lineWidth = wd; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len); g.stroke(); };
    g.strokeStyle = '#120a04';
    hand((3.25 / 12) * Math.PI * 2 - Math.PI / 2, 55, 8); hand((15 / 60) * Math.PI * 2 - Math.PI / 2, 85, 5);
  });
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.18), MAT.darkwood); body.position.y = -0.35; grp.add(body);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  face.position.set(0, 0, 0.1); grp.add(face);
  const pend = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), MAT.brass); pend.position.set(0, -0.75, 0.1); grp.add(pend);
  grp.position.set(x, y, z); scene.add(grp);
  return grp;
}
function makeSafe(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.7), MAT.metal); body.position.y = 0.475; body.castShadow = true; g.add(body);
  const doorP = new THREE.Group(); doorP.position.set(-0.36, 0.475, 0.355); g.add(doorP);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.85, 0.05), new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.8, roughness: 0.35 }));
  door.position.set(0.36, 0, 0.02); doorP.add(door);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 24), MAT.brass); dial.rotation.x = Math.PI / 2; dial.position.set(0.36, 0.1, 0.06); doorP.add(dial);
  const kp = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0x1e6b2e })); kp.position.set(0.36, -0.15, 0.05); doorP.add(kp);
  g.position.set(x, 0, z); g.rotation.y = -Math.PI / 2; scene.add(g);
  addCol(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 0, 0.95, { walk: true });
  return { g, doorP };
}
function makeChest(x, y, z) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.6), MAT.darkwood); b.position.y = 0.25; b.castShadow = true; g.add(b);
  const lidP = new THREE.Group(); lidP.position.set(0, 0.5, -0.3); g.add(lidP);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.14, 0.62), MAT.darkwood); lid.position.set(0, 0.07, 0.3); lidP.add(lid);
  for (const sx of [-0.4, 0.4]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.66, 0.64), MAT.metal); s.position.set(sx, 0.3, 0); g.add(s); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.05), MAT.brass); lock.position.set(0, 0.45, 0.32); g.add(lock);
  g.position.set(x, y, z); scene.add(g);
  addCol(x - 0.55, x + 0.55, z - 0.3, z + 0.3, y, y + 0.6, { walk: true });
  return { g, lidP, lock };
}
function makeChalk(x, y, z) {
  const t = canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(235,235,225,.85)'; g.font = '48px Caveat, cursive'; g.textAlign = 'center';
    g.fillText('КРОВЬ РОДА', w / 2, 60); g.fillText('ПОЛНОЧЬ', w / 2, 120); g.fillText('СЕМЬ СВЕЧЕЙ', w / 2, 180);
    g.font = '30px Caveat, cursive'; g.fillStyle = 'rgba(200,60,50,.85)'; g.fillText('даня, прости', w / 2 + 80, 235);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1 }));
  m.position.set(x, y, z); scene.add(m); return m;
}

// ---------------------------------------------------------------- персонажи
function prepChar(gltf, height) {
  const root = new THREE.Group();
  const m = gltf.scene;
  m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.frustumCulled = false; } });
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  const s = height / (b.max.y - b.min.y);
  m.scale.setScalar(s);
  root.add(m); scene.add(root);
  const mixer = new THREE.AnimationMixer(m);
  const acts = {};
  for (const clip of gltf.animations) acts[clip.name] = mixer.clipAction(clip);
  const ch = { root, model: m, mixer, acts, cur: null, scale: s,
    play(name, fade = 0.18, once = false, speed = 1) {
      const a = this.acts[name]; if (!a) return null;
      if (this.cur === a && !once) return a;
      a.reset(); a.enabled = true; a.setEffectiveTimeScale(speed); a.setEffectiveWeight(1);
      if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
      if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
      a.play(); this.cur = a; return a;
    },
    bone(name) { let r = null; m.traverse(c => { if (!r && c.name === name) r = c; }); return r; },
    node(name) { let r = null; m.traverse(c => { if (!r && c.name === name) r = c; }); return r; },
  };
  return ch;
}

const hero = { pos: new THREE.Vector3(0, 0, 24), vy: 0, onGround: true, yaw: Math.PI, hp: 3, stamina: 1, area: 'out', basement: false,
  action: null, actionT: 0, hidden: false, dead: false, weapon: null, stepT: 0, attackHit: false, invul: 0, lastHurt: 0 };
let H, SK, GH, AN; // персонажи
function setupChars() {
  H = prepChar(GLB.hero, 1.72);
  for (const n of ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable']) { const o = H.node(n); if (o) o.visible = false; }
  H.crossbow = H.node('2H_Crossbow');
  const hand = H.bone('handslot.r');
  if (GLB.axe_1handed && hand) { H.axe = GLB.axe_1handed.scene.clone(true); H.axe.visible = false; hand.add(H.axe); }
  H.play('Idle');
  // Сторож
  SK = prepChar(GLB.skel, 1.9);
  const sh = SK.bone('handslot.r');
  if (GLB.Skeleton_Blade && sh) sh.add(GLB.Skeleton_Blade.scene.clone(true));
  SK.model.traverse(c => { if (c.isMesh && /Eyes/.test(c.name)) { c.material = c.material.clone(); c.material.emissive = new THREE.Color(0xff2a10); c.material.emissiveIntensity = 3; } });
  SK.eye = new THREE.PointLight(0xff3010, 0, 3, 2); SK.root.add(SK.eye); SK.eye.position.set(0, 1.7, 0.3);
  // призрак деда
  GH = prepChar(GLB.mage, 1.8);
  for (const n of ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff']) { const o = GH.node(n); if (o) o.visible = false; }
  GH.mats = [];
  GH.model.traverse(c => { if (c.isMesh) { c.castShadow = false; c.material = c.material.clone(); Object.assign(c.material, { transparent: true, opacity: 0, depthWrite: false }); c.material.emissive = new THREE.Color(0x4a8cff); c.material.emissiveIntensity = 0.9; GH.mats.push(c.material); } });
  GH.root.visible = false; GH.alpha = 0; GH.targetAlpha = 0; GH.play('Idle');
  // Аня
  AN = prepChar(GLB.anya, 1.6);
  for (const n of ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable']) { const o = AN.node(n); if (o) o.visible = false; }
  AN.root.position.set(-1.5, -4, -3.5); AN.root.rotation.y = 0.3; AN.play('Lie_Idle');
}

// ---------------------------------------------------------------- Сторож: ИИ
const sk = { state: 'dormant', pos: new THREE.Vector3(5.6, 0, 2.2), yaw: -1.2, path: [], timer: 0, seen: 0, lastSeen: new THREE.Vector3(), axeHits: 0, silver: 0,
  atkT: 0, didHit: false, think: 0, active: false, basement: false, stepT: 0 };
function skSet(state) {
  sk.state = state; sk.timer = 0;
  const p = { dormant: ['Skeletons_Inactive_Floor_Pose', 0, true], awaken: ['Skeletons_Awaken_Floor', 0.1, true], patrol: ['Walking_D_Skeletons'], search: ['Walking_D_Skeletons'],
    chase: ['Running_C'], attack: ['1H_Melee_Attack_Chop', 0.1, true], hit: ['Hit_A', 0.08, true], down: ['Death_C_Skeletons', 0.1, true], rise: ['Death_C_Skeletons_Resurrect', 0.1, true],
    dead: ['Death_C_Skeletons', 0.1, true], taunt: ['Taunt', 0.2, true], idle: ['Idle_Combat'] }[state];
  if (p) SK.play(p[0], p[1] ?? 0.2, p[2] ?? false);
}
function segHitsBox(ax, az, bx, bz, c) {
  // пересечение отрезка с прямоугольником (метод плит)
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; }
    else { let u0 = (lo - p) / d, u1 = (hi - p) / d; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) return false; }
  }
  return true;
}
function los(a, b, y) {
  for (const c of colliders) {
    if (!c.on || !c.wall) continue;
    if (y + 1.2 < c.y0 || y + 0.5 > c.y1) continue;
    if (segHitsBox(a.x, a.z, b.x, b.z, c)) return false;
  }
  return true;
}
function nearestNode(p, needLos = true) {
  let best = null, bd = 1e9;
  for (const [k, v] of Object.entries(world.nodes)) {
    const d = (v[0] - p.x) ** 2 + (v[1] - p.z) ** 2;
    if (d < bd && (!needLos || los(p, { x: v[0], z: v[1] }, 0))) { bd = d; best = k; }
  }
  return best;
}
function findPath(from, to) {
  if (!from || !to) return [];
  const adj = {};
  for (const [a, b] of world.edges) {
    if ((a === 'sd' && b === 'sd2') && !world.doors.study.open) continue;
    (adj[a] ||= []).push(b); (adj[b] ||= []).push(a);
  }
  const prev = { [from]: null }, q = [from];
  while (q.length) { const n = q.shift(); if (n === to) break; for (const m of adj[n] || []) if (!(m in prev)) { prev[m] = n; q.push(m); } }
  if (!(to in prev)) return [];
  const path = []; for (let n = to; n; n = prev[n]) path.unshift(n);
  return path.map(k => new THREE.Vector3(world.nodes[k][0], 0, world.nodes[k][1]));
}
function moveCircle(p, dx, dz, r, feet, height = 1.7) {
  p.x += dx; p.z += dz;
  for (let it = 0; it < 2; it++) for (const c of colliders) {
    if (!c.on) continue;
    if (feet + height < c.y0 || feet + 0.35 > c.y1) continue; // можно перешагнуть/запрыгнуть
    const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1);
    const ddx = p.x - cx, ddz = p.z - cz, d2 = ddx * ddx + ddz * ddz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), push = (r - d) / d; p.x += ddx * push; p.z += ddz * push; }
      else { // центр внутри: выталкиваем по кратчайшей оси
        const opts = [[c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0], [0, c.z0 - r - p.z], [0, c.z1 + r - p.z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); p.x += opts[0][0]; p.z += opts[0][1];
      }
    }
  }
}
function updateSkeleton(dt) {
  if (!SK) return;
  SK.mixer.update(dt);
  sk.timer += dt;
  if (!sk.active) { SK.root.position.copy(sk.pos); SK.root.rotation.y = sk.yaw; SK.eye.intensity = 0; return; }
  const P = hero.pos, d = Math.hypot(P.x - sk.pos.x, P.z - sk.pos.z);
  const sameFloor = hero.basement === sk.basement;
  // поиск игрока
  sk.think -= dt;
  let sees = false;
  if (sk.think <= 0 && ['patrol', 'search', 'chase', 'idle'].includes(sk.state)) {
    sk.think = 0.15;
    if (sameFloor && !hero.hidden && !hero.dead) {
      const range = flashOn ? 13 : 8;
      const fwd = new THREE.Vector2(Math.sin(sk.yaw), Math.cos(sk.yaw)), to = new THREE.Vector2(P.x - sk.pos.x, P.z - sk.pos.z).normalize();
      const inFov = fwd.dot(to) > -0.2 || d < 3.5;
      sees = d < range && inFov && los(sk.pos, P, sk.basement ? -4 : 0);
      if (!sees && hero.running && d < 7 && los(sk.pos, P, sk.basement ? -4 : 0)) sees = true;
      if (sk.basement && d < 20) sees = true; // в подвале прятаться негде
    }
    if (sees) { sk.lastSeen.copy(P); sk.seen = 4; if (sk.state !== 'chase') { skSet('chase'); sound.bones(0.3); if (Math.random() < 0.5) skLine(); } }
  }
  const spd = { patrol: 1.3, search: 1.8, chase: hero.basement ? 2.6 : 3.4 }[sk.state] || 0;
  let target = null;
  if (sk.state === 'chase') {
    sk.seen -= dt;
    if (sk.seen <= 0 || hero.hidden) { skSet('search'); sk.path = findPath(nearestNode(sk.pos), nearestNode(sk.lastSeen)); }
    else if (los(sk.pos, P, sk.basement ? -4 : 0) || sk.basement) target = P;
    else {
      if (!sk.path.length || sk.timer > 0.6) { sk.timer = 0; sk.path = findPath(nearestNode(sk.pos), nearestNode(sk.lastSeen)); sk.path.push(sk.lastSeen.clone()); }
    }
    if (d < 1.35 && sameFloor && !hero.hidden && !hero.dead) { skSet('attack'); sk.didHit = false; sound.whoosh(); }
  } else if (sk.state === 'patrol' || sk.state === 'search') {
    if (!sk.path.length) {
      if (sk.state === 'search') { skSet('patrol'); }
      const keys = Object.keys(world.nodes); const k = keys[Math.floor(Math.random() * keys.length)];
      sk.path = findPath(nearestNode(sk.pos), k);
      if (!sk.path.length) sk.path = [new THREE.Vector3(world.nodes.h0[0], 0, world.nodes.h0[1])];
    }
  } else if (sk.state === 'attack') {
    if (!sk.didHit && sk.timer > 0.45) { sk.didHit = true; if (d < 1.9 && !hero.hidden && sameFloor) hurtHero(); }
    if (sk.timer > 1.2) skSet('chase');
    turnTo(P, dt * 6);
  } else if (sk.state === 'hit') { if (sk.timer > 0.6) skSet('chase'); }
  else if (sk.state === 'awaken') { if (sk.timer > 3.2) { skSet('taunt'); sound.stinger(); } }
  else if (sk.state === 'taunt') { if (sk.timer > 1.6) { skSet('chase'); sk.seen = 5; sk.lastSeen.copy(P); } }
  else if (sk.state === 'down') { if (sk.timer > 13) { skSet('rise'); sound.bones(0.5); } }
  else if (sk.state === 'rise') { if (sk.timer > 2.4) { sk.axeHits = 0; skSet('chase'); sk.seen = 3; sk.lastSeen.copy(P); } }

  if (!target && sk.path.length && spd > 0) {
    target = sk.path[0];
    if (Math.hypot(target.x - sk.pos.x, target.z - sk.pos.z) < 0.4) { sk.path.shift(); target = sk.path[0] || null; }
  }
  if (target && spd > 0) {
    const dx = target.x - sk.pos.x, dz = target.z - sk.pos.z, l = Math.hypot(dx, dz);
    if (l > 0.05) {
      turnTo(target, dt * 8);
      const step = Math.min(l, spd * dt);
      moveCircle(sk.pos, dx / l * step, dz / l * step, 0.35, sk.pos.y);
    }
    sk.stepT -= dt * spd;
    if (sk.stepT <= 0) { sk.stepT = 1.1; if (sameFloor && d < 14) { sound.bones(0.12 * (1 - d / 14)); } }
  }
  SK.root.position.copy(sk.pos); SK.root.rotation.y = sk.yaw;
  // глаза светятся, когда он активен
  SK.eye.intensity = ['dormant', 'down', 'dead'].includes(sk.state) ? 0 : 1.5 + Math.random() * 0.5;
}
function turnTo(t, k) { sk.yaw = lerpAngle(sk.yaw, Math.atan2(t.x - sk.pos.x, t.z - sk.pos.z), Math.min(1, k)); }
const SK_LINES = ['Аркаша?.. Это ты пришёл?', 'Иди ко мне, внучек. Бабушка замёрзла.', 'Полночь скоро. Мне нужна только капелька.', 'Я слышу, как бьётся твоё сердце.', 'Не прячься. В этом доме я знаю каждую доску.'];
let skLineT = 0;
function skLine() { if (performance.now() - skLineT < 9000) return; skLineT = performance.now(); voice.say('storozh', SK_LINES[Math.floor(Math.random() * SK_LINES.length)]); }

// ---------------------------------------------------------------- ввод
const keys = {};
const input = { mx: 0, mz: 0, run: false, look: { x: 0, y: 0 } };
let camYaw = 0, camPitch = -0.08, firstPerson = false, flashOn = true, touchRun = false;
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (state !== 'play') { if (e.code === 'Escape' && modalOpen) closeModal(); return; }
  if (modalOpen) { if (e.code === 'Escape' || (e.code === 'KeyE' && modalKind === 'note')) closeModal(); return; }
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyF') toggleFlash();
  if (e.code === 'Space') jump();
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'KeyH') showHint();
  if (e.code === 'KeyJ') openJournal();
  if (e.code === 'KeyQ') cycleWeapon();
  if (e.code === 'Escape' || e.code === 'KeyP') pauseGame();
});
addEventListener('keyup', e => { keys[e.code] = false; });
let dragLook = null, pointerLocked = false, ignoreLockLoss = false, lockFailed = false;
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
canvas.addEventListener('mousedown', e => {
  if (state !== 'play' || modalOpen || IS_TOUCH) return;
  if (!pointerLocked) {
    if (!lockFailed) try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { lockFailed = true; }); } catch (err) { lockFailed = true; }
    dragLook = { x: e.clientX, y: e.clientY };
  }
  if (e.button === 0 && (pointerLocked || lockFailed)) attack();
});
addEventListener('mouseup', () => { dragLook = null; });
addEventListener('mousemove', e => {
  if (state !== 'play' || modalOpen) return;
  if (pointerLocked) { camYaw -= e.movementX * 0.0024; camPitch -= e.movementY * 0.0024; }
  else if (dragLook) { camYaw -= (e.clientX - dragLook.x) * 0.005; camPitch -= (e.clientY - dragLook.y) * 0.005; dragLook = { x: e.clientX, y: e.clientY }; }
  camPitch = clamp(camPitch, -1.2, 0.9);
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked && state === 'play' && !modalOpen && !ignoreLockLoss) pauseGame();
  ignoreLockLoss = false;
});
function releaseLock() { if (pointerLocked) { ignoreLockLoss = true; document.exitPointerLock?.(); } }

// сенсорное управление
function setupTouch() {
  $('touch').hidden = false;
  const stick = $('stick'), knob = $('knob');
  let sid = null, so = null, lid = null, lp = null;
  $('lzone').addEventListener('pointerdown', e => {
    if (sid !== null) return; sid = e.pointerId; so = { x: e.clientX, y: e.clientY };
    stick.hidden = false; stick.style.left = so.x + 'px'; stick.style.top = so.y + 'px'; knob.style.transform = '';
    $('lzone').setPointerCapture(e.pointerId);
  });
  $('lzone').addEventListener('pointermove', e => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - so.x, dy = e.clientY - so.y; const l = Math.hypot(dx, dy), max = 55;
    if (l > max) { dx *= max / l; dy *= max / l; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    input.mx = dx / max; input.mz = dy / max;
    input.touchRun = l > max * 1.25 || touchRun;
  });
  const endStick = e => { if (e.pointerId !== sid) return; sid = null; stick.hidden = true; input.mx = input.mz = 0; input.touchRun = false; };
  $('lzone').addEventListener('pointerup', endStick); $('lzone').addEventListener('pointercancel', endStick);
  $('rzone').addEventListener('pointerdown', e => { if (lid !== null) return; lid = e.pointerId; lp = { x: e.clientX, y: e.clientY }; $('rzone').setPointerCapture(e.pointerId); });
  $('rzone').addEventListener('pointermove', e => {
    if (e.pointerId !== lid || modalOpen) return;
    camYaw -= (e.clientX - lp.x) * 0.0065; camPitch = clamp(camPitch - (e.clientY - lp.y) * 0.0055, -1.2, 0.9); lp = { x: e.clientX, y: e.clientY };
  });
  const endLook = e => { if (e.pointerId === lid) lid = null; };
  $('rzone').addEventListener('pointerup', endLook); $('rzone').addEventListener('pointercancel', endLook);
  const btn = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (state === 'play' && !modalOpen) fn(); });
  btn('b-use', interact); btn('b-atk', attack); btn('b-jump', jump); btn('b-light', toggleFlash);
  btn('b-run', () => { touchRun = !touchRun; $('b-run').classList.toggle('on', touchRun); });
}

// ---------------------------------------------------------------- игровое состояние
let state = 'menu'; // menu | play | pause | modal | end | cutscene
let modalOpen = false, modalKind = null;
let gameTime = 23 * 3600 + 15 * 60; // секунды суток
const TIME_SCALE = 2;
const inv = { frontKey: false, basementKey: false, axe: false, crossbow: false, bolts: 0, chainKey: false };
const flags = {};
const notesRead = new Set();
let phase = 'yard';
let busy = false; // идёт сценка

function setPhase(p) { phase = p; $('obj').textContent = OBJECTIVES[p] || ''; }
function toast(t, ms = 2600) {
  const el = $('toast'); el.textContent = t; el.style.opacity = 1;
  clearTimeout(toast._t); toast._t = setTimeout(() => el.style.opacity = 0, ms);
}
function updateInv() {
  const items = [];
  if (inv.frontKey && !flags.frontOpen) items.push('Ключ от дома');
  if (inv.basementKey && !flags.hatchOpen) items.push('Ключ от подвала');
  if (inv.axe) items.push('Топор');
  if (inv.crossbow) items.push('Арбалет');
  if (inv.bolts) items.push(`Серебряные болты ×${inv.bolts}`);
  if (inv.chainKey) items.push('Ключ от цепи');
  $('inv').innerHTML = items.map(t => `<span>${t}</span>`).join('');
  $('hp').innerHTML = [0, 1, 2].map(i => `<i class="${i < hero.hp ? '' : 'off'}"></i>`).join('');
  const w = hero.weapon === 'crossbow' ? `Арбалет · болтов: ${inv.bolts}` : hero.weapon === 'axe' ? 'Топор' : 'Без оружия';
  $('weapon').textContent = w + (inv.axe && inv.crossbow ? (IS_TOUCH ? '' : ' · Q — сменить') : '');
}
function cycleWeapon() {
  const list = [null]; if (inv.axe) list.push('axe'); if (inv.crossbow) list.push('crossbow');
  if (list.length < 2) return;
  const i = list.indexOf(hero.weapon); hero.weapon = list[(i + 1) % list.length] || list[1];
  equipVisual(); updateInv();
}
function equipVisual() {
  if (H.axe) H.axe.visible = hero.weapon === 'axe';
  if (H.crossbow) H.crossbow.visible = hero.weapon === 'crossbow';
}
function toggleFlash() { flashOn = !flashOn; sound.flash(); $('b-light')?.classList.toggle('on', flashOn); }
function toggleView() { firstPerson = !firstPerson; $('b-view').textContent = 'Вид: ' + (firstPerson ? 'от первого лица' : 'от третьего лица'); }
function jump() { if (hero.onGround && !hero.hidden && !hero.dead && !hero.action) { hero.vy = 6.2; hero.onGround = false; H.play('Jump_Start', 0.08, true); hero.jumpT = 0; } }

function hurtHero() {
  if (hero.invul > 0 || hero.dead) return;
  hero.hp--; hero.invul = 1.0; hero.lastHurt = performance.now();
  sound.hurt(); $('hurt').style.opacity = 1; setTimeout(() => $('hurt').style.opacity = 0, 450);
  if (navigator.vibrate) try { navigator.vibrate(120); } catch (e) { }
  updateInv();
  if (hero.hp <= 0) die();
  else { hero.action = 'hit'; hero.actionT = 0; H.play('Hit_A', 0.05, true); }
}
async function die() {
  hero.dead = true; H.play('Death_A', 0.1, true); sound.stinger(); voice.stop();
  await sleep(1800); $('fade').classList.add('on'); await sleep(900);
  showEnd('death');
}

// ---------------------------------------------------------------- взаимодействия
const interactables = [];
function addI(x, y, z, label, use, o = {}) { const it = { pos: new THREE.Vector3(x, y, z), label, use, r: o.r || 1.7, basement: y < -2 }; interactables.push(it); return it; }
let focused = null;
function findFocus() {
  if (hero.hidden) return { label: () => 'Выйти из шкафа', use: leaveWardrobe };
  let best = null, bs = 1e9;
  const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  for (const it of interactables) {
    if (it.basement !== hero.basement) continue;
    const lab = it.label(); if (!lab) continue;
    const dx = it.pos.x - hero.pos.x, dz = it.pos.z - hero.pos.z, d = Math.hypot(dx, dz);
    if (d > it.r) continue;
    const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
    const s = d - dot * 0.8;
    if (s < bs) { bs = s; best = it; }
  }
  return best;
}
function interact() {
  if (busy && !hero.hidden) return;
  const f = findFocus(); if (!f) return;
  f.use();
}
function setupInteractables() {
  addI(1.8, 1.2, 25.5, () => 'Открыть почтовый ящик', async () => {
    showNote('mailbox');
    if (!flags.mail) { flags.mail = true; await waitModal(); voice.say('dan', 'Где бабушка смотрит на дом... Её же похоронили прямо во дворе. Дед не дал увезти на кладбище.'); }
  });
  addI(-7.5, 0.5, 16, () => inv.frontKey ? 'Осмотреть надгробие' : 'Осмотреть могилу', async () => {
    if (!inv.frontKey) {
      inv.frontKey = true; updateInv(); sound.pickup(); sound.whisper(); toast('Найден ключ от дома');
      H.play('PickUp', 0.1, true); hero.action = 'pick'; hero.actionT = 0;
      flags.graveSeen = true;
      await sleep(600); showNote('grave'); await waitModal();
      voice.say('dan', 'Ключ лежал под свечой. Свеча ещё тёплая. Кто-то зажёг её совсем недавно.');
    } else showNote('grave');
  }, { r: 2.2 });
  addI(0, 1, 8.6, () => flags.frontOpen ? null : 'Открыть дверь', async () => {
    if (!inv.frontKey) { voice.say('dan', 'Заперто. Запасной ключ всегда лежал под ковриком... но его там нет.'); sound.beep(false); return; }
    flags.frontOpen = true; world.doors.front.setOpen(true); sound.unlock(); setTimeout(() => sound.creak(1.6), 300); updateInv();
  });
  addI(-2.3, 0.4, 7.0, () => 'Открыть рюкзак Ани', async () => {
    showNote('backpack');
    if (!flags.backpack) { flags.backpack = true; await waitModal(); setPhase('house'); voice.say('dan', 'Самая важная дата... Свадьба. Он всю жизнь говорил о бабушке.'); }
  });
  addI(9.6, 1.4, 4, () => 'Осмотреть фото', () => { showNote('photo'); flags.photo = true; }, { r: 2.0 });
  addI(5.0, 1.4, 0.4, () => 'Осмотреть часы', () => { showNote('clock'); flags.clock = true; }, { r: 1.9 });
  addI(7.6, 0.5, 2.2, () => 'Осмотреть гроб', () => voice.say('dan', flags.awake ? 'Пустой. Он лежал рядом с ним всё это время. Ждал.' : 'Пустой. На подушке вмятина, как будто в нём кто-то лежал. Совсем недавно.'), { r: 2.0 });
  addI(5.6, 0.3, 2.2, () => sk.state === 'dormant' ? 'Осмотреть кости' : null, () => voice.say('dan', 'Кости в старом плаще. Дед был врачом... наглядное пособие. Наверное. Только почему оно лежит у гроба?'), { r: 1.8 });
  // дверь кабинета
  addI(2.6, 1.2, -4, () => flags.studyOpen ? null : 'Кодовый замок кабинета', () => {
    openKeypad('Кабинет А. П. Вольского', 4, '1406', async () => {
      flags.studyOpen = true; world.doors.study.setOpen(true); sound.unlock(); setTimeout(() => sound.creak(1.4), 250);
      setPhase('study');
    });
  }, { r: 1.8 });
  addI(7.2, 0.8, -5.9, () => 'Читать дневник деда', () => { showNote('diary'); flags.diary = true; }, { r: 1.8 });
  addI(9.1, 0.6, -1.6, () => flags.safeOpen ? 'Осмотреть сейф' : 'Открыть сейф', () => {
    if (flags.safeOpen) { showNote('safe'); return; }
    openKeypad('Сейф', 4, '5130', () => openSafe());
  }, { r: 1.7 });
  // кухня: полка с вареньем
  addI(-5.5, 1.2, 0.6, () => inv.axe ? 'Банки с вареньем' : 'Осмотреть полку с вареньем', async () => {
    if (inv.axe) { voice.say('dan', 'Вишнёвое. Тысяча девятьсот девяносто седьмой год. Бабушка закатывала последнее лето.'); return; }
    inv.axe = true; if (!hero.weapon || hero.weapon === null) hero.weapon = 'axe'; equipVisual(); updateInv();
    if (world.axeProp) world.axeProp.visible = false;
    sound.pickup(); toast('Найден топор деда' + (IS_TOUCH ? ' · кнопка «Удар»' : ' · ЛКМ — удар'));
    voice.say('dan', 'Тяжёлый. Дед колол им дрова. Надеюсь, только дрова.');
  }, { r: 1.8 });
  // шкаф в спальне
  addI(-4.3, 1, -6.6, () => hero.hidden ? null : 'Спрятаться в шкаф', enterWardrobe, { r: 1.6 });
  // люк
  addI(-7, 0.3, -6, () => flags.hatchOpen ? 'Спуститься в подвал' : (flags.rugMoved ? 'Люк с навесным замком' : 'Отодвинуть ковёр'), async () => {
    if (!flags.rugMoved) { flags.rugMoved = true; if (world.rug) world.rug.position.x -= 1.6; sound.paper(); voice.say('dan', 'Люк. Висячий замок, свежая смазка на петлях.'); return; }
    if (!flags.hatchOpen) {
      if (!inv.basementKey) { voice.say('dan', 'Нужен ключ. Дед писал, что держит его в сейфе.'); sound.beep(false); return; }
      flags.hatchOpen = true; sound.unlock(); setTimeout(() => sound.creak(1.8, 0.2), 300); updateInv();
      if (world.hatch) world.hatch.rotation.x = -1.2, world.hatch.position.y += 0.4;
    }
    descend();
  }, { r: 1.7 });
  // подвал
  addI(-7, -3.5, -5.6, () => 'Подняться наверх', () => {
    if (phase === 'boss' && sk.state !== 'dead') { voice.say('dan', 'Нет. Я не оставлю её одну.'); return; }
    ascend();
  }, { r: 1.5 });
  addI(-1.5, -3.6, -3.5, () => flags.anyaFree ? null : (inv.chainKey ? 'Освободить Аню' : 'Подойти к Ане'), () => {
    if (inv.chainKey) { freeAnya(); return; }
    if (!flags.anyaTalk) basementScene();
    else voice.say('anya', phase === 'boss' ? 'Даня, сзади!' : 'Цепь... ключ у него внутри. Я видела, как он его проглотил.');
  }, { r: 2.4 });
  addI(2.2, -3.6, -6.8, () => flags.chestOpen ? null : 'Открыть сундук', () => {
    openLetters('Сундук деда', 'ВЕРА', () => openChest());
  }, { r: 1.7 });
  addI(-3, -2.6, -7.6, () => 'Читать надпись на стене', () => showNote('basement'), { r: 2.2 });
  addI(-9.3, -3.4, -3, () => inv.crossbow ? 'Взять болты с полки' : 'Осмотреть полку', () => {
    if (!inv.crossbow) { voice.say('dan', 'Дробь, порох, какие-то серебряные заготовки. Дед готовился.'); return; }
    if (inv.bolts >= 3) { toast('Болтов достаточно'); return; }
    inv.bolts = 3; updateInv(); sound.pickup(); toast('Серебряные болты: 3');
  }, { r: 1.8 });
  // останки Сторожа
  world.remainsI = addI(0, -3.6, 0, () => (sk.state === 'dead' && !inv.chainKey && hero.basement) ? 'Обыскать останки' : null, () => {
    inv.chainKey = true; updateInv(); sound.pickup(); sound.bones(0.5); toast('Ключ от цепи');
    setPhase('free'); voice.say('dan', 'Внутри рёбер что-то блестит. Ключ. Аня, держись!');
  }, { r: 2.0 });
}

// шкаф
let wardrobeSeen = false;
function enterWardrobe() {
  hero.hidden = true; wardrobeSeen = sk.state === 'chase' && Math.hypot(hero.pos.x - sk.pos.x, hero.pos.z - sk.pos.z) < 4;
  hero.preHide = hero.pos.clone(); sound.creak(0.8, 0.1);
  hero.pos.set(-4.3, 0, -7.2); H.root.visible = false;
  toast('Ты в шкафу. Не дыши.', 2000);
  if (wardrobeSeen) setTimeout(() => { if (hero.hidden) { leaveWardrobe(); hurtHero(); voice.say('storozh', 'Я видела, куда ты залез.'); } }, 2500);
}
function leaveWardrobe() { hero.hidden = false; hero.pos.copy(hero.preHide || new THREE.Vector3(-4.3, 0, -6.2)); H.root.visible = true; sound.creak(0.6, 0.1); }

// ---------------------------------------------------------------- атака
function attack() {
  if (hero.dead || hero.hidden || hero.action === 'attack' || hero.action === 'shoot') return;
  if (!hero.weapon) {
    if (inv.axe || inv.crossbow) { cycleWeapon(); return; }
    voice.say('dan', 'Голыми руками я с этим ничего не сделаю.'); return;
  }
  hero.yaw = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
  if (hero.weapon === 'axe') {
    hero.action = 'attack'; hero.actionT = 0; hero.attackHit = false; H.play('1H_Melee_Attack_Chop', 0.06, true, 1.3); sound.whoosh();
  } else {
    if (inv.bolts <= 0) { toast('Болты кончились. Полка у стены, слева от лестницы'); sound.beep(false); return; }
    hero.action = 'shoot'; hero.actionT = 0; hero.attackHit = false; H.play('2H_Ranged_Shoot', 0.06, true, 1.2);
  }
}
const boltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.2, emissive: 0x334455 }));
boltMesh.rotation.order = 'YXZ'; boltMesh.visible = false; scene.add(boltMesh);
let boltFly = null;
function resolveAttack() {
  const dx = sk.pos.x - hero.pos.x, dz = sk.pos.z - hero.pos.z, d = Math.hypot(dx, dz);
  const sameFloor = hero.basement === sk.basement;
  const alive = !['dormant', 'dead'].includes(sk.state) && sk.active;
  if (hero.weapon === 'axe') {
    const ang = Math.abs(lerpAngle(0, Math.atan2(dx, dz) - hero.yaw, 1));
    if (alive && sameFloor && d < 2.2 && ang < 1.3) {
      sound.hit(); sk.axeHits++;
      if (sk.state === 'down' || sk.state === 'rise') return;
      if (sk.axeHits >= 3) { skSet('down'); toast('Он рассыпался. Ненадолго...'); sound.bones(0.6); }
      else skSet('hit');
      moveCircle(sk.pos, dx / d * 0.5, dz / d * 0.5, 0.35, sk.pos.y);
    }
  } else {
    inv.bolts--; updateInv(); sound.twang();
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const ang = Math.acos(clamp((dx * fwd.x + dz * fwd.z) / (d || 1), -1, 1));
    const hit = alive && sameFloor && d < 26 && ang < (IS_TOUCH ? 0.5 : 0.32) && los(hero.pos, sk.pos, hero.basement ? -4 : 0);
    const from = hero.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
    const to = hit ? sk.pos.clone().add(new THREE.Vector3(0, 1.2, 0)) : from.clone().add(fwd.clone().multiplyScalar(18)).add(new THREE.Vector3(0, Math.sin(camPitch) * 10, 0));
    boltFly = { from, to, t: 0, len: from.distanceTo(to), hit };
    boltMesh.visible = true;
  }
}
function boltLanded() {
  sk.silver++; sound.hit(); sound.tone(1800, 0.6, 'sine', 0.08);
  if (sk.silver >= 3) { skSet('dead'); bossDefeated(); }
  else { skSet('hit'); toast(`Попадание серебром: ${sk.silver} из 3`); }
}

// ---------------------------------------------------------------- модальные окна
const modal = $('modal');
let modalResolve = null;
function openModal(html, kind) {
  modal.innerHTML = html; modal.hidden = false; modalOpen = true; modalKind = kind; releaseLock();
  return modal;
}
function closeModal() { modal.hidden = true; modal.innerHTML = ''; modalOpen = false; modalKind = null; if (modalResolve) { const r = modalResolve; modalResolve = null; r(); } }
function waitModal() { return new Promise(r => { if (!modalOpen) r(); else modalResolve = r; }); }
function showNote(id) {
  const n = NOTES[id]; notesRead.add(id); sound.paper();
  const m = openModal(`<div class="paper" role="dialog" aria-label="${n.title}"><h3>${n.title}</h3><p></p><button class="close" type="button" id="m-close">Закрыть${IS_TOUCH ? '' : ' (E)'}</button></div>`, 'note');
  m.querySelector('p').textContent = n.text;
  $('m-close').onclick = closeModal;
}
function openKeypad(title, len, code, ok) {
  let val = '';
  const m = openModal(`<div class="lock" role="dialog" aria-label="${title}"><h3>${title}</h3><div class="disp" id="kp-d">${'_'.repeat(len)}</div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="C">С</button><button type="button" data-k="0">0</button><button type="button" data-k="X">✕</button></div></div>`, 'keypad');
  const d = $('kp-d');
  const show = () => { d.textContent = (val + '_'.repeat(len)).slice(0, len); d.classList.remove('err'); };
  const press = k => {
    if (k === 'X') { closeModal(); return; }
    if (k === 'C') { val = ''; show(); sound.beep(); return; }
    if (val.length >= len) return;
    val += k; show(); sound.beep();
    if (val.length === len) setTimeout(() => {
      if (val === code) { d.textContent = 'ОТКРЫТО'; sound.unlock(); setTimeout(() => { closeModal(); ok(); }, 600); }
      else { d.textContent = 'ОШИБКА'; d.classList.add('err'); sound.beep(false); val = ''; setTimeout(show, 900); }
    }, 200);
  };
  m.querySelectorAll('button').forEach(b => b.onclick = () => press(b.dataset.k));
  m.onkeydown = null;
  const kh = e => { if (!modalOpen) { removeEventListener('keydown', kh); return; } if (/^Digit\d$|^Numpad\d$/.test(e.code)) press(e.code.slice(-1)); if (e.code === 'Backspace') press('C'); };
  addEventListener('keydown', kh);
}
const ALPH = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ';
function openLetters(title, word, ok) {
  const st = [0, 0, 0, 0].map(() => Math.floor(Math.random() * ALPH.length));
  const m = openModal(`<div class="lock" role="dialog" aria-label="${title}"><h3>${title}</h3><p class="small">Кодовый замок с буквами. Четыре кольца.</p><div class="wheels">${st.map((_, i) => `<div class="wheel"><button type="button" data-i="${i}" data-d="-1">▲</button><div class="l" id="wl${i}"></div><button type="button" data-i="${i}" data-d="1">▼</button></div>`).join('')}</div>
    <div class="btns"><button class="btn main" id="wl-ok" type="button">Открыть</button><button class="btn" id="wl-x" type="button">Отойти</button></div></div>`, 'letters');
  const show = () => st.forEach((v, i) => $('wl' + i).textContent = ALPH[v]);
  show();
  m.querySelectorAll('.wheel button').forEach(b => b.onclick = () => { const i = +b.dataset.i; st[i] = (st[i] + +b.dataset.d + ALPH.length) % ALPH.length; show(); sound.beep(); });
  $('wl-x').onclick = closeModal;
  $('wl-ok').onclick = () => {
    if (st.map(v => ALPH[v]).join('') === word) { sound.unlock(); closeModal(); ok(); }
    else { sound.beep(false); toast('Замок не поддаётся'); }
  };
}
function openJournal() {
  if (modalOpen) return;
  const ids = [...notesRead];
  const m = openModal(`<div class="lock" id="journal" role="dialog" aria-label="Записки"><h3>Записки</h3>${ids.length ? `<ul>${ids.map(id => `<li><button class="btn" type="button" data-n="${id}">${NOTES[id].title}</button></li>`).join('')}</ul>` : '<p class="small">Пока ничего не найдено.</p>'}<button class="btn" type="button" id="j-x">Закрыть</button></div>`, 'journal');
  m.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { closeModal(); showNote(b.dataset.n); });
  $('j-x').onclick = closeModal;
}
function showHint() { const t = HINTS[phase === 'free' ? 'boss' : phase]; if (t) { $('sub').innerHTML = `<b style="color:var(--moss)">Подсказка</b> ${t}`; $('sub').hidden = false; clearTimeout(showHint._t); showHint._t = setTimeout(() => $('sub').hidden = true, 7000); } }

// ---------------------------------------------------------------- сценки
function ghostAt(x, y, z, ry) { GH.root.position.set(x, y, z); GH.root.rotation.y = ry; GH.root.visible = true; GH.targetAlpha = 0.5; L.ghost.position.set(x, y + 1.4, z + 0.4); sound.whisper(); }
function ghostHide() { GH.targetAlpha = 0; }
async function studyGhostScene() {
  if (flags.ghost1) return; flags.ghost1 = true; busy = true;
  ghostAt(8.7, 0, -7.0, -0.6);
  sound.tone(220, 3, 'sine', 0.05, sound.verb);
  await voice.say('dan', 'Дед?..');
  await voice.say('ded', 'Даня. Как ты вырос. Не трать на меня время, внук. У меня его больше нет.');
  await voice.say('ded', 'Он держит Аню внизу. Ключ от подвала в сейфе. Код ты найдёшь в моём дневнике.');
  await voice.say('ded', 'И когда откроешь сейф... беги.');
  ghostHide(); busy = false;
}
async function openSafe() {
  flags.safeOpen = true; sound.metal();
  world.safe.doorP.rotation.y = -1.6;
  inv.basementKey = true; inv.bolts = 3; updateInv();
  toast('Ключ от подвала · серебряные болты ×3');
  await sleep(500); showNote('safe'); await waitModal();
  // пробуждение
  busy = true;
  checkpoint('awake', true);
  await sleep(300);
  flicker(2.5); sound.stinger(); sound.thunder();
  skActivate(true);
  setPhase('awake');
  await voice.say('storozh', 'Аркаша?.. Это ты пришёл?');
  await voice.say('dan', 'Что это было?.. Это из гостиной.');
  busy = false;
  if (!inv.axe) setTimeout(() => toast('Аня писала, что спрятала топор на кухне'), 1200);
}
function skActivate(awaken) {
  sk.active = true; sk.basement = false; sk.axeHits = 0; sk.silver = 0; sk.path = [];
  if (awaken) { sk.pos.set(5.6, 0, 2.2); skSet('awaken'); sound.bones(0.6); }
  else { sk.pos.set(6.5, 0, 4.4); skSet('patrol'); }
}
async function descend() {
  busy = true; $('fade').classList.add('on'); sound.creak(1.2, 0.15); await sleep(900);
  hero.basement = true; hero.pos.set(-7, -4, -5.2); camYaw = Math.PI * 0.85; hero.vy = 0;
  sound.setUnderground(true); scene.fog.density = 0.07;
  if (phase === 'awake') { sk.active = false; sk.path = []; skSet('idle'); sk.pos.set(-20, 0, -20); setPhase('basement'); checkpoint('basement'); }
  await sleep(300); $('fade').classList.remove('on'); busy = false;
  if (!flags.anyaTalk && phase === 'basement') voice.say('dan', 'Аня?.. Аня!');
}
async function ascend() {
  busy = true; $('fade').classList.add('on'); await sleep(800);
  hero.basement = false; hero.pos.set(-6.6, 0, -4.8); sound.setUnderground(false); scene.fog.density = 0.05;
  if (phase === 'basement' && !sk.active) skActivate(false);
  await sleep(300); $('fade').classList.remove('on'); busy = false;
}
async function basementScene() {
  flags.anyaTalk = true; busy = true;
  await voice.say('dan', 'Аня! Аня, ты меня слышишь?');
  await voice.say('anya', 'Даня?.. Ты пришёл... Он говорит бабушкиным голосом. Он сказал, в полночь мне будет не больно.');
  ghostAt(0.6, -4, -1.2, -2.2);
  await voice.say('ded', 'Цепь не порвать руками. Ключ он проглотил, держит у себя внутри. Его придётся убить.');
  await voice.say('ded', 'Арбалет в сундуке. Замок открывается именем. Ты его уже видел, во дворе.');
  ghostHide(); busy = false;
}
async function openChest() {
  flags.chestOpen = true; world.chest.lidP.rotation.x = -1.9; world.chest.lock.visible = false; sound.metal();
  inv.crossbow = true; hero.weapon = 'crossbow'; inv.bolts = Math.max(inv.bolts, 3); equipVisual(); updateInv();
  toast('Арбалет деда' + (IS_TOUCH ? ' · «Удар» — выстрел' : ' · ЛКМ — выстрел, Q — сменить оружие'));
  busy = true;
  await sleep(1200);
  // Сторож спускается
  sk.active = true; sk.basement = true; sk.silver = 0; sk.axeHits = 0; sk.pos.set(-7, -4, -5.0); sk.yaw = 0; skSet('taunt');
  sound.stinger(); flicker(1.5);
  setPhase('boss'); checkpoint('boss');
  await voice.say('storozh', 'Это моя девочка. Моя полночь. Отдай.');
  busy = false;
}
async function bossDefeated() {
  sound.bones(0.8); sound.thunder(); toast('Сторож повержен');
  busy = true;
  world.remainsI.pos.copy(sk.pos).setY(-3.6);
  await sleep(1500);
  await voice.say('anya', 'Он... он больше не двигается?');
  await voice.say('dan', 'Нет. Теперь нет.');
  busy = false;
}
async function freeAnya() {
  flags.anyaFree = true; busy = true; sound.unlock(); sound.metal();
  AN.play('Sit_Floor_StandUp', 0.2, true); setTimeout(() => AN.play('Idle', 0.4), 2200);
  await voice.say('anya', 'Даня... Я думала, ты не приедешь.');
  await voice.say('dan', 'Я всегда приезжаю. Пошли отсюда.');
  ghostAt(-3.5, -4, -1.5, 2.5);
  await voice.say('ded', 'Спасибо, внук. Вера ждёт меня. Теперь по-настоящему.');
  ghostHide();
  await sleep(1200);
  $('fade').classList.add('on'); await sleep(1200);
  showEnd('good');
}
let flickerT = 0;
function flicker(sec) { flickerT = sec; }

// ---------------------------------------------------------------- контрольные точки
let cp = null;
function snapshot(name) {
  return { name, inv: { ...inv }, flags: { ...flags }, notes: [...notesRead], phase, time: gameTime, hp: 3 };
}
function checkpoint(name, silent) {
  cp = snapshot(name); store.set('gl_save', cp);
  if (!silent) toast('Контрольная точка', 1500);
}
function applySnapshot(s) {
  Object.assign(inv, s.inv); for (const k of Object.keys(flags)) delete flags[k]; Object.assign(flags, s.flags);
  notesRead.clear(); s.notes.forEach(n => notesRead.add(n)); gameTime = s.time;
  hero.hp = 3; hero.dead = false; hero.hidden = false; hero.action = null; hero.vy = 0; hero.invul = 2;
  H.root.visible = true; H.play('Idle', 0);
  hero.weapon = inv.crossbow ? 'crossbow' : inv.axe ? 'axe' : null; equipVisual();
  world.doors.front.setOpen(!!flags.frontOpen, true); world.doors.study.setOpen(!!flags.studyOpen, true);
  world.safe.doorP.rotation.y = flags.safeOpen ? -1.6 : 0;
  if (world.axeProp) world.axeProp.visible = !inv.axe;
  if (world.rug) world.rug.position.x = flags.rugMoved ? -8.6 : -7;
  world.chest.lidP.rotation.x = flags.chestOpen ? -1.9 : 0; world.chest.lock.visible = !flags.chestOpen;
  GH.targetAlpha = 0; GH.alpha = 0; GH.root.visible = false;
  AN.play('Lie_Idle', 0);
  sk.path = []; sk.silver = 0; sk.axeHits = 0;
  const p = s.name;
  const spawn = { yard: [0, 0, 24, 0, false], house: [0, 0, 6.5, 0, false], awake: [6.5, 0, -3, Math.PI / 2, false], basement: [-7, -4, -5.2, Math.PI * 0.85, true], boss: [1.4, -4, -6.2, Math.PI * 0.5, true] }[p];
  hero.pos.set(spawn[0], spawn[1], spawn[2]); camYaw = spawn[3]; hero.basement = spawn[4];
  sound.setUnderground(hero.basement); scene.fog.density = hero.basement ? 0.07 : 0.05;
  if (p === 'yard' || p === 'house') { sk.active = false; sk.basement = false; sk.pos.set(5.6, 0, 2.2); sk.yaw = -1.2; skSet('dormant'); }
  else if (p === 'awake') { sk.active = true; sk.basement = false; sk.pos.set(-6.5, 0, 5.6); skSet('patrol'); }
  else if (p === 'basement') { sk.active = false; sk.basement = false; sk.pos.set(-20, 0, -20); skSet('idle'); }
  else if (p === 'boss') { sk.active = true; sk.basement = true; sk.pos.set(-7, -4, -5.0); skSet('chase'); sk.seen = 5; }
  setPhase(s.phase === 'free' ? 'boss' : s.phase);
  updateInv();
}

// ---------------------------------------------------------------- экраны
function showEnd(kind) {
  state = 'end'; releaseLock(); voice.stop();
  $('hud').hidden = true; $('touch').hidden = true;
  const e = $('end'); e.hidden = false;
  const T = {
    death: ['Контрольная точка', 'Ты не дошёл', 'Где-то наверху бабушкины часы снова пошли. Тик. Так. До полуночи ещё есть время, если вернуться.', 'Вернуться'],
    late: ['00:00', 'Полночь', 'Свечи в подвале погасли разом. Аня открыла глаза. Улыбнулась бабушкиной улыбкой. «Даня, — сказала она чужим голосом, — ты так вырос».', 'Попробовать снова'],
    good: ['23:' + String(Math.floor((gameTime % 3600) / 60)).padStart(2, '0') + ' · Глухово', 'Мы вышли из дома', 'Дождь кончился. Мы шли к станции по мокрой дороге, и Аня держала меня за рукав, как в детстве. У калитки её телефон завибрировал. Одно новое сообщение. Отправитель: «Дедушка». Текст: «вы забыли закрыть люк».', 'Сыграть ещё раз'],
  }[kind];
  $('end-eyebrow').textContent = T[0]; $('end-title').textContent = T[1]; $('end-text').textContent = T[2]; $('b-end').textContent = T[3];
  $('end-credits').textContent = kind === 'good' ? 'Глухово. Сюжет, код, звук и бит — сделаны для этой игры. Модели — Kay Lousberg, KayKit (CC0). Спасибо, что дошёл.' : '';
  if (kind !== 'death') sound.startBeat();
  $('b-end').onclick = () => {
    e.hidden = true; sound.stopBeat();
    if (kind === 'death' && cp) { applySnapshot(cp); resume(); }
    else if (kind === 'late' && cp) { applySnapshot({ ...cp, time: Math.min(cp.time, 23 * 3600 + 40 * 60) }); resume(); }
    else { store.set('gl_save', null); location.reload(); }
  };
}
function resume() {
  state = 'play'; $('hud').hidden = false; if (IS_TOUCH) $('touch').hidden = false;
  $('pause').hidden = true; $('fade').classList.remove('on'); clock.getDelta();
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'pause'; releaseLock(); $('pause').hidden = false; try { window.speechSynthesis?.pause(); } catch (e) { }
}
$('b-resume').onclick = () => { try { window.speechSynthesis?.resume(); } catch (e) { } resume(); };
$('b-restart').onclick = () => { if (cp) applySnapshot(cp); voice.stop(); resume(); };
$('b-voice').onclick = () => { voice.muted = !voice.muted; $('b-voice').textContent = 'Озвучка: ' + (voice.muted ? 'выкл' : 'вкл'); if (voice.muted) try { window.speechSynthesis?.cancel(); } catch (e) { } };
$('b-view').onclick = toggleView;
$('b-pause').onclick = pauseGame; $('b-hint').onclick = showHint; $('b-journal').onclick = openJournal;
$('b-q').textContent = 'Графика: ' + (QUALITY === 'high' ? 'высокая' : 'быстрая');
$('b-q').onclick = () => { store.set('gl_q', QUALITY === 'high' ? 'low' : 'high'); location.reload(); };
if (IS_TOUCH) { $('ctrl-pc').hidden = true; $('ctrl-touch').hidden = false; }
$('weapon').style.pointerEvents = 'auto'; $('weapon').onclick = cycleWeapon;

async function startGame(fromSave) {
  sound.init(); sound.stopBeat();
  try { window.speechSynthesis?.getVoices(); } catch (e) { }
  $('menu').hidden = true; $('hud').hidden = false; if (IS_TOUCH) { document.body.classList.add('touch'); setupTouch(); }
  if (fromSave && store.get('gl_save')) { cp = store.get('gl_save'); applySnapshot(cp); resume(); return; }
  cp = snapshot('yard'); applySnapshot(cp); setPhase('yard');
  state = 'play'; clock.getDelta();
  $('fade').classList.add('on'); await sleep(100); $('fade').classList.remove('on');
  if (!IS_TOUCH) toast('Кликни по экрану, чтобы управлять мышью', 3500);
  for (const [w, t] of INTRO) await voice.say(w, t);
  voice.say('dan', 'Свет в окнах не горит. Надо попасть внутрь.');
}

// ---------------------------------------------------------------- игровой цикл
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), camTarget = new THREE.Vector3(), ray = new THREE.Ray();
let lightningT = 12, flashFlick = 1, rain;
function buildRain() {
  const n = QUALITY === 'high' ? 2200 : 900;
  const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { const x = rnd(-20, 20), y = rnd(0, 14), z = rnd(-20, 20); p.set([x, y, z, x + 0.03, y - 0.45, z], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8090a8, transparent: true, opacity: 0.35 }));
  rain.frustumCulled = false; scene.add(rain);
}
function updateRain(dt) {
  const p = rain.geometry.attributes.position.array, cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < p.length; i += 6) {
    let y = p[i + 1] - dt * 16;
    let x = p[i], z = p[i + 2];
    const inHouse = Math.abs(x) < 10.3 && z > -8.3 && z < 9.8 && y < 5.5;
    if (y < 0 || inHouse) { y = rnd(10, 14); x = cx + rnd(-18, 18); z = cz + rnd(-18, 18); }
    if (x - cx > 20) x -= 40; if (x - cx < -20) x += 40; if (z - cz > 20) z -= 40; if (z - cz < -20) z += 40;
    p[i] = x; p[i + 1] = y; p[i + 2] = z; p[i + 3] = x + 0.03; p[i + 4] = y - 0.45; p[i + 5] = z;
  }
  rain.geometry.attributes.position.needsUpdate = true;
  rain.visible = !hero.basement;
}

function updateHero(dt) {
  H.mixer.update(dt);
  if (hero.invul > 0) hero.invul -= dt;
  if (hero.dead) { H.root.position.copy(hero.pos); return; }
  if (hero.hidden) return;
  // ввод
  let mx = input.mx, mz = input.mz;
  if (!modalOpen && !busyLockMove()) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  } else { mx = 0; mz = 0; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const wantRun = (keys.ShiftLeft || keys.ShiftRight || input.touchRun || touchRun) && ml > 0.3;
  if (wantRun && hero.stamina > 0.02 && !hero.exhausted) { hero.stamina -= dt / 6; if (hero.stamina <= 0) hero.exhausted = true; }
  else { hero.stamina = Math.min(1, hero.stamina + dt / 5); if (hero.stamina > 0.35) hero.exhausted = false; }
  hero.running = wantRun && !hero.exhausted;
  const locked = hero.action === 'attack' || hero.action === 'shoot' || hero.action === 'hit' || hero.action === 'pick';
  const speed = locked ? 0.6 : hero.running ? 5.0 : 2.7;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const dx = (fx * -mz + rx * mx) * speed * dt, dz = (fz * -mz + rz * mx) * speed * dt;
  const moving = ml > 0.1;
  const aimMode = hero.weapon === 'crossbow' || firstPerson;
  if (moving) {
    const targetYaw = aimMode ? Math.atan2(fx, fz) : Math.atan2(dx, dz);
    hero.yaw = lerpAngle(hero.yaw, targetYaw, Math.min(1, dt * 12));
  } else if (aimMode) hero.yaw = lerpAngle(hero.yaw, Math.atan2(fx, fz), Math.min(1, dt * 12));
  moveCircle(hero.pos, dx, dz, 0.3, hero.pos.y);
  // гравитация и пол
  const baseFloor = hero.basement ? -4 : 0;
  let floor = baseFloor;
  for (const c of colliders) {
    if (!c.on || !c.walk) continue;
    if (hero.pos.x > c.x0 - 0.1 && hero.pos.x < c.x1 + 0.1 && hero.pos.z > c.z0 - 0.1 && hero.pos.z < c.z1 + 0.1 && hero.pos.y >= c.y1 - 0.36 && c.y0 < hero.pos.y + 0.5) floor = Math.max(floor, c.y1);
  }
  hero.vy -= 18 * dt; hero.pos.y += hero.vy * dt;
  if (hero.pos.y <= floor) {
    if (!hero.onGround && hero.vy < -3) { H.play('Jump_Land', 0.05, true); hero.landT = 0.25; sound.step(surface(), true); }
    hero.pos.y = floor; hero.vy = 0; hero.onGround = true;
  } else if (hero.pos.y > floor + 0.05) hero.onGround = false;
  if (hero.pos.y < floor + 0.3 && hero.vy <= 0 && floor > hero.pos.y) hero.pos.y = floor;
  // действия
  if (hero.action) {
    hero.actionT += dt;
    if (hero.action === 'attack' && !hero.attackHit && hero.actionT > 0.32) { hero.attackHit = true; resolveAttack(); }
    if (hero.action === 'shoot' && !hero.attackHit && hero.actionT > 0.15) { hero.attackHit = true; resolveAttack(); }
    const dur = { attack: 0.75, shoot: 0.7, hit: 0.5, pick: 0.9 }[hero.action];
    if (hero.actionT > dur) hero.action = null;
  } else {
    hero.landT = (hero.landT || 0) - dt;
    if (!hero.onGround) { if (H.cur !== H.acts.Jump_Start || hero.vy < 0) H.play('Jump_Idle', 0.2); }
    else if (hero.landT > 0) { }
    else if (moving) {
      if (aimMode) {
        const lx = mx, lz = mz;
        if (Math.abs(lx) > Math.abs(lz) * 1.2) H.play(lx > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left', 0.2);
        else if (lz > 0.2) H.play('Walking_Backwards', 0.2);
        else H.play(hero.running ? 'Running_A' : 'Walking_A', 0.2);
      } else H.play(hero.running ? 'Running_A' : 'Walking_A', 0.2);
    } else H.play(hero.weapon === 'crossbow' ? '2H_Ranged_Aiming' : 'Idle', 0.25);
  }
  // шаги
  if (moving && hero.onGround) {
    hero.stepT -= dt * (hero.running ? 2.9 : 1.9);
    if (hero.stepT <= 0) { hero.stepT = 1; sound.step(surface(), hero.running); }
  }
  // зона
  const inHouse = !hero.basement && Math.abs(hero.pos.x) < 10 && hero.pos.z > -8 && hero.pos.z < 8;
  hero.area = hero.basement ? 'base' : inHouse ? 'house' : 'out';
  sound.setIndoor(hero.area !== 'out');
  H.root.position.copy(hero.pos); H.root.rotation.y = hero.yaw;
  // триггеры
  if (inHouse && phase === 'yard') { setPhase(flags.backpack ? 'house' : 'house'); checkpoint('house'); sound.thunder(); voice.say('dan', 'Аня?.. Аня! Это я!'); }
  if (inHouse && flags.studyOpen && !flags.ghost1 && hero.pos.x > 4 && hero.pos.z < -1) studyGhostScene();
}
function busyLockMove() { return false; }
function surface() { return hero.basement ? 'stone' : hero.area === 'out' && hero.pos.z > 9.6 ? 'grass' : 'wood'; }

const camBoxes = () => colliders.filter(c => c.on && c.wall && c.cam);
function updateCamera(dt) {
  const head = hero.hidden ? new THREE.Vector3(-4.3, 1.5, -7.0) : tmpV.set(hero.pos.x, hero.pos.y + (firstPerson ? 1.6 : 1.62), hero.pos.z);
  const f = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
  const r = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
  let pos;
  if (firstPerson || hero.hidden) { pos = head.clone(); H.root.visible = false; }
  else {
    const portrait = camera.aspect < 1;
    const dist = (hero.weapon === 'crossbow' ? 2.7 : 3.4) * (portrait ? 1.3 : 1);
    const want = head.clone().addScaledVector(f, -dist).addScaledVector(r, portrait ? 0.35 : 0.7).add(new THREE.Vector3(0, 0.25, 0));
    const dir = want.clone().sub(head); const len = dir.length(); dir.normalize();
    ray.set(head, dir);
    let best = len;
    for (const c of camBoxes()) { const hit = ray.intersectBox(c.box, camTarget); if (hit) { const d = hit.distanceTo(head); if (d < best) best = d; } }
    pos = head.clone().addScaledVector(dir, Math.max(0.2, best - 0.22));
    const ceil = hero.basement ? -1.45 : hero.area === 'house' ? 2.6 : 30;
    pos.y = Math.min(pos.y, ceil); pos.y = Math.max(pos.y, (hero.basement ? -4 : 0) + 0.25);
    H.root.visible = !hero.dead ? best > 0.75 : true;
    if (hero.dead) H.root.visible = true;
  }
  camera.position.lerp(pos, firstPerson ? 1 : Math.min(1, dt * 18));
  camera.rotation.set(camPitch, camYaw, 0);
  // фонарик из плеча в точку взгляда
  const sp = hero.hidden ? head : head.clone().addScaledVector(r, firstPerson ? 0.15 : 0.25).add(new THREE.Vector3(0, firstPerson ? -0.2 : -0.1, 0));
  flash.position.copy(firstPerson ? camera.position : sp);
  flash.target.position.copy(camera.position).addScaledVector(f, 12);
}

let DEBUG_SPEED = 1;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05) * DEBUG_SPEED;
  if (state === 'play' && !modalOpen) {
    gameTime += dt * TIME_SCALE;
    if (gameTime >= 24 * 3600 && !flags.anyaFree) { state = 'cut'; voice.stop(); sound.stinger(); $('fade').classList.add('on'); setTimeout(() => showEnd('late'), 1500); }
    updateHero(dt);
    updateSkeleton(dt);
    if (boltFly) {
      boltFly.t += dt * 40 / Math.max(boltFly.len, 1);
      const p = boltFly.from.clone().lerp(boltFly.to, Math.min(1, boltFly.t));
      boltMesh.position.copy(p); boltMesh.lookAt(boltFly.to); boltMesh.rotateX(Math.PI / 2);
      if (boltFly.t >= 1) { boltMesh.visible = false; if (boltFly.hit) boltLanded(); boltFly = null; }
    }
  } else if (state === 'menu') {
    // облёт дома в меню
    const t = performance.now() / 1000 * 0.05;
    camera.position.set(Math.sin(t) * 22, 6 + Math.sin(t * 2) * 1.5, 10 + Math.cos(t) * 22);
    camera.lookAt(0, 1.5, 2);
    camYaw = camera.rotation.y;
    if (H) { H.mixer.update(dt); H.root.position.copy(hero.pos); }
    if (SK) SK.mixer.update(dt);
  }
  if (H && state !== 'menu') updateCamera(dt);
  if (GH) {
    GH.mixer.update(dt);
    GH.alpha += (GH.targetAlpha - GH.alpha) * Math.min(1, dt * 1.5);
    GH.mats.forEach(m => m.opacity = GH.alpha * (0.8 + Math.sin(performance.now() / 120) * 0.1));
    GH.root.position.y += Math.sin(performance.now() / 600) * 0.0015;
    L.ghost.intensity = GH.alpha * 6;
    if (GH.alpha < 0.01 && GH.targetAlpha === 0) GH.root.visible = false;
  }
  if (AN) AN.mixer.update(dt);
  // свет
  const t = performance.now() / 1000;
  const skNear = SK && sk.active && !['dormant', 'dead', 'down'].includes(sk.state) && hero.basement === sk.basement && Math.hypot(hero.pos.x - sk.pos.x, hero.pos.z - sk.pos.z) < 7;
  flashFlick = skNear && Math.random() < 0.12 ? Math.random() * 0.4 : Math.min(1, flashFlick + dt * 4);
  if (flickerT > 0) { flickerT -= dt; flashFlick = Math.random() < 0.5 ? 0.05 : 1; }
  flash.intensity = flashOn && state !== 'menu' ? 55 * flashFlick : 0;
  for (const k of ['coffin', 'base1', 'base2', 'lantern']) if (L[k]) L[k].intensity = L[k].userData.base * (0.8 + Math.sin(t * 11 + k.length) * 0.08 + Math.random() * 0.12) * (flickerT > 0 ? Math.random() : 1);
  L.study.intensity = flags.studyOpen ? (Math.random() < 0.03 ? 0.2 : 2.2) : 0;
  L.porch.intensity = 0;
  // молнии
  lightningT -= dt;
  if (lightningT < 0) { lightningT = rnd(14, 32); moon.intensity = 6; hemi.intensity = 2; setTimeout(() => { moon.intensity = 0.7; hemi.intensity = 1.05; }, 90); setTimeout(() => { moon.intensity = 4; }, 160); setTimeout(() => { moon.intensity = 0.7; }, 230); setTimeout(() => sound.thunder(), rnd(600, 2200)); }
  if (rain) updateRain(dt);
  // звук/интерфейс
  if (state === 'play') {
    const d = SK ? Math.hypot(hero.pos.x - sk.pos.x, hero.pos.z - sk.pos.z) : 99;
    const chase = sk.state === 'chase' || sk.state === 'attack' ? 1 : 0;
    const hr = sk.active && hero.basement === sk.basement && d < 12 && !['dead', 'down', 'dormant'].includes(sk.state) ? 60 + (12 - d) * 9 : (hero.hidden ? 70 : 0);
    sound.update(dt, chase, hr);
    focused = modalOpen ? null : findFocus();
    const pr = $('prompt');
    if (focused && !busy) { pr.hidden = false; pr.innerHTML = (IS_TOUCH ? '' : '<kbd>E</kbd>') + focused.label(); }
    else pr.hidden = true;
    $('b-use')?.classList.toggle('hot', !!focused && !busy);
    const hh = Math.floor(gameTime / 3600) % 24, mm = Math.floor(gameTime % 3600 / 60);
    $('clock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    $('clock').classList.toggle('late', hh === 23 && mm >= 50);
    $('cross').hidden = !(hero.weapon === 'crossbow' || firstPerson);
    $('stam').firstChild.style.width = (hero.stamina * 100).toFixed(0) + '%'; $('stam').classList.toggle('tired', !!hero.exhausted);
    // регенерация
    if (hero.hp < 3 && !hero.dead && performance.now() - hero.lastHurt > 35000) { hero.hp++; hero.lastHurt = performance.now(); updateInv(); }
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- старт
(async function boot() {
  const bar = $('loadbar').querySelector('i');
  // шум для зерна
  const nc = document.createElement('canvas'); nc.width = nc.height = 128; const ng = nc.getContext('2d'); const id = ng.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  ng.putImageData(id, 0, 0); $('grain').style.backgroundImage = `url(${nc.toDataURL()})`;
  await loadAll(p => bar.style.width = (p * 100).toFixed(0) + '%');
  buildWorld(); setupChars(); setupInteractables(); buildRain();
  hero.pos.set(0, 0, 24); H.root.position.copy(hero.pos);
  skSet('dormant'); SK.root.position.copy(sk.pos); SK.root.rotation.y = sk.yaw;
  updateInv();
  renderer.compile(scene, camera);
  const sb = $('b-start'); sb.disabled = false; sb.textContent = 'Начать';
  if (store.get('gl_save')?.name && store.get('gl_save').name !== 'yard') { $('b-cont').hidden = false; }
  sb.onclick = () => startGame(false);
  $('b-cont').onclick = () => startGame(true);
  loop();
  window.__g = { hero, sk, inv, flags, world, setPhase, applySnapshot, snapshot, interactables, skSet, skActivate, openSafe, descend, openChest, get phase() { return phase; }, camera, state: () => state, sound, voice, cam: v => { camYaw = v; }, speed: v => { DEBUG_SPEED = v; }, renderer, attack, interact };
})();
