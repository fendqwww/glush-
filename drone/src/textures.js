// процедурные текстуры на канвасе: никаких внешних файлов
import * as THREE from 'three';

let seed = 1337;
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
export function setSeed(s) { seed = s; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

// дешёвый value-noise для пятен и грязи
function noiseLayer(ctx, w, h, cell, alpha, dark) {
  const gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1;
  const g = [];
  for (let i = 0; i < gw * gh; i++) g.push(Math.random());
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell, gy = y / cell;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1];
      const c = g[(y0 + 1) * gw + x0], e = g[(y0 + 1) * gw + x0 + 1];
      const v = (a + (b - a) * sx) * (1 - sy) + (c + (e - c) * sx) * sy;
      const k = (v - 0.5) * 2 * alpha * 255 * (dark ? -1 : 1);
      const i = (y * w + x) * 4;
      d[i] = clamp(d[i] + k); d[i + 1] = clamp(d[i + 1] + k); d[i + 2] = clamp(d[i + 2] + k);
    }
  }
  ctx.putImageData(img, 0, 0);
}
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function grain(ctx, w, h, amt) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = (Math.random() - 0.5) * amt;
    d[i] = clamp(d[i] + k); d[i + 1] = clamp(d[i + 1] + k); d[i + 2] = clamp(d[i + 2] + k);
  }
  ctx.putImageData(img, 0, 0);
}

function toTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}

// карта нормалей из яркости канваса (Собель)
function normalFrom(c, strength) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const L = (x, y) => {
    x = (x + w) % w; y = (y + h) % h;
    const i = (y * w + x) * 4;
    return (src[i] + src[i + 1] + src[i + 2]) / 765;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * strength;
      const dy = (L(x, y + 1) - L(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function brick(base) {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#6d625a'; x.fillRect(0, 0, S, S);
  const bh = 16, bw = 42;
  for (let r = 0; r < S / bh; r++) {
    const off = (r % 2) * bw / 2;
    for (let col = -1; col < S / bw + 1; col++) {
      const h = base[0] + (Math.random() - 0.5) * 30, s = base[1], l = base[2] + (Math.random() - 0.5) * 12;
      x.fillStyle = `hsl(${h},${s}%,${l}%)`;
      x.fillRect(col * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  }
  noiseLayer(x, S, S, 32, 0.12, true);
  grain(x, S, S, 24);
  return { map: toTex(c), normalMap: normalFrom(c, 3) };
}

export function plaster(col) {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = col; x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, 64, 0.08, false);
  noiseLayer(x, S, S, 16, 0.05, true);
  // потёки грязи снизу
  for (let i = 0; i < 18; i++) {
    const gx = Math.random() * S, len = 30 + Math.random() * 120;
    const g = x.createLinearGradient(0, S, 0, S - len);
    g.addColorStop(0, 'rgba(40,35,30,0.35)'); g.addColorStop(1, 'rgba(40,35,30,0)');
    x.fillStyle = g; x.fillRect(gx, S - len, 3 + Math.random() * 10, len);
  }
  // трещины и сколы
  x.strokeStyle = 'rgba(30,28,25,0.5)'; x.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let px = Math.random() * S, py = Math.random() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 20; py += Math.random() * 14; x.lineTo(px, py); }
    x.stroke();
  }
  grain(x, S, S, 18);
  return { map: toTex(c), normalMap: normalFrom(c, 1.5) };
}

export function concrete() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#8a8884'; x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, 48, 0.12, false);
  noiseLayer(x, S, S, 8, 0.06, true);
  x.strokeStyle = 'rgba(40,40,40,0.5)'; x.lineWidth = 2;
  x.strokeRect(0, 0, S, S);
  x.beginPath(); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.stroke();
  grain(x, S, S, 30);
  return { map: toTex(c), normalMap: normalFrom(c, 2) };
}

export function asphalt() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#3b3c3e'; x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, 64, 0.1, false);
  noiseLayer(x, S, S, 12, 0.08, true);
  grain(x, S, S, 40);
  // заплатки и трещины
  for (let i = 0; i < 6; i++) {
    x.fillStyle = 'rgba(25,25,27,0.5)';
    x.fillRect(Math.random() * S, Math.random() * S, 30 + Math.random() * 60, 20 + Math.random() * 40);
  }
  x.strokeStyle = 'rgba(15,15,15,0.6)';
  for (let i = 0; i < 10; i++) {
    let px = Math.random() * S, py = Math.random() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 8; k++) { px += (Math.random() - 0.5) * 30; py += (Math.random() - 0.5) * 30; x.lineTo(px, py); }
    x.stroke();
  }
  return { map: toTex(c), normalMap: normalFrom(c, 2) };
}

