// игровые режимы
import * as THREE from 'three';
import { ROADS } from './world.js';

export const MODES = {
  strike: { name: 'УДАР', desc: 'Найди и уничтожь всю технику в посёлке. Прикрытие: ЗСУ и РЭБ.', drone: 'kamikaze' },
  convoy: { name: 'КОНВОЙ', desc: 'Колонна идёт через посёлок. Не дай ей уйти: пропустишь 3 машины — провал.', drone: 'kamikaze' },
  race: { name: 'ГОНКА', desc: 'Трасса через цех, окна и двери домов. Пролетай ворота по порядку на время.', drone: 'racer' },
  defense: { name: 'ОБОРОНА', desc: 'Волны техники идут на твой блиндаж. За каждую волну — новые дроны.', drone: 'kamikaze' },
  bomber: { name: 'СБРОС', desc: 'Бомбер с 4 ВОГ. Садись на площадку для перезарядки. Цели — в окопах и на стоянке.', drone: 'bomber' },
  free: { name: 'ПОЛИГОН', desc: 'Свободный полёт: тренируйся, фристайль, цели появляются заново.', drone: 'kamikaze' },
};

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function roadSpot(minDistFrom, d) {
  for (let k = 0; k < 50; k++) {
    const r = ROADS[Math.floor(Math.random() * ROADS.length)];
    const a = (Math.random() - 0.5) * 440;
    const p = Math.random() < 0.5 ? V3(r, 0, a) : V3(a, 0, r);
    let near = false;
    for (const q of ROADS) for (const w of ROADS) if (Math.abs(p.x - q) < 12 && Math.abs(p.z - w) < 12) near = true;
    if (near) continue;
    if (!minDistFrom || p.distanceTo(minDistFrom) > d) {
      const yaw = Math.abs(p.x - r) < 0.01 && ROADS.indexOf(p.x) >= 0 ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      return { p, yaw };
    }
  }
  return { p: V3(60, 0, 100), yaw: 0 };
}

