// детальные процедурные модели техники; статичные части сливаются в один меш на материал
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

let M = null;
export function vehicleMats() {
  if (M) return M;
  const std = (t, o) => new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normalMap, roughness: 0.72, metalness: 0.35 }, o || {}));
  const trackTex = trackTexture();
  M = {
    green: std(camo(['#4f5a34', '#3a4227', '#6b6a45', '#2c2f22'])),
    sand: std(camo(['#8a7f58', '#6d6544', '#a39672', '#4e4a35'])),
    olive: std(TX.metal('#4c5434', false)),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.6, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.4, metalness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 }),
    track: new THREE.MeshStandardMaterial({ map: trackTex, color: 0x9a9a9a, roughness: 0.85, metalness: 0.5 }),
    canvas: new THREE.MeshStandardMaterial({ map: canvasTex(), roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.05, metalness: 0.9 }),
    light: new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0x403a28, roughness: 0.2 }),
    red: new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0x330000 }),
    white: new THREE.MeshStandardMaterial({ color: 0xc8c8bc, roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.9 }),
    burnt: new THREE.MeshStandardMaterial({ color: 0x1b1916, roughness: 1, metalness: 0.15 }),
    paint: [0x7b7d74, 0x6a2a22, 0x2e3c4c, 0xbdbdb2, 0x3f4a2e].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.55 })),
  };
  return M;
}

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function camo(cols) {
  const S = 256, c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = cols[0]; x.fillRect(0, 0, S, S);
  for (let k = 1; k < cols.length; k++) {
    x.fillStyle = cols[k];
    for (let i = 0; i < 7; i++) {
      const cx = Math.random() * S, cy = Math.random() * S, r = 18 + Math.random() * 30;
      x.beginPath();
      for (let a = 0; a < 6.28; a += 0.5) { const rr = r * (0.6 + Math.random() * 0.6); x.lineTo(cx + Math.cos(a) * rr * 1.6, cy + Math.sin(a) * rr); }
      x.fill();
    }
  }
  // пыль, грязь, царапины
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${120 + Math.random() * 40},${105 + Math.random() * 30},80,${Math.random() * 0.15})`; x.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  x.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 6; i++) { x.beginPath(); const y = Math.random() * S; x.moveTo(0, y); x.lineTo(S, y); x.stroke(); }
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0.7, 'rgba(90,75,55,0)'); g.addColorStop(1, 'rgba(90,75,55,0.4)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { map: t };
}

function trackTexture() {
  const c = cv(64, 128), x = c.getContext('2d');
  x.fillStyle = '#232321'; x.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 128; i += 16) {
    x.fillStyle = '#3c3b37'; x.fillRect(2, i + 2, 60, 10);
    x.fillStyle = '#4d4b45'; x.fillRect(28, i + 1, 8, 14);
    x.fillStyle = '#151514'; x.fillRect(0, i + 13, 64, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function canvasTex() {
  const c = cv(128, 128), x = c.getContext('2d');
  x.fillStyle = '#5b5a3c'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) { x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`; x.fillRect(0, i, 128, 2); }
  for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(40,35,20,0.2)'; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 12, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// сборщик: копит геометрию по материалам, отдаёт один меш на материал
