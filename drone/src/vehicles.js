// бронетехника и машины: модели, езда по дорогам, ЗСУ, РЭБ, урон
import * as THREE from 'three';
import * as TX from './textures.js';
import { ROADS } from './world.js';

const V = {
  tank: { name: 'ТАНК', hp: 180, speed: 6, size: [3.4, 2.3, 7], score: 300 },
  apc: { name: 'БТР', hp: 110, speed: 9, size: [2.9, 2.4, 7.4], score: 200 },
  truck: { name: 'ГРУЗОВИК', hp: 55, speed: 11, size: [2.5, 3, 7], score: 100 },
  aa: { name: 'ЗСУ', hp: 110, speed: 6, size: [3.2, 2.4, 6.5], score: 350 },
  ew: { name: 'РЭБ', hp: 60, speed: 8, size: [2.5, 3.2, 6.5], score: 400 },
  car: { name: 'ПИКАП', hp: 35, speed: 14, size: [2, 1.8, 4.8], score: 80 },
};
export const VTYPES = V;

let mats = null;
function getMats() {
  if (mats) return mats;
  const camo = TX.metal('#55603a', true), camo2 = TX.metal('#6b6648', true), plain = TX.metal('#4c5038', false);
  const std = (t, o) => new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normalMap, roughness: 0.75, metalness: 0.35 }, o || {}));
  mats = {
    camo: std(camo), camo2: std(camo2), plain: std(plain),
    track: new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.95, metalness: 0.2 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x5b5a3e, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.8 }),
    burnt: new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 1, metalness: 0.1 }),
    white: new THREE.MeshStandardMaterial({ color: 0xbfbfb0, roughness: 0.6 }),
  };
  return mats;
}

function bx(g, m, x, y, z, sx, sy, sz) { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); g.add(o); return o; }
function cyl(g, m, x, y, z, r, h, axis, seg) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 12), m);
  o.position.set(x, y, z);
  if (axis === 'x') o.rotation.z = Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
  g.add(o); return o;
}

function buildTank(g, M, aa) {
  const wheels = [];
  bx(g, M.camo, 0, 1.05, 0, 3.0, 0.9, 6.6);
  // наклонный лобовой лист
  const glacis = bx(g, M.camo, 0, 1.0, -3.5, 3.0, 0.7, 0.9); glacis.rotation.x = 0.7;
  for (const s of [-1, 1]) {
    bx(g, M.track, s * 1.45, 0.55, 0, 0.6, 1.0, 6.8);
    bx(g, M.camo2, s * 1.55, 1.15, 0, 0.5, 0.12, 6.9); // надгусеничные полки
    for (let i = 0; i < 6; i++) wheels.push(cyl(g, M.rubber, s * 1.45, 0.45, -2.6 + i * 1.05, 0.42, 0.5, 'x', 10));
  }
  // ящики ДЗ и ЗИП
  for (let i = 0; i < 5; i++) bx(g, M.camo2, -1 + i * 0.5, 1.58, -2.7, 0.45, 0.12, 0.6);
  bx(g, M.plain, 0, 1.6, 2.8, 2.6, 0.2, 1.2); // МТО — уязвимая корма
  for (let i = 0; i < 3; i++) bx(g, M.track, -0.8 + i * 0.8, 1.72, 2.9, 0.5, 0.05, 0.9);
  const turret = new THREE.Group(); turret.position.set(0, 1.5, -0.3); g.add(turret);
  if (!aa) {
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, 0.75, 14), M.camo); tb.position.y = 0.38; turret.add(tb);
    bx(turret, M.camo2, 0, 0.45, 1.2, 1.9, 0.5, 0.9);
    const gun = new THREE.Group(); gun.position.set(0, 0.42, -1.2); turret.add(gun);
    cyl(gun, M.plain, 0, 0, -2.4, 0.09, 4.6, 'z', 8);
    cyl(gun, M.plain, 0, 0, -1.6, 0.15, 0.6, 'z', 8);
    cyl(turret, M.plain, 0.5, 0.95, 0.3, 0.25, 0.25, 'y', 8); // командирская башенка
    bx(turret, M.plain, -0.5, 0.95, 0.3, 0.4, 0.15, 0.5);
    // «мангал» — противодроновая сетка
    if (Math.random() < 0.6) {
      const cage = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.05, 3.6), new THREE.MeshStandardMaterial({ color: 0x3a3a30, wireframe: true }));
      cage.position.y = 1.9; turret.add(cage);
      for (const a of [[-1.6, -1.7], [1.6, -1.7], [-1.6, 1.7], [1.6, 1.7]]) bx(turret, M.track, a[0], 1.4, a[1], 0.06, 1.0, 0.06);
    }
    g.userData.gun = gun;
  } else {
    bx(turret, M.camo, 0, 0.45, 0, 2.4, 0.9, 2.6);
    const gun = new THREE.Group(); gun.position.set(0, 0.7, -0.6); turret.add(gun);
    for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(gun, M.plain, s * 0.9 + t * 0.12, 0, -1.4, 0.04, 2.4, 'z', 6);
    const radar = new THREE.Group(); radar.position.set(0, 1.25, 0.8); turret.add(radar);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), M.camo2); dish.rotation.x = Math.PI / 2 - 0.3; radar.add(dish);
    cyl(radar, M.plain, 0, -0.4, 0, 0.06, 0.8, 'y', 6);
    g.userData.radar = radar;
    g.userData.gun = gun;
  }
  g.userData.turret = turret;
  return wheels;
}