export function setupMode(G, id) {
  const M = { id, def: MODES[id], kills: 0, score: 0, time: 0, done: false, win: false, text: '', sub: '' };
  const V = G.vehicles;
  V.clear();
  G.gates.forEach(g => G.scene.remove(g.mesh));
  G.gates.length = 0;

  if (id === 'strike') {
    M.base = V3(-120, 0, -180); M.heading = Math.PI;
    M.drones = 5;
    const kinds = ['tank', 'tank', 'apc', 'truck', 'truck', 'aa', 'ew', 'car'];
    for (const k of kinds) {
      const s = roadSpot(M.base, 140);
      if (k === 'tank' || k === 'apc' || k === 'car') {
        const route = V.randomRoute(12);
        V.spawn(k, route, { target: true });
      } else V.spawn(k, [s.p], { parked: true, target: true, yaw: s.yaw });
    }
    M.total = kinds.length;
    M.update = () => {
      const left = V.aliveTargets().length;
      M.text = `ЦЕЛИ: ${M.total - left}/${M.total}`;
      M.sub = `ДРОНЫ: ${M.drones}`;
      if (left === 0) { M.done = true; M.win = true; }
    };
  }

  if (id === 'convoy') {
    M.base = V3(-60, 0, -200); M.heading = Math.PI;
    M.drones = 7; M.escaped = 0; M.maxEsc = 3;
    const route = [V3(-420, 0, 60), V3(-60, 0, 60), V3(-60, 0, 180), V3(180, 0, 180), V3(180, 0, -60), V3(420, 0, -60)];
    const kinds = ['car', 'truck', 'apc', 'tank', 'truck', 'aa', 'ew', 'tank', 'truck'];
    kinds.forEach((k, i) => {
      const r = route.map(p => p.clone());
      r[0] = V3(-420 - i * 16, 0, 60);
      const v = V.spawn(k, r, { loop: false, target: true, speedMul: 0.55 });
      v.speed = 5.2;
    });
    M.total = kinds.length;
    M.update = () => {
      let esc = 0, left = 0;
      for (const v of V.list) { if (v.escaped && v.alive) esc++; if (v.alive && !v.escaped) left++; }
      M.escaped = esc;
      M.text = `КОЛОННА: ${M.total - left - esc} УНИЧТОЖЕНО · УШЛО ${esc}/${M.maxEsc}`;
      M.sub = `ДРОНЫ: ${M.drones}`;
      if (esc >= M.maxEsc) { M.done = true; M.win = false; M.reason = 'колонна прорвалась'; }
      else if (left === 0) { M.done = true; M.win = true; }
    };
  }

  if (id === 'defense') {
    M.base = V3(-188, 0, -188); M.heading = Math.PI * 0.75;
    M.drones = 4; M.wave = 0; M.baseHp = 3; M.waveT = 4;
    G.bunker.visible = true; G.bunker.position.set(-200, 0, -200);
    M.update = (dt) => {
      const alive = V.list.filter(v => v.alive && !v.escaped);
      for (const v of alive) {
        if (v.mesh.position.distanceTo(V3(-180, 0, -180)) < 14) {
          v.escaped = true; v.alive = false; v.mesh.visible = false;
          M.baseHp--; G.toast('ТЕХНИКА ПРОРВАЛАСЬ К БЛИНДАЖУ!', 'bad'); G.fx.explode(V3(-195, 1, -195), 1.5, {});
          G.shake(1);
        }
      }
      if (alive.length === 0) {
        M.waveT -= dt;
        if (M.waveT <= 0) {
          M.wave++; M.drones += M.wave === 1 ? 0 : 3;
          spawnWave(G, M.wave);
          G.toast(`ВОЛНА ${M.wave}`, 'big');
          M.waveT = 6;
        }
      }
      M.text = `ВОЛНА ${M.wave} · ТЕХНИКИ: ${alive.length}`;
      M.sub = `БЛИНДАЖ: ${'■'.repeat(Math.max(0, M.baseHp))}${'□'.repeat(Math.max(0, 3 - M.baseHp))} · ДРОНЫ: ${M.drones}`;
      if (M.baseHp <= 0) { M.done = true; M.win = false; M.reason = 'блиндаж уничтожен'; }
    };
  } else G.bunker.visible = false;

  if (id === 'bomber') {
    M.base = V3(60, 0, -205); M.heading = Math.PI;
    M.drones = 4;
    // стоянка техники и окопы
    const spots = [[25, 0, -150], [20, 0, -138], [32, 0, -140], [90, 0, -110], [100, 0, -118], [-20, 0, 120], [0, 0, 128], [120, 0, 100]];
    const kinds = ['truck', 'truck', 'car', 'apc', 'tank', 'truck', 'ew', 'aa'];
    // на дорогах рядом с этими местами
    kinds.forEach((k, i) => {
      const s = roadSpot(M.base, 90);
      V.spawn(k, [s.p], { parked: true, target: true, yaw: s.yaw });
    });
    M.total = kinds.length;
    M.update = () => {
      const left = V.aliveTargets().length;
      M.text = `ЦЕЛИ: ${M.total - left}/${M.total} · ВОГ: ${G.drone.dropsLeft}`;
      M.sub = `ДРОНЫ: ${M.drones} · ПОСАДКА НА ПЛОЩАДКУ = ПЕРЕЗАРЯДКА`;
      if (left === 0) { M.done = true; M.win = true; }
    };
  }

  if (id === 'free') {
    M.base = V3(-60, 0, -140); M.heading = Math.PI;
    M.drones = Infinity;
    const spawnSet = () => {
      for (const k of ['tank', 'apc', 'truck', 'truck', 'car', 'tank']) {
        const s = roadSpot(M.base, 60);
        V.spawn(k, [s.p], { parked: true, target: true, yaw: s.yaw });
      }
      V.spawn('car', V.randomRoute(14), { target: true });
    };
    spawnSet();
    M.update = () => {
      if (V.aliveTargets().length === 0) { V.clear(); spawnSet(); G.toast('НОВЫЕ ЦЕЛИ НА КАРТЕ', ''); }
      M.text = `ПОЛИГОН · УНИЧТОЖЕНО: ${M.kills}`;
      M.sub = 'дроны без ограничений';
    };
  }

  if (id === 'race') {
    M.base = V3(-60, 0, -95); M.heading = Math.PI;
    M.drones = Infinity;
    buildRace(G, M);
    M.next = 0; M.started = false;
    M.update = (dt) => {
      if (M.started && !M.done) M.lap = (M.lap || 0) + dt;
      M.text = `ВОРОТА ${M.next}/${G.gates.length} · ${fmt(M.lap || 0)}`;
      const best = G.best('race');
      M.sub = best ? `РЕКОРД ${fmt(best)}` : 'пролетай кольца по порядку';
    };
  }
  M.status = M;
  return M;
}