// дорога: асфальт + обочины + прерывистая осевая
export function road() {
  const W = 256, H = 512, c = canvas(W, H), x = c.getContext('2d');
  const a = asphalt().map.image;
  x.drawImage(a, 0, 0, W, H);
  x.fillStyle = 'rgba(220,215,190,0.85)';
  for (let y = 0; y < H; y += 128) x.fillRect(W / 2 - 4, y + 20, 8, 70);
  x.fillStyle = 'rgba(200,200,190,0.6)';
  x.fillRect(10, 0, 6, H); x.fillRect(W - 16, 0, 6, H);
  noiseLayer(x, W, H, 32, 0.08, true);
  const t = toTex(c);
  return { map: t, normalMap: normalFrom(c, 1.5) };
}

export function grass() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#4b5b2c'; x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, 128, 0.12, false);
  noiseLayer(x, S, S, 32, 0.1, true);
  for (let i = 0; i < 9000; i++) {
    const h = 60 + Math.random() * 40, l = 18 + Math.random() * 22;
    x.strokeStyle = `hsla(${h},45%,${l}%,0.7)`;
    const px = Math.random() * S, py = Math.random() * S;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 4, py - 3 - Math.random() * 5); x.stroke();
  }
  // проплешины земли
  for (let i = 0; i < 14; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 40);
    g.addColorStop(0, 'rgba(90,72,50,0.55)'); g.addColorStop(1, 'rgba(90,72,50,0)');
    x.save(); x.translate(Math.random() * S, Math.random() * S); x.scale(1, 0.6 + Math.random());
    x.fillStyle = g; x.fillRect(-40, -40, 80, 80); x.restore();
  }
  return { map: toTex(c), normalMap: normalFrom(c, 2.5) };
}

export function roof(hue) {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = `hsl(${hue},25%,30%)`; x.fillRect(0, 0, S, S);
  // волнистый шифер / профлист
  for (let i = 0; i < S; i += 16) {
    const g = x.createLinearGradient(i, 0, i + 16, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    x.fillStyle = g; x.fillRect(i, 0, 16, S);
  }
  for (let j = 0; j < S; j += 64) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, j, S, 2); }
  noiseLayer(x, S, S, 32, 0.15, true);
  // мох и ржавчина
  for (let i = 0; i < 20; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(90,100,40,0.25)' : 'rgba(120,60,30,0.25)';
    x.beginPath(); x.arc(Math.random() * S, Math.random() * S, 5 + Math.random() * 20, 0, 7); x.fill();
  }
  grain(x, S, S, 20);
  return { map: toTex(c), normalMap: normalFrom(c, 3) };
}

export function wood() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#6b4a2e'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 32) {
    x.fillStyle = `hsl(28,${35 + Math.random() * 15}%,${22 + Math.random() * 10}%)`;
    x.fillRect(0, i + 1, S, 30);
    x.strokeStyle = 'rgba(30,20,10,0.25)';
    for (let k = 0; k < 6; k++) {
      x.beginPath(); const yy = i + 4 + Math.random() * 24; x.moveTo(0, yy);
      for (let xx = 0; xx < S; xx += 16) x.lineTo(xx, yy + Math.sin(xx * 0.05 + k) * 2);
      x.stroke();
    }
  }
  grain(x, S, S, 20);
  return { map: toTex(c), normalMap: normalFrom(c, 2) };
}

