// бронетехника и машины: модели, езда по дорогам, ЗСУ, РЭБ, урон
import * as THREE from 'three';
import { buildVehicle, vehicleMats } from './models.js';
import { ROADS } from './world.js';

const V = {
  tank: { name: 'ТАНК', hp: 180, speed: 6, size: [3.6, 2.3, 7.2], score: 300 },
  ifv: { name: 'БМП', hp: 120, speed: 8, size: [3.2, 2.3, 6.8], score: 250 },
  apc: { name: 'БТР', hp: 110, speed: 9, size: [2.9, 2.5, 7.6], score: 200 },
  truck: { name: 'ГРУЗОВИК', hp: 55, speed: 11, size: [2.5, 3.2, 7.4], score: 100 },
  ew: { name: 'РЭБ', hp: 60, speed: 8, size: [2.5, 3.4, 7.2], score: 400 },
  car: { name: 'ПИКАП', hp: 35, speed: 14, size: [2, 1.8, 5], score: 80 },
};
export const VTYPES = V;

export class Vehicles {
  constructor(scene, world, fx) {
    this.scene = scene; this.world = world; this.fx = fx;
    this.list = [];
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.inv = new THREE.Matrix4();
  }

  clear() {
    for (const v of this.list) this.scene.remove(v.mesh);
    this.list.length = 0;
    this.world.dynamic = null;
  }

  spawn(type, path, opts) {
    opts = opts || {};
    const T = V[type];
    const built = buildVehicle(type);
    const g = built.g, wheels = built.wheels;
    if (g.userData.track) {
      const base = vehicleMats().track;
      const tm = base.clone(); tm.map = base.map.clone(); tm.map.needsUpdate = true;
      g.userData.track.children.forEach(o => (o.material = tm));
      g.userData.trackMat = tm;
    }
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
        if (dd < 260) ud.turret.rotation.y += Math.max(-1, Math.min(1, d)) * dt * 0.5;
        if (ud.gun) {
          const el = Math.atan2(tmp.y - tp.y, Math.hypot(tmp.x - tp.x, tmp.z - tp.z));
          ud.gun.rotation.x += (Math.max(-0.1, Math.min(0.35, el)) - ud.gun.rotation.x) * dt * 2;
        }
      }
      if (ud.mast) ud.mast.rotation.y += dt * 0.6;
      if (ud.trackMat) ud.trackMat.map.offset.y -= v.cur * dt * 0.25;
    }
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
    const M = vehicleMats();
    const g = v.mesh;
    g.traverse(o => { if (o.isMesh && o.material !== M.rubber && o.material !== g.userData.trackMat && o.material !== M.glass) o.material = M.burnt; });
    const p = this.tmp.copy(g.position); p.y = 1.5;
    this.fx.explode(p, v.type === 'tank' || v.type === 'ifv' ? 2.2 : 1.6, { debris: 18, noCrater: true });
    // срыв башни
    const ud = g.userData;
    if (ud.turret && (v.type === 'tank' || v.type === 'ifv') && Math.random() < 0.75) {
      v.flyTurret = { obj: ud.turret, v: new THREE.Vector3((Math.random() - 0.5) * 4, 12 + Math.random() * 6, (Math.random() - 0.5) * 4), w: (Math.random() - 0.5) * 6 };
    }
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