function spawnWave(G, n) {
  const V = G.vehicles;
  const pool = ['car', 'truck', 'apc', 'tank', 'aa', 'ew'];
  const count = Math.min(9, 1 + n);
  for (let i = 0; i < count; i++) {
    const k = pool[Math.min(pool.length - 1, Math.floor(Math.random() * Math.min(pool.length, 2 + n)))];
    // заезд с севера или с востока к углу (-180,-180)
    const east = Math.random() < 0.5;
    const lane = ROADS[1 + Math.floor(Math.random() * 3)];
    const path = [];
    if (east) {
      path.push(V3(420 + i * 18, 0, lane));
      path.push(V3(-180 + 0, 0, lane));
    } else {
      path.push(V3(lane, 0, 420 + i * 18));
      path.push(V3(lane, 0, -180));
    }
    path.push(V3(-180, 0, -180));
    const v = V.spawn(k, path, { loop: false, target: true, speedMul: 0.7 + n * 0.05 });
    v.speed = Math.min(v.speed, 7 + n * 0.4);
  }
}

// трасса: цех насквозь, дома (окно -> дверь), под проводами, вокруг башни
function buildRace(G, M) {
  const pts = [];
  pts.push({ p: V3(-60, 3, -80), n: V3(0, 0, 1), r: 3 });
  pts.push({ p: V3(-60, 2.2, -40), n: V3(0, 0, 1), r: 2.6 });
  // в цех через западные ворота, выход через восточные
  pts.push({ p: V3(-24, 2.8, 0), n: V3(1, 0, 0), r: 2.6 });
  pts.push({ p: V3(0, 4, 0), n: V3(1, 0, 0), r: 2.4 });
  pts.push({ p: V3(24, 3.2, 0), n: V3(1, 0, 0), r: 3 });
  // вокруг водонапорной башни
  pts.push({ p: V3(40, 12, -30), n: V3(0, 0, -1), r: 3 });
  // по дому: окно -> дверь
  const houses = G.world.houses.filter(h => h.floors >= 1 && h.windows.length && h.door && h.W < 40);
  const order = [];
  let cur = V3(40, 0, -30);
  const used = new Set();
  for (let k = 0; k < 4; k++) {
    let best = null, bd = 1e9;
    for (const h of houses) {
      if (used.has(h)) continue;
      const d = Math.hypot(h.x - cur.x, h.z - cur.z);
      if (d > 30 && d < bd) { bd = d; best = h; }
    }
    if (!best) break;
    used.add(best); order.push(best); cur = V3(best.x, 0, best.z);
  }
  for (const h of order) {
    const d = h.door;
    const wins = h.windows.filter(q => q.floor === 0);
    let ok = null;
    for (const w of wins) {
      const out = V3(w.x + w.nx * 7, w.y + 0.6, w.z + w.nz * 7);
      const inn = V3(w.x + w.nx * 0.7, w.y, w.z + w.nz * 0.7);
      if (Math.abs(w.nx - d.nx) + Math.abs(w.nz - d.nz) < 0.1) continue;
      const dIn0 = V3(d.x - d.nx * 0.4, 1.25, d.z - d.nz * 0.4);
      if (G.world.lineClear(out, inn) && G.world.lineClear(inn, dIn0)) { ok = [out, inn, w]; break; }
    }
    const dOut = V3(d.x + d.nx * 8, 2.5, d.z + d.nz * 8);
    const dIn = V3(d.x + d.nx * 0.8, 1.25, d.z + d.nz * 0.8);
    if (!ok || !G.world.lineClear(dIn, dOut)) continue;
    const w = ok[2];
    pts.push({ p: ok[0], n: V3(-w.nx, 0, -w.nz), r: 2.2 });
    pts.push({ p: ok[1], n: V3(-w.nx, 0, -w.nz), r: 0.8, tight: true });
    pts.push({ p: dIn, n: V3(d.nx, 0, d.nz), r: 0.85, tight: true });
    pts.push({ p: dOut, n: V3(d.nx, 0, d.nz), r: 2.4 });
  }
  // финиш на дороге
  pts.push({ p: V3(-60, 3, -80), n: V3(0, 0, -1), r: 3.2, finish: true });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc22 });
  const nextMat = new THREE.MeshBasicMaterial({ color: 0x22ff88 });
  for (let i = 0; i < pts.length; i++) {
    const g = pts[i];
    const m = new THREE.Mesh(new THREE.TorusGeometry(g.r + 0.15, g.tight ? 0.05 : 0.12, 6, 28), ringMat);
    m.position.copy(g.p);
    m.lookAt(g.p.clone().add(g.n));
    G.scene.add(m);
    G.gates.push({ mesh: m, p: g.p, n: g.n, r: g.r + 0.3, finish: !!g.finish, mat: ringMat, next: nextMat, side: null });
  }
}

export function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
