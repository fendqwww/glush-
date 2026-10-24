// процедурные текстуры на canvas: бетон, крашеные стены, кожухи видеокарт, вертушки, плакаты
import * as THREE from 'three';

let seed = 1337;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
// пятна шума поверх
function speckle(g, w, h, n, a, dark, light, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(${dark},${a * rnd()})` : `rgba(${light},${a * rnd()})`;
    const s = size * (0.5 + rnd());
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}
function blotch(g, w, h, n, col, rmin, rmax, a) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rmin + rnd() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${a * (0.4 + rnd() * 0.6)})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function crack(g, x, y, len, col, wdt) {
  g.strokeStyle = col; g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y);
  let a = rnd() * 6.28;
  for (let i = 0; i < len; i++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); if (rnd() < 0.08) crack(g, x, y, len / 3, col, wdt * 0.6); }
  g.stroke();
}

export function floorTex() {
  const w = 1024, h = 1024, c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = '#6b6862'; g.fillRect(0, 0, w, h);
  blotch(g, w, h, 70, '40,38,34', 40, 180, 0.25);
  blotch(g, w, h, 40, '150,146,138', 30, 140, 0.18);
  speckle(g, w, h, 26000, 0.35, '30,30,30', '200,200,190', 2);
  // масляные пятна
  blotch(g, w, h, 8, '20,18,15', 30, 90, 0.55);
  // швы плит
  g.strokeStyle = 'rgba(25,24,22,0.7)'; g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke(); }
  for (let i = 0; i < 7; i++) crack(g, rnd() * w, rnd() * h, 25, 'rgba(30,28,25,0.5)', 1.2);
  const map = tex(c, true);
  return map;
}

export function wallTex() {
  // 4 м × 2.7 м: снизу советская зелёная краска, сверху побелка
  const w = 1024, h = 704, c = cv(w, h), g = c.getContext('2d');
  const split = h * (1 - 1.35 / 2.7);
  g.fillStyle = '#c9c4b6'; g.fillRect(0, 0, w, split);
  blotch(g, w, split, 60, '150,140,120', 30, 150, 0.22);
  blotch(g, w, split, 25, '110,100,80', 20, 70, 0.25); // подтёки
  // подтёки сверху вниз
  for (let i = 0; i < 18; i++) {
    const x = rnd() * w, len = 40 + rnd() * 200;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(100,85,60,0.35)'); gr.addColorStop(1, 'rgba(100,85,60,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 3 + rnd() * 10, len);
  }
  g.fillStyle = '#2f5b52'; g.fillRect(0, split, w, h - split);
  blotch(g, w, h - split, 50, '20,45,40', 20, 120, 0.3);
  // сколы краски — виден бетон
  for (let i = 0; i < 30; i++) {
    const x = rnd() * w, y = split + rnd() * (h - split), r = 2 + rnd() * 8;
    g.fillStyle = '#8d877b'; g.beginPath();
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, rr = r * (0.5 + rnd() * 0.7); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
    g.fill();
  }
  // полоса раздела
  g.fillStyle = '#1d3d37'; g.fillRect(0, split - 4, w, 6);
  speckle(g, w, h, 30000, 0.25, '20,20,20', '230,230,220', 2);
  for (let i = 0; i < 6; i++) crack(g, rnd() * w, rnd() * split, 18, 'rgba(70,64,55,0.6)', 1.3);
  // плинтус грязи
  const gr = g.createLinearGradient(0, h - 50, 0, h);
  gr.addColorStop(0, 'rgba(15,15,10,0)'); gr.addColorStop(1, 'rgba(15,15,10,0.55)');
  g.fillStyle = gr; g.fillRect(0, h - 50, w, 50);
  return tex(c, true);
}

export function bunkerTex() {
  // бомбоубежище: голый бетон, опалубка, трафаретные надписи
  const w = 1024, h = 704, c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = '#7d7a72'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 88) { g.fillStyle = `rgba(${rnd() < 0.5 ? '60,58,54' : '150,146,138'},0.12)`; g.fillRect(0, y, w, 88); g.fillStyle = 'rgba(40,40,36,0.35)'; g.fillRect(0, y, w, 2); }
  blotch(g, w, h, 60, '50,48,44', 30, 140, 0.25);
  speckle(g, w, h, 30000, 0.3, '30,30,30', '200,200,190', 2);
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(40,40,36,0.5)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 3, 0, 6.28); g.fill(); }
  g.fillStyle = 'rgba(150,30,20,0.55)'; g.font = 'bold 54px Arial'; g.fillText('УБЕЖИЩЕ № 14', 120, 260);
  g.fillStyle = 'rgba(20,20,20,0.45)'; g.font = 'bold 30px Arial'; g.fillText('ВМЕСТИМОСТЬ 150 ЧЕЛ.', 600, 420);
  return tex(c, true);
}

export function metalTex() {
  const w = 256, h = 256, c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = '#8a8d90'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 * rnd()})`; g.fillRect(0, rnd() * h, w, 1); }
  blotch(g, w, h, 8, '90,60,30', 10, 40, 0.25);
  return tex(c, true);
}