function buildAPC(g, M) {
  const wheels = [];
  bx(g, M.camo, 0, 1.45, 0, 2.8, 1.3, 6.8);
  const nose = bx(g, M.camo, 0, 1.2, -3.6, 2.8, 0.9, 1.0); nose.rotation.x = -0.6;
  const top = bx(g, M.camo2, 0, 2.15, 0.4, 2.4, 0.15, 5);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) wheels.push(cyl(g, M.rubber, s * 1.3, 0.6, -2.4 + i * 1.5 - (i > 1 ? -0.3 : 0), 0.6, 0.45, 'x', 12));
  const turret = new THREE.Group(); turret.position.set(0, 2.25, -0.8); g.add(turret);
  const tb = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.6, 10), M.camo); tb.position.y = 0.25; turret.add(tb);
  const gun = new THREE.Group(); gun.position.set(0, 0.3, -0.3); turret.add(gun);
  cyl(gun, M.plain, 0, 0, -1.2, 0.05, 2.2, 'z', 6);
  g.userData.turret = turret; g.userData.gun = gun;
  bx(g, M.glass, 0.6, 1.8, -3.1, 0.5, 0.25, 0.1);
  bx(g, M.glass, -0.6, 1.8, -3.1, 0.5, 0.25, 0.1);
  return wheels;
}

function buildTruck(g, M, ew) {
  const wheels = [];
  bx(g, M.track, 0, 0.9, 0, 1.2, 0.3, 6.6); // рама
  bx(g, M.camo, 0, 1.75, -2.6, 2.4, 1.6, 1.8); // кабина
  bx(g, M.glass, 0, 2.15, -3.51, 2.0, 0.7, 0.05);
  bx(g, M.camo, 0, 1.2, -3.4, 2.3, 0.6, 0.4); // капот
  for (const s of [-1, 1]) for (const z of [-2.6, 1.2, 2.5]) wheels.push(cyl(g, M.rubber, s * 1.05, 0.55, z, 0.55, 0.35, 'x', 12));
  if (!ew) {
    bx(g, M.camo2, 0, 1.4, 1.1, 2.5, 0.4, 4.4);
    const tent = bx(g, M.canvas, 0, 2.3, 1.1, 2.5, 1.6, 4.4);
    g.userData.tent = tent;
  } else {
    bx(g, M.camo2, 0, 2.0, 1.1, 2.5, 1.9, 4.4); // кунг
    const mast = new THREE.Group(); mast.position.set(0, 3.0, 1.6); g.add(mast);
    cyl(mast, M.plain, 0, 1.4, 0, 0.08, 2.8, 'y', 6);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const arm = bx(mast, M.white, Math.cos(a) * 0.5, 2.6, Math.sin(a) * 0.5, 0.08, 0.9, 0.08);
      arm.rotation.z = 0.2;
    }
    for (let i = 0; i < 6; i++) cyl(g, M.white, -0.9 + (i % 3) * 0.9, 3.4, 0 + Math.floor(i / 3) * 1.6, 0.04, 0.8, 'y', 5);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    blink.position.y = 3.3; mast.add(blink);
    g.userData.mast = mast; g.userData.blink = blink;
  }
  return wheels;
}