class Parts {
  constructor() { this.map = new Map(); this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); }
  add(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    this.e.set(rx || 0, ry || 0, rz || 0);
    this.q.setFromEuler(this.e);
    this.m4.compose(new THREE.Vector3(x || 0, y || 0, z || 0), this.q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
    g.applyMatrix4(this.m4);
    let a = this.map.get(mat);
    if (!a) { a = []; this.map.set(mat, a); }
    a.push(g);
    return this;
  }
  box(mat, x, y, z, sx, sy, sz, rx, ry, rz) { return this.add(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z, rx, ry, rz); }
  // цилиндр по оси: 'x' | 'y' | 'z'
  cyl(mat, x, y, z, r1, r2, h, axis, seg) {
    const g = new THREE.CylinderGeometry(r1, r2, h, seg || 14);
    const rx = axis === 'z' ? Math.PI / 2 : 0, rz = axis === 'x' ? Math.PI / 2 : 0;
    return this.add(g, mat, x, y, z, rx, 0, rz);
  }
  // профиль [[z,y]...] в плоскости ZY, выдавленный по X шириной w
  ext(mat, pts, w, x, bevel) {
    const s = new THREE.Shape();
    pts.forEach((p, i) => (i ? s.lineTo(-p[0], p[1]) : s.moveTo(-p[0], p[1])));
    const b = bevel == null ? 0.05 : bevel;
    const g = new THREE.ExtrudeGeometry(s, { depth: w - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
    g.translate(0, 0, -(w - b * 2) / 2);
    g.rotateY(Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    return this.add(g, mat, x || 0, 0, 0);
  }
  build(shadow) {
    const grp = new THREE.Group();
    for (const [mat, list] of this.map) {
      const g = mergeGeometries(list, false);
      list.forEach(q => q.dispose());
      const m = new THREE.Mesh(g, mat);
      m.castShadow = shadow !== false; m.receiveShadow = true;
      grp.add(m);
    }
    return grp;
  }
}

function wheel(mat, tire, r, w, spokes) {
  // одно колесо = один меш (вращается целиком)
  const P = new Parts();
  P.cyl(M.dark, 0, 0, 0, r, r, w, 'x', 18);
  P.cyl(M.dark, w * 0.06, 0, 0, r * 0.64, r * 0.64, w * 1.02, 'x', 14);
  P.cyl(M.dark, w * 0.14, 0, 0, r * 0.2, r * 0.24, w * 1.1, 'x', 8);
  for (let i = 0; i < (spokes || 6); i++) {
    const a = i / (spokes || 6) * Math.PI * 2;
    P.cyl(M.dark, w * 0.52, Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, 0.035, 0.035, 0.04, 'x', 5);
  }
  return P.build();
}

// ---------- танк ----------
function tank(body) {
  const H = new Parts();
  // корпус: профиль с наклонным лбом и кормой
  H.ext(body, [[-3.55, 0.75], [-2.55, 1.55], [3.1, 1.55], [3.45, 1.25], [3.4, 0.6], [-3.3, 0.5]], 2.3, 0, 0.06);
  // надгусеничные полки и бортовые экраны
  for (const s of [-1, 1]) {
    H.box(body, s * 1.55, 1.48, 0, 0.75, 0.06, 6.7);
    H.box(M.rubber, s * 1.88, 1.1, -0.3, 0.05, 0.7, 5.4);
    for (let i = 0; i < 6; i++) H.box(body, s * 1.9, 1.32, -2.8 + i * 1.0, 0.06, 0.32, 0.9);
    // ящики ЗИП и бочки
    H.box(M.olive, s * 1.6, 1.72, 0.9, 0.55, 0.4, 1.6);
    H.box(M.olive, s * 1.6, 1.68, -1.3, 0.55, 0.32, 1.0);
  }
  // гусеницы: верхняя, нижняя ветви и наклонные участки
  const tr = new Parts();
  for (const s of [-1, 1]) {
    const x = s * 1.5;
    tr.box(M.track, x, 1.3, -0.1, 0.62, 0.08, 6.1);
    tr.box(M.track, x, 0.07, 0, 0.62, 0.1, 5.4);
    tr.box(M.track, x, 0.6, -3.15, 0.62, 0.08, 1.4, -0.95);
    tr.box(M.track, x, 0.65, 3.05, 0.62, 0.08, 1.4, 0.9);
    for (let i = 0; i < 6; i++) {
      const z = -2.45 + i * 0.98;
      H.cyl(M.rubber, x, 0.44, z, 0.38, 0.38, 0.52, 'x', 16);
      H.cyl(body, x + s * 0.2, 0.44, z, 0.27, 0.27, 0.16, 'x', 12);
      H.cyl(M.steel, x + s * 0.28, 0.44, z, 0.08, 0.08, 0.06, 'x', 8);
    }
    for (let i = 0; i < 3; i++) H.cyl(M.dark, x, 1.18, -1.6 + i * 1.5, 0.1, 0.1, 0.4, 'x', 8);
    H.cyl(M.dark, x, 0.75, 3.15, 0.36, 0.36, 0.5, 'x', 10); // ведущее колесо
    H.cyl(M.dark, x, 0.72, -3.2, 0.32, 0.32, 0.5, 'x', 10); // ленивец
  }
  // динамическая защита на лбу
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) H.box(M.olive, -1.0 + i * 0.4, 1.15 + r * 0.28, -2.95 + r * 0.3, 0.36, 0.08, 0.36, -0.98);
  // фары, буксирные крюки, бревно на корме, выхлоп
  for (const s of [-1, 1]) { H.cyl(M.light, s * 1.05, 1.55, -2.55, 0.09, 0.09, 0.08, 'z', 10); H.box(M.dark, s * 0.7, 0.75, -3.5, 0.15, 0.15, 0.2); }
  H.cyl(M.wood, 0, 1.75, 3.25, 0.15, 0.15, 3.0, 'x', 8);
  for (const s of [-1, 1]) H.cyl(M.olive, s * 0.85, 1.45, 3.55, 0.28, 0.28, 0.8, 'x', 14);
  H.box(M.dark, -1.2, 1.2, 2.2, 0.06, 0.25, 0.9);
  // решётки МТО
  for (let i = 0; i < 6; i++) H.box(M.dark, -0.7 + i * 0.28, 1.57, 2.3, 0.18, 0.02, 1.2);

  const g = H.build();
  const trk = tr.build();
  g.add(trk);

  // башня
  const T = new Parts();
  const dome = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  T.add(dome, body, 0, 0, 0.15, 0, 0, 0, 1.45, 0.7, 1.7);
  T.cyl(body, 0, 0.05, 0.1, 1.5, 1.55, 0.12, 'y', 24);
  // клин ДЗ на лбу башни
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) T.box(M.olive, s * (0.45 + i * 0.3), 0.42 - i * 0.05, -1.2 + i * 0.18, 0.28, 0.3, 0.5, 0, s * 0.45);
  T.box(M.olive, 0, 0.72, -0.4, 0.9, 0.06, 0.9);
  // командирская башенка, пулемёт, прицелы
  T.cyl(body, 0.55, 0.75, 0.45, 0.32, 0.36, 0.28, 'y', 14);
  T.cyl(M.dark, 0.55, 0.92, 0.45, 0.3, 0.3, 0.06, 'y', 14);
  T.box(M.dark, 0.55, 1.05, 0.15, 0.12, 0.12, 0.3);
  T.cyl(M.dark, 0.55, 1.05, -0.35, 0.025, 0.025, 1.0, 'z', 6);
  T.box(M.dark, -0.55, 0.78, -0.1, 0.35, 0.28, 0.4);
  T.box(M.glass, -0.55, 0.82, -0.31, 0.25, 0.14, 0.02);
  T.cyl(M.light, -0.95, 0.65, -0.6, 0.12, 0.12, 0.1, 'z', 12);
  // дымовые гранатомёты
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) T.cyl(M.dark, s * (1.05 + i * 0.07), 0.45, -0.3 + i * 0.22, 0.05, 0.05, 0.3, 'z', 6);
  // ящик на корме башни, антенна
  T.box(M.olive, 0, 0.35, 1.65, 1.6, 0.45, 0.45);
  T.cyl(M.dark, -0.8, 1.6, 1.2, 0.01, 0.015, 2.6, 'y', 4);
  // противодроновый «мангал»
  for (const a of [[-1.4, -1.3], [1.4, -1.3], [-1.4, 1.6], [1.4, 1.6]]) T.cyl(M.dark, a[0], 1.0, a[1], 0.03, 0.03, 1.5, 'y', 4);
  for (const z of [-1.3, 1.6]) T.box(M.dark, 0, 1.75, z, 2.85, 0.04, 0.04);
  for (const x of [-1.4, 1.4]) T.box(M.dark, x, 1.75, 0.15, 0.04, 0.04, 2.95);
  for (let i = 0; i < 9; i++) T.box(M.dark, -1.4 + i * 0.35, 1.76, 0.15, 0.015, 0.015, 2.9);
  const turret = T.build();
  turret.position.set(0, 1.55, -0.2);
  g.add(turret);
  // пушка
  const Gp = new Parts();
  Gp.box(body, 0, 0, -0.1, 0.6, 0.42, 0.5);
  Gp.cyl(M.dark, 0, 0, -2.6, 0.08, 0.11, 4.6, 'z', 12);
  Gp.cyl(body, 0, 0, -1.2, 0.16, 0.16, 1.6, 'z', 12);
  Gp.cyl(body, 0, 0, -2.9, 0.17, 0.15, 0.55, 'z', 12); // эжектор
  Gp.cyl(M.dark, 0, 0, -4.9, 0.11, 0.1, 0.2, 'z', 12);
  const gun = Gp.build();
  gun.position.set(0, 0.38, -1.15);
  turret.add(gun);
  g.userData = { turret, gun, track: trk };
  return { g, wheels: [] };
}