// кожух видеокарты. цветные акценты белые — тонируются instanceColor
export function shroudTex() {
  const w = 256, h = 512, c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, w, h);
  // грани
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#2b2d31'); gr.addColorStop(0.5, '#141518'); gr.addColorStop(1, '#2b2d31');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // угловатые полосы-акценты
  g.fillStyle = '#e8e8e8';
  g.beginPath(); g.moveTo(0, 40); g.lineTo(60, 0); g.lineTo(80, 0); g.lineTo(0, 70); g.fill();
  g.beginPath(); g.moveTo(w, h - 40); g.lineTo(w - 60, h); g.lineTo(w - 80, h); g.lineTo(w, h - 70); g.fill();
  g.fillRect(12, h * 0.5 - 3, w - 24, 6);
  g.fillStyle = '#9a9a9a';
  for (let i = 0; i < 8; i++) g.fillRect(w - 18, 90 + i * 40, 8, 22);
  // надпись
  g.save(); g.translate(30, h * 0.5 + 40); g.rotate(Math.PI / 2); g.fillStyle = '#d0d0d0'; g.font = 'bold 22px Arial'; g.fillText('GAMING X', 0, 0); g.restore();
  speckle(g, w, h, 1500, 0.15, '0,0,0', '255,255,255', 1);
  return tex(c, false);
}

export function fanTex() {
  const s = 256, c = cv(s, s), g = c.getContext('2d');
  g.clearRect(0, 0, s, s);
  g.translate(s / 2, s / 2);
  // рамка
  g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(0, 0, s * 0.49, 0, 6.28); g.fill();
  g.fillStyle = '#26282c'; g.beginPath(); g.arc(0, 0, s * 0.46, 0, 6.28); g.fill();
  // лопасти
  const n = 9;
  for (let i = 0; i < n; i++) {
    g.save(); g.rotate(i / n * 6.2832);
    const gr = g.createLinearGradient(0, 0, s * 0.44, 0);
    gr.addColorStop(0, '#3c3f45'); gr.addColorStop(1, '#575b62');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(s * 0.1, -s * 0.03);
    g.quadraticCurveTo(s * 0.3, -s * 0.16, s * 0.44, -s * 0.06);
    g.lineTo(s * 0.44, s * 0.06);
    g.quadraticCurveTo(s * 0.28, -s * 0.02, s * 0.1, s * 0.05);
    g.fill(); g.restore();
  }
  // ступица с логотипом
  g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, s * 0.13, 0, 6.28); g.fill();
  g.fillStyle = '#e8e8e8'; g.beginPath(); g.arc(0, 0, s * 0.11, 0, 6.28); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 0, 2);
  return tex(c, false);
}