function buildCar(g, M) {
  const wheels = [];
  const paint = new THREE.MeshStandardMaterial({ color: [0x6a6a5a, 0x7a2a22, 0x2e3e4e, 0xd0d0c8][Math.floor(Math.random() * 4)], roughness: 0.4, metalness: 0.6 });
  bx(g, paint, 0, 0.8, 0, 1.9, 0.6, 4.6);
  bx(g, paint, 0, 1.35, -0.5, 1.75, 0.6, 2.0);
  bx(g, M.glass, 0, 1.35, -1.52, 1.6, 0.5, 0.05);
  bx(g, M.track, 0, 1.25, 1.4, 1.6, 0.3, 1.4);
  cyl(g, M.plain, 0, 1.75, 1.4, 0.06, 0.8, 'y', 6); // турель-пулемёт на кузове
  for (const s of [-1, 1]) for (const z of [-1.5, 1.5]) wheels.push(cyl(g, M.rubber, s * 0.9, 0.38, z, 0.38, 0.25, 'x', 10));
  return wheels;
}

export class Vehicles {
  constructor(scene, world, fx) {
    this.scene = scene; this.world = world; this.fx = fx;
    this.list = [];
    this.tracers = [];
    const tg = new THREE.BoxGeometry(0.08, 0.08, 3);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffbb55 });
    for (let i = 0; i < 50; i++) { const m = new THREE.Mesh(tg, tm); m.visible = false; scene.add(m); this.tracers.push({ m, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }); }
    this.trHead = 0;
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.inv = new THREE.Matrix4();
  }

  clear() {
    for (const v of this.list) this.scene.remove(v.mesh);
    this.list.length = 0;
    this.world.dynamic = null;
    for (const t of this.tracers) { t.life = 0; t.m.visible = false; }
  }

  spawn(type, path, opts) {
    opts = opts || {};
    const M = getMats();
    const T = V[type];
    const g = new THREE.Group();
    let wheels;
    if (type === 'tank') wheels = buildTank(g, M, false);
    else if (type === 'aa') wheels = buildTank(g, M, true);
    else if (type === 'apc') wheels = buildAPC(g, M);
    else if (type === 'truck') wheels = buildTruck(g, M, false);
    else if (type === 'ew') wheels = buildTruck(g, M, true);
    else wheels = buildCar(g, M);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const v = {
      type, T, mesh: g, wheels, hp: T.hp, alive: true, path: path || [], wp: 0,
      speed: T.speed * (opts.speedMul || 1), cur: 0, yaw: 0, fireT: Math.random() * 2, burst: 0,
      half: new THREE.Vector3(T.size[0] / 2, T.size[1] / 2, T.size[2] / 2),
      parked: !!opts.parked, loop: opts.loop !== false, escaped: false, target: opts.target || false,
      jam: type === 'ew' ? 110 : 0,
    };
    const p0 = v.path[0] || new THREE.Vector3();
    g.position.set(p0.x, 0, p0.z);
    if (v.path[1]) v.yaw = Math.atan2(-(v.path[1].x - p0.x), -(v.path[1].z - p0.z));
    if (opts.yaw != null) v.yaw = opts.yaw;
    g.rotation.y = v.yaw;
    g.updateMatrixWorld();
    this.list.push(v);
    return v;
  }

  // случайный маршрут по сетке дорог
  randomRoute(n) {
    let i = Math.floor(Math.random() * ROADS.length), j = Math.floor(Math.random() * ROADS.length);
    const pts = [];
    let pi = -1, pj = -1;
    for (let k = 0; k < n; k++) {
      pts.push(new THREE.Vector3(ROADS[i], 0, ROADS[j]));
      const opts = [];
      if (i > 0) opts.push([i - 1, j]); if (i < ROADS.length - 1) opts.push([i + 1, j]);
      if (j > 0) opts.push([i, j - 1]); if (j < ROADS.length - 1) opts.push([i, j + 1]);
      const f = opts.filter(o => !(o[0] === pi && o[1] === pj));
      const c = f[Math.floor(Math.random() * f.length)];
      pi = i; pj = j; i = c[0]; j = c[1];
    }
    return pts;
  }

  update(dt, drone, signalCb) {
    const tmp = this.tmp;
    for (const v of this.list) {
      const g = v.mesh;
      if (!v.alive) continue;
      // езда
      if (!v.parked && v.path.length > 1) {
        const tgt = v.path[v.wp];
        // правая полоса
        const dx = tgt.x - g.position.x, dz = tgt.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 4) {
          v.wp++;
          if (v.wp >= v.path.length) {
            if (v.loop) v.wp = 0; else { v.escaped = true; v.parked = true; }
          }
        }
        let want = Math.atan2(-dx, -dz);
        let d = want - v.yaw;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += Math.max(-1, Math.min(1, d)) * dt * 1.6;
        const slow = Math.abs(d) > 0.5 ? 0.4 : 1;
        // не наезжать на впереди идущих
        let block = 1;
        for (const o of this.list) {
          if (o === v) continue;
          const ox = o.mesh.position.x - g.position.x, oz = o.mesh.position.z - g.position.z;
          const fwd = -(ox * Math.sin(v.yaw) + oz * Math.cos(v.yaw));
          const side = Math.abs(ox * Math.cos(v.yaw) - oz * Math.sin(v.yaw));
          if (fwd > 0 && fwd < 10 && side < 2.5) block = Math.min(block, o.alive ? (fwd - 5) / 5 : 0);
        }
        if (block < 0) block = 0;
        v.cur += (v.speed * slow * block - v.cur) * Math.min(1, dt * 1.5);
        g.position.x -= Math.sin(v.yaw) * v.cur * dt;
        g.position.z -= Math.cos(v.yaw) * v.cur * dt;
        g.rotation.y = v.yaw;
        // покачивание
        g.rotation.x = Math.sin(performance.now() * 0.004 + g.position.x) * 0.012 * (v.cur / v.speed);
        for (const w of v.wheels) w.rotation.x += v.cur * dt / 0.5;
        if (v.cur > 3 && Math.random() < 0.3) this.fx.dust(this.tmp2.set(g.position.x + Math.sin(v.yaw) * 3, 0.3, g.position.z + Math.cos(v.yaw) * 3));
      }
      g.updateMatrixWorld();
      // турель следит за дроном
      const ud = g.userData;
      if (drone && drone.alive && ud.turret) {
        tmp.copy(drone.pos);
        g.worldToLocal(tmp);
        const tp = ud.turret.position;
        const want = Math.atan2(-(tmp.x - tp.x), -(tmp.z - tp.z));
        let d = want - ud.turret.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        const dd = drone.pos.distanceTo(g.position);
        if (dd < 260) ud.turret.rotation.y += Math.max(-1, Math.min(1, d)) * dt * (v.type === 'aa' ? 1.4 : 0.5);
        if (ud.gun) {
          const el = Math.atan2(tmp.y - tp.y, Math.hypot(tmp.x - tp.x, tmp.z - tp.z));
          ud.gun.rotation.x += (Math.max(-0.1, Math.min(v.type === 'aa' ? 1.4 : 0.35, el)) - ud.gun.rotation.x) * dt * 2;
        }
      }
      if (ud.radar) ud.radar.rotation.y += dt * 3;
      if (ud.mast) { ud.mast.rotation.y += dt * 0.6; ud.blink.visible = (performance.now() % 1000) < 200; }
      // ЗСУ стреляет
      if (v.type === 'aa' && drone && drone.alive) this.aaFire(v, dt, drone);
    }
    // трассеры
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.p.addScaledVector(t.v, dt);
      t.v.y -= 9.8 * dt * 0.5;
      t.m.position.copy(t.p);
      t.m.lookAt(tmp.copy(t.p).add(t.v));
      if (t.life <= 0 || t.p.y < 0 || this.world.pointHit(t.p)) { t.life = 0; t.m.visible = false; if (t.p.y < 0.5) this.fx.dust(t.p); continue; }
      if (drone && drone.alive) {
        // проверка отрезка за кадр на близость к дрону
        const d2 = distSegPoint(t.p, t.v, dt, drone.pos);
        if (d2 < (drone.p.radius + 0.12) ** 2) {
          t.life = 0; t.m.visible = false;
          if (signalCb) signalCb('hit');
        }
      }
    }
  }

  aaFire(v, dt, drone) {
    const g = v.mesh;
    v.fireT -= dt;
    const d = drone.pos.distanceTo(g.position);
    // маленький дрон низко над землёй заметить трудно
    const agl = drone.pos.y;
    const range = agl < 8 ? 70 : agl < 20 ? 120 : 170;
    const muzzle = this.tmp2.set(g.position.x, 3.2, g.position.z);
    v.losT = (v.losT || 0) - dt;
    if (v.losT <= 0) { v.losT = 0.25; v.los = d < range && agl > 1.5 && this.world.lineClear(muzzle, drone.pos); }
    // время на обнаружение и захват цели
    if (v.los) v.track = Math.min(4, (v.track || 0) + dt);
    else v.track = Math.max(0, (v.track || 0) - dt * 2);
    // наводчик видит дрон с запаздыванием
    if (!v.est) { v.est = drone.pos.clone(); v.estV = new THREE.Vector3(); }
    const k = Math.min(1, dt * 1.6);
    v.est.lerp(drone.pos, k);
    v.estV.lerp(drone.vel, k * 0.6);
    if (!v.los || v.track < 2.2 || v.fireT > 0) return;
    // ствол должен смотреть на цель
    const ud = g.userData;
    if (ud.turret) {
      const lp = this.tmp.copy(drone.pos); g.worldToLocal(lp);
      const want = Math.atan2(-(lp.x - ud.turret.position.x), -(lp.z - ud.turret.position.z));
      let dd = want - ud.turret.rotation.y;
      while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
      if (Math.abs(dd) > 0.3) return;
    }
    if (v.burst <= 0) v.burst = 4 + Math.floor(Math.random() * 4);
    v.burst--;
    v.fireT = v.burst > 0 ? 0.12 : 2.2 + Math.random() * 2;
    const t = this.tracers[this.trHead]; this.trHead = (this.trHead + 1) % this.tracers.length;
    const sp = 300;
    const time = d / sp;
    const aim = this.tmp.copy(v.est).addScaledVector(v.estV, time * 0.5);
    aim.y += 9.8 * 0.5 * time * time * 0.5;
    const spd = drone.vel.length();
    const spread = 2 + d * 0.035 + spd * 0.2;
    aim.x += (Math.random() - 0.5) * spread; aim.y += (Math.random() - 0.5) * spread; aim.z += (Math.random() - 0.5) * spread;
    t.p.copy(muzzle);
    t.v.copy(aim).sub(muzzle).normalize().multiplyScalar(sp);
    t.life = 1.6; t.m.visible = true;
    this.fx.muzzle(muzzle, this.tmp.copy(t.v).normalize());
    if (this.onShot) this.onShot(muzzle);
  }

  // касание сферы с корпусом техники (OBB); возвращает технику
  collideSphere(p, r, outN) {
    for (const v of this.list) {
      const g = v.mesh;
      const dx = p.x - g.position.x, dz = p.z - g.position.z;
      if (dx * dx + dz * dz > 64) continue;
      const lp = this.tmp.copy(p); g.worldToLocal(lp);
      const h = v.half;
      const cx = clamp(lp.x, -h.x, h.x), cy = clamp(lp.y, 0, h.y * 2), cz = clamp(lp.z, -h.z, h.z);
      const ex = lp.x - cx, ey = lp.y - cy, ez = lp.z - cz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 1e-4;
        outN.set(ex / d, ey / d, ez / d).transformDirection(g.matrixWorld);
        if (d2 < 1e-8) outN.set(0, 1, 0);
        const pen = r - d;
        p.addScaledVector(outN, pen);
        v.lastHitLocal = new THREE.Vector3(cx, cy, cz);
        return v;
      }
    }
    return null;
  }

  pointInside(p) {
    for (const v of this.list) {
      const lp = this.tmp.copy(p); v.mesh.worldToLocal(lp);
      const h = v.half;
      if (Math.abs(lp.x) < h.x && lp.y > 0 && lp.y < h.y * 2 && Math.abs(lp.z) < h.z) return v;
    }
    return null;
  }

  // урон от взрыва; возвращает список уничтоженных
  blast(center, radius, dmg, direct) {
    const killed = [];
    for (const v of this.list) {
      if (!v.alive) continue;
      const lp = this.tmp.copy(center); v.mesh.worldToLocal(lp);
      const h = v.half;
      const cx = clamp(lp.x, -h.x, h.x), cy = clamp(lp.y, 0, h.y * 2), cz = clamp(lp.z, -h.z, h.z);
      const d = Math.hypot(lp.x - cx, lp.y - cy, lp.z - cz);
      if (d > radius) continue;
      let k = Math.pow(1 - d / radius, 1.4);
      let mult = 1, spot = '';
      if (d < 1.2) {
        if (cy > h.y * 2 - 0.5) { mult = 1.6; spot = 'КРЫША'; }
        else if (cz > h.z - 1.6) { mult = 1.5; spot = 'КОРМА'; }
        if (direct === v) k = 1;
      }
      const dam = dmg * k * mult;
      v.hp -= dam;
      v.lastSpot = spot;
      if (v.hp <= 0) { this.kill(v); killed.push(v); }
      else if (dam > 5 && this.onDamage) this.onDamage(v, dam, spot);
    }
    return killed;
  }

  kill(v) {
    v.alive = false;
    v.cur = 0;
    const M = getMats();
    const g = v.mesh;
    g.traverse(o => { if (o.isMesh && o.material !== M.rubber && o.material !== M.track) o.material = M.burnt; });
    const p = this.tmp.copy(g.position); p.y = 1.5;
    this.fx.explode(p, v.type === 'tank' || v.type === 'aa' ? 2.2 : 1.6, { debris: 18, noCrater: true });
    // срыв башни
    const ud = g.userData;
    if (ud.turret && (v.type === 'tank' || v.type === 'aa') && Math.random() < 0.75) {
      v.flyTurret = { obj: ud.turret, v: new THREE.Vector3((Math.random() - 0.5) * 4, 12 + Math.random() * 6, (Math.random() - 0.5) * 4), w: (Math.random() - 0.5) * 6 };
    }
    if (ud.tent) ud.tent.visible = false;
    this.fx.addBurner(g, v.type === 'tank' ? 1.4 : 1);
    if (this.onKill) this.onKill(v);
  }

  updateWrecks(dt) {
    for (const v of this.list) {
      const f = v.flyTurret;
      if (!f) continue;
      f.v.y -= 9.8 * dt;
      f.obj.position.addScaledVector(f.v, dt);
      f.obj.rotation.x += f.w * dt; f.obj.rotation.z += f.w * 0.7 * dt;
      if (f.obj.position.y < 0.3 - v.mesh.position.y && f.v.y < 0) { f.obj.position.y = 0.3; v.flyTurret = null; }
    }
  }

  // ближайший живой РЭБ и сила глушения в точке
  jamAt(p) {
    let j = 0;
    for (const v of this.list) {
      if (!v.alive || !v.jam) continue;
      const d = p.distanceTo(v.mesh.position);
      if (d < v.jam) j = Math.max(j, 1 - d / v.jam);
    }
    return j;
  }

  aliveTargets() { return this.list.filter(v => v.alive && v.target); }
}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function distSegPoint(p, v, dt, q) {
  // отрезок от p - v*dt до p
  const ax = p.x - v.x * dt, ay = p.y - v.y * dt, az = p.z - v.z * dt;
  const ex = v.x * dt, ey = v.y * dt, ez = v.z * dt;
  const l2 = ex * ex + ey * ey + ez * ez || 1e-6;
  let t = ((q.x - ax) * ex + (q.y - ay) * ey + (q.z - az) * ez) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + ex * t - q.x, dy = ay + ey * t - q.y, dz = az + ez * t - q.z;
  return dx * dx + dy * dy + dz * dz;
}