// ---------- БМП ----------
function ifv(body) {
  const H = new Parts();
  H.ext(body, [[-3.4, 0.7], [-2.2, 1.45], [-1.9, 1.75], [3.2, 1.75], [3.3, 0.8], [-3.0, 0.55]], 2.9, 0, 0.05);
  const tr = new Parts();
  for (const s of [-1, 1]) {
    const x = s * 1.42;
    tr.box(M.track, x, 1.05, 0, 0.5, 0.07, 5.9);
    tr.box(M.track, x, 0.07, 0, 0.5, 0.1, 5.2);
    for (let i = 0; i < 6; i++) { H.cyl(M.rubber, x, 0.4, -2.4 + i * 0.95, 0.35, 0.35, 0.45, 'x', 16); H.cyl(M.steel, x + s * 0.24, 0.4, -2.4 + i * 0.95, 0.12, 0.12, 0.05, 'x', 8); }
    H.box(body, s * 1.5, 1.2, 0, 0.6, 0.05, 6.2);
    H.box(M.olive, s * 1.5, 1.4, 1.5, 0.45, 0.35, 1.8);
  }
  // кормовые двери, люки десанта, фары, волноотражатель
  for (const s of [-1, 1]) { H.box(M.dark, s * 0.55, 1.15, 3.28, 0.85, 0.9, 0.06); H.box(M.dark, s * 0.6, 1.78, 1.6, 0.8, 0.05, 1.5); H.cyl(M.light, s * 1.1, 1.45, -2.25, 0.08, 0.08, 0.08, 'z', 10); }
  H.box(body, 0, 1.0, -3.2, 2.6, 0.05, 0.6, -0.5);
  const g = H.build();
  const trk = tr.build(); g.add(trk);
  const T = new Parts();
  T.cyl(body, 0, 0.25, 0, 0.95, 1.1, 0.5, 'y', 8);
  T.cyl(M.dark, 0.4, 0.6, 0.2, 0.25, 0.28, 0.2, 'y', 10);
  T.box(M.dark, -0.55, 0.6, -0.3, 0.3, 0.3, 0.35);
  T.cyl(M.dark, 0.6, 0.35, -0.8, 0.07, 0.07, 0.8, 'z', 6); // ПТУР
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) T.cyl(M.dark, s * 0.95, 0.4, -0.2 + i * 0.2, 0.04, 0.04, 0.25, 'z', 6);
  const turret = T.build(); turret.position.set(0, 1.75, -0.3); g.add(turret);
  const Gp = new Parts();
  Gp.box(body, 0, 0, 0, 0.3, 0.25, 0.4);
  Gp.cyl(M.dark, 0, 0, -1.4, 0.04, 0.05, 2.4, 'z', 8);
  Gp.cyl(M.dark, 0, 0, -2.6, 0.06, 0.06, 0.15, 'z', 8);
  const gun = Gp.build(); gun.position.set(0, 0.35, -0.8); turret.add(gun);
  g.userData = { turret, gun, track: trk };
  return { g, wheels: [] };
}