export function glowTex() {
  const s = 128, c = cv(s, s), g = c.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return tex(c, false, false);
}
export function smokeTex() {
  const s = 128, c = cv(s, s), g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = s / 2 + (rnd() - 0.5) * 40, y = s / 2 + (rnd() - 0.5) * 40, r = 20 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  return tex(c, false, false);
}
export function flameTex() {
  const s = 128, c = cv(s, s), g = c.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s * 0.62, 0, s / 2, s * 0.6, s * 0.45);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,150,40,0.85)'); gr.addColorStop(0.7, 'rgba(200,40,0,0.3)'); gr.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(s / 2, s * 0.55, s * 0.32, s * 0.45, 0, 0, 6.28); g.fill();
  return tex(c, false);
}

export function pcbTex() {
  const w = 256, h = 256, c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = '#123a24'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(180,200,120,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { if (rnd() < 0.5) x += (rnd() - 0.5) * 80; else y += (rnd() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? '#111' : '#b8b8b0'; g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 20, 6 + rnd() * 14); }
  g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillRect(20 + i * 38, 40, 10, 170);
  return tex(c, false);
}

export function labelTex(lines, opt = {}) {
  const w = opt.w || 256, h = opt.h || 256, c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = opt.bg || '#e9e1c8'; g.fillRect(0, 0, w, h);
  if (opt.border) { g.strokeStyle = opt.border; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let y = opt.y0 || h * 0.3;
  for (const l of lines) {
    g.fillStyle = l.c || '#111'; g.font = l.f || 'bold 34px Arial';
    g.fillText(l.t, w / 2, y); y += l.dy || 46;
  }
  speckle(g, w, h, 1800, 0.15, '60,50,30', '255,255,255', 2);
  blotch(g, w, h, 4, '120,90,40', 10, 50, 0.25);
  return tex(c, false);
}

export function posterTex() {
  const w = 256, h = 360, c = cv(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#1b0b33'); gr.addColorStop(1, '#a3133a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f7a531'; g.beginPath(); g.arc(w / 2, 140, 76, 0, 6.28); g.fill();
  g.fillStyle = '#1b0b33'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₿', w / 2, 146);
  g.fillStyle = '#fff'; g.font = '900 58px Arial Black, Arial'; g.fillText('HODL', w / 2, 268);
  g.font = 'bold 18px Arial'; g.fillText('ТО THE MOON 🚀', w / 2, 316);
  blotch(g, w, h, 6, '255,255,255', 10, 60, 0.12);
  return tex(c, false);
}

// уличный вид из подвального окна; сезон 0..3 = зима, весна, лето, осень
export function windowTex(season) {
  const w = 256, h = 96, c = cv(w, h), g = c.getContext('2d');
  const sky = ['#3a4a66', '#4f6f8c', '#5a86b0', '#55606e'][season];
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, sky); gr.addColorStop(1, '#202630');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // дом напротив
  g.fillStyle = '#1a1d24'; g.fillRect(20, 4, 140, 60);
  for (let y = 10; y < 60; y += 14) for (let x = 28; x < 150; x += 18) { g.fillStyle = rnd() < 0.35 ? '#e8c06a' : '#2a2f3a'; g.fillRect(x, y, 9, 8); }
  // фонарь
  const lg = g.createRadialGradient(205, 28, 0, 205, 28, 40); lg.addColorStop(0, 'rgba(255,210,140,0.9)'); lg.addColorStop(1, 'rgba(255,210,140,0)');
  g.fillStyle = lg; g.fillRect(160, 0, 96, 70);
  // земля: снег / трава / листья
  const ground = ['#e6edf5', '#5d5640', '#3f6a2e', '#8a5a22'][season];
  g.fillStyle = ground; g.fillRect(0, 62, w, h - 62);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${season === 0 ? '255,255,255' : '0,0,0'},${0.3 * rnd()})`; g.fillRect(rnd() * w, 60 + rnd() * 36, 3, 2); }
  if (season === 0) for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(rnd() * w, rnd() * 62, 2, 2); }
  return tex(c, false);
}

export function screenCanvas() { return cv(512, 320); }
export function canvasTex(c) { return tex(c, false); }