export function metal(base, camo) {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  if (camo) {
    const cols = ['rgba(60,70,40,0.8)', 'rgba(40,40,30,0.8)', 'rgba(110,100,70,0.7)'];
    for (let i = 0; i < 26; i++) {
      x.fillStyle = cols[i % 3];
      x.beginPath();
      const cx = Math.random() * S, cy = Math.random() * S;
      x.moveTo(cx, cy);
      for (let k = 0; k < 7; k++) x.lineTo(cx + (Math.random() - 0.5) * 90, cy + (Math.random() - 0.5) * 60);
      x.fill();
    }
  }
  noiseLayer(x, S, S, 32, 0.12, true);
  // пыль, сколы краски
  for (let i = 0; i < 60; i++) {
    x.fillStyle = 'rgba(140,120,90,0.25)';
    x.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 2;
  for (let i = 0; i < 5; i++) { x.beginPath(); const yy = Math.random() * S; x.moveTo(0, yy); x.lineTo(S, yy); x.stroke(); }
  grain(x, S, S, 20);
  return { map: toTex(c), normalMap: normalFrom(c, 2) };
}

export function windowTex() {
  const S = 128, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#1a1f24'; x.fillRect(0, 0, S, S);
  return toTex(c);
}

export function dirt() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#5a4a38'; x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, 32, 0.15, false);
  noiseLayer(x, S, S, 8, 0.1, true);
  grain(x, S, S, 40);
  return { map: toTex(c), normalMap: normalFrom(c, 3) };
}

export function floorTiles() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#7a6a58'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    x.fillStyle = (i + j) % 2 ? '#8b7b66' : '#6d5d4b';
    x.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
  }
  noiseLayer(x, S, S, 32, 0.1, true);
  grain(x, S, S, 20);
  return { map: toTex(c), normalMap: normalFrom(c, 1.5) };
}

export function wallpaper(hue) {
  const S = 128, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = `hsl(${hue},18%,58%)`; x.fillRect(0, 0, S, S);
  x.fillStyle = `hsla(${hue},30%,40%,0.4)`;
  for (let i = 0; i < S; i += 16) for (let j = 0; j < S; j += 24) {
    x.beginPath(); x.arc(i + 8 + (j % 48 ? 8 : 0), j + 12, 3, 0, 7); x.fill();
  }
  noiseLayer(x, S, S, 32, 0.12, true);
  return { map: toTex(c) };
}

// мягкий круглый спрайт для частиц
export function softSprite() {
  const S = 64, c = canvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// клубящийся дым
export function smokeSprite() {
  const S = 128, c = canvas(S, S), x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const r = 12 + Math.random() * 26;
    const px = S / 2 + (Math.random() - 0.5) * 50, py = S / 2 + (Math.random() - 0.5) * 50;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  const mask = x.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
  mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = mask; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

// воронка на земле
export function craterTex() {
  const S = 128, c = canvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(10,8,6,0.95)');
  g.addColorStop(0.45, 'rgba(30,24,18,0.85)');
  g.addColorStop(0.7, 'rgba(60,50,38,0.5)');
  g.addColorStop(1, 'rgba(60,50,38,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.28, r = S * (0.3 + Math.random() * 0.2);
    x.fillStyle = 'rgba(20,15,10,0.6)';
    x.beginPath(); x.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1 + Math.random() * 4, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function treeLeaves() {
  const S = 128, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#56703a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `hsl(${70 + Math.random() * 30},${35 + Math.random() * 25}%,${25 + Math.random() * 35}%)`;
    x.beginPath(); x.ellipse(Math.random() * S, Math.random() * S, 3, 2, Math.random() * 3, 0, 7); x.fill();
  }
  return toTex(c);
}

export function bark() {
  const S = 64, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#3d3024'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = 'rgba(20,15,10,0.6)';
    x.beginPath(); const px = Math.random() * S; x.moveTo(px, 0); x.lineTo(px + (Math.random() - 0.5) * 6, S); x.stroke();
  }
  return toTex(c);
}