// ---------- БТР ----------
function apc(body) {
  const H = new Parts();
  H.ext(body, [[-3.8, 1.0], [-3.1, 1.55], [-2.4, 2.1], [3.3, 2.1], [3.7, 1.6], [3.5, 0.8], [-3.4, 0.7]], 2.7, 0, 0.06);
  // ниши колёс, ступени, двери, люки
  for (const s of [-1, 1]) {
    H.box(M.dark, s * 1.36, 1.55, -0.1, 0.06, 0.7, 0.9);
    H.box(M.olive, s * 1.38, 1.8, 1.9, 0.12, 0.35, 1.2);
    H.box(body, s * 1.3, 2.08, -1.2, 0.3, 0.06, 4.0);
  }
  H.box(M.glass, 0.55, 1.85, -2.8, 0.55, 0.28, 0.04, -0.75);
  H.box(M.glass, -0.55, 1.85, -2.8, 0.55, 0.28, 0.04, -0.75);
  for (const s of [-1, 1]) { H.cyl(M.light, s * 1.0, 1.4, -3.55, 0.09, 0.09, 0.08, 'z', 10); H.box(M.dark, s * 0.5, 2.15, 0.3, 0.6, 0.05, 0.6); }
  H.box(M.dark, 0, 1.4, -3.7, 1.8, 0.2, 0.15);
  const g = H.build();
  const wheels = [];
  for (const s of [-1, 1]) for (const z of [-2.4, -1.05, 0.75, 2.1]) {
    const w = wheel(body, M.rubber, 0.62, 0.42, 6);
    w.position.set(s * 1.38, 0.62, z); if (s < 0) w.rotation.y = Math.PI;
    g.add(w); wheels.push(w);
  }
  const T = new Parts();
  T.cyl(body, 0, 0.2, 0, 0.6, 0.72, 0.4, 'y', 8);
  T.add(new THREE.ConeGeometry(0.6, 0.35, 8), body, 0, 0.55, 0, 0, Math.PI / 8, 0);
  T.box(M.dark, 0.35, 0.5, -0.3, 0.15, 0.15, 0.25);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) T.cyl(M.dark, s * 0.6, 0.35, -0.1 + i * 0.18, 0.04, 0.04, 0.22, 'z', 6);
  const turret = T.build(); turret.position.set(0, 2.1, -0.9); g.add(turret);
  const Gp = new Parts();
  Gp.box(body, 0, 0, 0, 0.25, 0.22, 0.35);
  Gp.cyl(M.dark, 0, 0, -1.2, 0.04, 0.05, 2.1, 'z', 8);
  Gp.cyl(M.dark, 0.18, 0, -0.5, 0.02, 0.02, 0.8, 'z', 6);
  const gun = Gp.build(); gun.position.set(0, 0.35, -0.45); turret.add(gun);
  g.userData = { turret, gun };
  return { g, wheels };
}

// ---------- грузовик / РЭБ ----------
function truck(body, ew) {
  const H = new Parts();
  H.box(M.dark, 0, 0.95, 0.3, 1.1, 0.28, 7.0); // рама
  // кабина с капотом
  H.ext(body, [[-3.65, 0.95], [-3.65, 1.75], [-3.3, 1.85], [-2.7, 1.9], [-2.6, 2.75], [-1.45, 2.8], [-1.45, 0.95]], 2.4, 0, 0.06);
  H.box(M.glass, 0, 2.3, -2.66, 2.1, 0.62, 0.03, 0.12);
  for (const s of [-1, 1]) {
    H.box(M.glass, s * 1.21, 2.3, -2.05, 0.03, 0.55, 0.9);
    H.box(M.dark, s * 1.25, 2.25, -2.75, 0.04, 0.2, 0.3);
    H.cyl(M.light, s * 0.8, 1.55, -3.67, 0.11, 0.11, 0.06, 'z', 12);
    H.box(body, s * 1.15, 1.45, -2.6, 0.4, 0.06, 1.1); // крылья
    H.box(M.olive, s * 1.05, 1.0, -0.8, 0.5, 0.45, 0.7); // бак
  }
  H.box(M.dark, 0, 1.15, -3.72, 2.3, 0.25, 0.12); // бампер
  for (let i = 0; i < 6; i++) H.box(M.dark, -0.6 + i * 0.24, 1.45, -3.66, 0.1, 0.45, 0.02);
  if (!ew) {
    H.box(M.wood, 0, 1.35, 1.25, 2.5, 0.12, 4.8);
    for (const s of [-1, 1]) H.box(M.wood, s * 1.22, 1.75, 1.25, 0.06, 0.7, 4.8);
    H.box(M.wood, 0, 1.75, 3.62, 2.5, 0.7, 0.06);
    H.box(M.canvas, 0, 2.45, 1.25, 2.5, 1.3, 4.7);
    H.add(new THREE.CylinderGeometry(1.25, 1.25, 4.7, 16, 1, false, 0, Math.PI), M.canvas, 0, 3.1, 1.25, Math.PI / 2, 0, -Math.PI / 2, 1, 1, 0.3);
  } else {
    H.box(body, 0, 2.25, 1.25, 2.5, 2.0, 4.6);
    H.box(M.dark, 1.26, 2.0, 2.2, 0.04, 1.2, 0.7);
    H.box(M.glass, -1.26, 2.6, 0.5, 0.03, 0.4, 0.6);
    H.box(M.olive, 0, 3.3, 2.8, 1.2, 0.3, 1.2);
    for (let i = 0; i < 4; i++) H.cyl(M.white, -0.8 + i * 0.55, 3.6, 0.2, 0.04, 0.04, 0.7, 'y', 6);
  }
  const g = H.build();
  const wheels = [];
  for (const s of [-1, 1]) for (const z of [-2.55, 1.0, 2.35]) {
    const w = wheel(body, M.rubber, 0.58, 0.4, 8);
    w.position.set(s * 1.05, 0.58, z); if (s < 0) w.rotation.y = Math.PI;
    g.add(w); wheels.push(w);
  }
  if (ew) {
    const P = new Parts();
    P.cyl(M.steel, 0, 1.5, 0, 0.07, 0.1, 3.0, 'y', 8);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      P.box(M.white, Math.cos(a) * 0.35, 2.3 + k * 0.45, Math.sin(a) * 0.35, 0.06, 0.06, 0.7, 0, a, 0);
    }
    P.add(new THREE.SphereGeometry(0.12, 8, 6), M.red, 0, 3.15, 0);
    const mast = P.build(false);
    mast.position.set(0, 3.25, 1.8);
    g.add(mast);
    g.userData = { mast };
  } else g.userData = {};
  return { g, wheels };
}

// ---------- пикап ----------
function car() {
  const paint = M.paint[Math.floor(Math.random() * M.paint.length)];
  const H = new Parts();
  H.ext(paint, [[-2.45, 0.5], [-2.45, 0.95], [-1.4, 1.05], [-0.9, 1.65], [0.3, 1.68], [0.45, 1.05], [2.35, 1.05], [2.4, 0.5]], 1.9, 0, 0.08);
  H.box(M.glass, 0, 1.38, -1.17, 1.65, 0.55, 0.03, -0.85);
  for (const s of [-1, 1]) { H.box(M.glass, s * 0.95, 1.38, -0.3, 0.03, 0.42, 1.0); H.cyl(M.light, s * 0.7, 0.85, -2.46, 0.1, 0.1, 0.05, 'z', 10); }
  H.box(M.dark, 0, 0.55, -2.5, 1.95, 0.18, 0.12);
  H.box(M.dark, 0, 0.55, 2.42, 1.95, 0.18, 0.12);
  // турель на кузове
  H.cyl(M.steel, 0, 1.6, 1.4, 0.05, 0.05, 1.1, 'y', 6);
  H.box(M.dark, 0, 2.2, 1.4, 0.18, 0.2, 0.6);
  H.cyl(M.dark, 0, 2.22, 0.6, 0.03, 0.03, 1.2, 'z', 6);
  H.box(M.olive, 0, 1.25, 1.6, 1.2, 0.4, 0.8);
  const g = H.build();
  const wheels = [];
  for (const s of [-1, 1]) for (const z of [-1.55, 1.5]) {
    const w = wheel(M.dark, M.rubber, 0.4, 0.3, 5);
    w.position.set(s * 0.88, 0.4, z); if (s < 0) w.rotation.y = Math.PI;
    g.add(w); wheels.push(w);
  }
  g.userData = {};
  return { g, wheels };
}

export function buildVehicle(type) {
  vehicleMats();
  const body = Math.random() < 0.35 ? M.sand : M.green;
  if (type === 'tank') return tank(body);
  if (type === 'ifv') return ifv(body);
  if (type === 'apc') return apc(body);
  if (type === 'truck') return truck(body, false);
  if (type === 'ew') return truck(M.green, true);
  return car();
}
