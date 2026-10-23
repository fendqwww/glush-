// модель и физика FPV-дрона
import * as THREE from 'three';

export const TYPES = {
  kamikaze: {
    name: 'КАМИКАДЗЕ 7"', desc: 'кумулятивная БЧ, подрыв при ударе', mass: 1.4, twr: 5.2, drag: 0.016, lin: 0.05,
    radius: 0.24, tilt: 28, rates: 1.0, superRate: 0.68, expo: 0.3, crash: 3.5, warhead: 1, drops: 0, battery: 240, color: 0x2a2d2f,
    blast: 9, dmg: 120, signal: 1,
  },
  bomber: {
    name: 'БОМБЕР', desc: '4 сброса ВОГ, медленный и устойчивый', mass: 2.6, twr: 3.0, drag: 0.03, lin: 0.12,
    radius: 0.38, tilt: 10, rates: 0.7, superRate: 0.5, expo: 0.35, crash: 7, warhead: 0, drops: 4, battery: 420, color: 0x3b3f2c,
    blast: 5, dmg: 60, signal: 1,
  },
  fiber: {
    name: 'ОПТОВОЛОКНО', desc: 'не боится РЭБ, кабель 3 км', mass: 1.7, twr: 4.4, drag: 0.018, lin: 0.06,
    radius: 0.26, tilt: 24, rates: 0.95, superRate: 0.65, expo: 0.3, crash: 3.5, warhead: 1, drops: 0, battery: 300, color: 0x1f2a36,
    blast: 9, dmg: 120, signal: 0, cable: 3000,
  },
  racer: {
    name: 'ГОНОЧНЫЙ 5"', desc: 'без БЧ, бешеная тяга, для гонок', mass: 0.65, twr: 9, drag: 0.012, lin: 0.03,
    radius: 0.17, tilt: 32, rates: 1.1, superRate: 0.72, expo: 0.25, crash: 14, warhead: 0, drops: 0, battery: 200, color: 0x7a1c1c,
    blast: 0, dmg: 0, signal: 1,
  },
};

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpN = new THREE.Vector3();
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export class Drone {
  constructor(scene, type) {
    this.scene = scene;
    this.setType(type || 'kamikaze');
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.rate = new THREE.Vector3(); // угловая скорость в осях тела (рад/с): x тангаж, y рыскание, z крен
    this.mode = 'ANGLE';
    this.alive = true;
    this.armed = false;
    this.thrOut = 0;
    this.motor = 0;
    this.heading = 0;
    this.altHold = 0;
    this.impact = 0;
  }

  setType(t) {
    this.type = t;
    this.p = TYPES[t];
    if (this.mesh) { this.scene.remove(this.mesh); }
    this.mesh = buildModel(this.p, t);
    this.scene.add(this.mesh);
    this.props = this.mesh.userData.props;
    this.dropsLeft = this.p.drops;
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.rate.set(0, 0, 0);
    this.heading = heading || 0;
    this.quat.setFromAxisAngle(UP, this.heading);
    this.alive = true;
    this.battery = 1;
    this.voltage = 16.8;
    this.dropsLeft = this.p.drops;
    this.altHold = pos.y;
    this.thrOut = 0;
    this.flightTime = 0;
    this.maxG = 0;
    this.mesh.visible = true;
    this.mesh.userData.bombs.forEach(b => (b.visible = true));
  }

  // вход: thr 0..1, yaw/pitch/roll -1..1; signal 0..1 (задержки и шум снаружи)
  update(dt, inp, world, signal) {
    if (!this.alive) return null;
    const P = this.p;
    let event = null;
    this.flightTime += dt;

    // Betaflight-подобные rates
    const rc = (x, r, s, e) => {
      const ax = Math.abs(x);
      const xe = x * (ax * ax * ax * e + 1 - e);
      const v = xe * r * 200 / Math.max(0.05, 1 - Math.abs(xe) * s);
      return v * Math.PI / 180;
    };

    let thr = inp.thr;
    const want = tmpV;
    if (this.mode === 'ACRO') {
      want.set(rc(-inp.pitch, P.rates, P.superRate, P.expo), rc(-inp.yaw, P.rates * 0.8, P.superRate * 0.8, P.expo), rc(-inp.roll, P.rates, P.superRate, P.expo));
    } else {
      // стабилизация: стики задают углы, газ около центра держит высоту
      const maxTilt = 1.0;
      this.heading -= inp.yaw * 2.6 * dt;
      tmpE.set(-inp.pitch * maxTilt, this.heading, -inp.roll * maxTilt, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      // ошибка ориентации в осях тела
      tmpQ2.copy(this.quat).invert().multiply(tmpQ);
      if (tmpQ2.w < 0) { tmpQ2.x *= -1; tmpQ2.y *= -1; tmpQ2.z *= -1; tmpQ2.w *= -1; }
      want.set(tmpQ2.x, tmpQ2.y, tmpQ2.z).multiplyScalar(2 * 9);
      // газ: центр стика = висение с удержанием высоты
      const t = inp.thr - 0.5;
      const dz = Math.abs(t) < 0.06 ? 0 : t - Math.sign(t) * 0.06;
      this.altHold += dz * 22 * dt;
      if (this.pos.y > this.altHold + 3) this.altHold = this.pos.y - 3;
      if (this.pos.y < this.altHold - 3) this.altHold = this.pos.y + 3;
      const err = this.altHold - this.pos.y;
      const up = tmpV2.set(0, 1, 0).applyQuaternion(this.quat);
      const hover = Math.pow(1 / (P.twr * 0.95 * Math.max(0.35, up.y)), 0.625);
      thr = hover + err * 0.09 - this.vel.y * 0.07 + dz * 0.5;
      if (inp.thr < 0.02) thr = 0;
      thr = Math.min(1, Math.max(0, thr));
    }
    // шум управления при слабом сигнале
    if (signal < 0.6) {
      const j = (0.6 - signal) * 6;
      want.x += (Math.random() - 0.5) * j; want.z += (Math.random() - 0.5) * j;
    }
    // отклик моторов
    const k = 1 - Math.exp(-dt / 0.035);
    this.rate.x += (want.x - this.rate.x) * k;
    this.rate.y += (want.y - this.rate.y) * k;
    this.rate.z += (want.z - this.rate.z) * k;

    // propwash: при падении в свой поток трясёт
    const up = tmpN.set(0, 1, 0).applyQuaternion(this.quat);
    const vAlongUp = this.vel.dot(up);
    if (vAlongUp < -4 && thr > 0.3) {
      const w = Math.min(1, (-vAlongUp - 4) / 8) * 3;
      this.rate.x += (Math.random() - 0.5) * w; this.rate.z += (Math.random() - 0.5) * w;
    }

    // интегрируем ориентацию
    const w = this.rate;
    const ang = w.length() * dt;
    if (ang > 1e-7) {
      tmpQ.setFromAxisAngle(tmpV2.copy(w).normalize(), ang);
      this.quat.multiply(tmpQ).normalize();
    }

    // тяга
    this.thrOut += (thr - this.thrOut) * (1 - Math.exp(-dt / 0.05));
    const sag = 0.82 + 0.18 * this.battery - this.thrOut * 0.06;
    const ground = world.heightAt(this.pos.x, this.pos.z);
    const hAgl = this.pos.y - ground;
    const ge = hAgl < 1.2 ? 1 + (1.2 - hAgl) * 0.12 : 1;
    const thrust = Math.pow(this.thrOut, 1.6) * P.twr * P.mass * 9.81 * sag * ge;
    this.motor = this.thrOut;
    // батарея
    this.battery = Math.max(0, this.battery - dt * (0.15 + this.thrOut * 1.6) / P.battery);
    this.voltage = 13.2 + 3.6 * this.battery - this.thrOut * 0.9;
    if (this.battery <= 0) this.thrOut *= 0.6;

    const acc = tmpV2.copy(up).multiplyScalar(thrust / P.mass);
    acc.y -= 9.81;
    const sp = this.vel.length();
    acc.addScaledVector(this.vel, -(P.drag * sp + P.lin) / P.mass * 3);
    // ветер слегка
    acc.x += Math.sin(this.flightTime * 0.7) * 0.15;
    this.vel.addScaledVector(acc, dt);
    const gNow = acc.length() / 9.81;
    if (gNow > this.maxG) this.maxG = gNow;
    this.pos.addScaledVector(this.vel, dt);

    // земля
    if (this.pos.y < ground + P.radius) {
      tmpN.set(0, 1, 0);
      this.pos.y = ground + P.radius;
      event = this.bounce(tmpN, true);
    }
    // постройки
    if (event === null && world.collideSphere(this.pos, P.radius, tmpN)) {
      event = this.bounce(tmpN, false);
    }
    if (event === null && world.wireHit(this.pos, P.radius + 0.05)) {
      event = { type: 'crash', speed: sp, reason: 'намотал провода' };
      if (P.warhead) event.type = 'detonate';
    }
    this.sync();
    return event;
  }

  bounce(n, isGround) {
    const P = this.p;
    const vn = this.vel.dot(n);
    if (vn >= 0) return null;
    const speed = -vn;
    this.impact = speed;
    if (P.warhead && speed > P.crash && this.armed) return { type: 'detonate', speed };
    // мягкая посадка на землю
    if (isGround && speed < 2.5 && this.thrOut < 0.25) {
      this.vel.multiplyScalar(0.6);
      this.vel.y = 0;
      return null;
    }
    if (speed > P.crash * 2.2) return { type: 'crash', speed, reason: 'разбился' };
    this.vel.addScaledVector(n, -vn * 1.35);
    this.vel.multiplyScalar(0.7);
    this.rate.x += (Math.random() - 0.5) * speed * 2;
    this.rate.z += (Math.random() - 0.5) * speed * 2;
    return speed > 3 ? { type: 'bump', speed } : null;
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
  }

  spin(dt) {
    const s = (0.3 + this.motor * 2) * 60 * dt;
    this.props.forEach((p, i) => { p.rotation.y += (i % 2 ? s : -s); });
    const blur = this.mesh.userData.blur;
    blur.forEach(b => { b.material.opacity = 0.15 + this.motor * 0.35; });
  }

  // позиция камеры FPV с аплифтом
  fpvCamera(cam) {
    tmpV.set(0, 0.04, -this.p.radius * 0.6).applyQuaternion(this.quat);
    cam.position.copy(this.pos).add(tmpV);
    tmpQ.setFromAxisAngle(tmpV2.set(1, 0, 0), this.p.tilt * Math.PI / 180);
    cam.quaternion.copy(this.quat).multiply(tmpQ);
  }

  forward(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  speed() { return this.vel.length(); }
}

function buildModel(P, type) {
  const g = new THREE.Group();
  const s = P.radius / 0.24;
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.45, metalness: 0.3 });
  const body = new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.6, metalness: 0.2 });
  const motorM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.9 });
  const propM = new THREE.MeshStandardMaterial({ color: type === 'racer' ? 0xff5522 : 0x222222, roughness: 0.5 });
  const blurM = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const props = [], blur = [];
  const arm = 0.17 * s;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const ax = Math.cos(a) * arm, az = Math.sin(a) * arm;
    const armM = new THREE.Mesh(new THREE.BoxGeometry(0.025 * s, 0.012 * s, arm * 1.1), carbon);
    armM.position.set(ax / 2, 0, az / 2); armM.rotation.y = -a + Math.PI / 2;
    g.add(armM);
    const mot = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * s, 0.018 * s, 0.03 * s, 10), motorM);
    mot.position.set(ax, 0.02 * s, az); g.add(mot);
    const prop = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.003 * s, 0.014 * s), propM);
    prop.add(blade);
    const b2 = blade.clone(); b2.rotation.y = Math.PI / 1.5; prop.add(b2);
    const b3 = blade.clone(); b3.rotation.y = -Math.PI / 1.5; prop.add(b3);
    prop.position.set(ax, 0.04 * s, az);
    g.add(prop); props.push(prop);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(0.075 * s, 20), blurM.clone());
    disk.rotation.x = -Math.PI / 2; disk.position.set(ax, 0.041 * s, az);
    g.add(disk); blur.push(disk);
    // светодиоды: красные сзади, зелёные спереди
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008 * s, 6, 4), new THREE.MeshBasicMaterial({ color: az < 0 ? 0x33ff66 : 0xff2222 }));
    led.position.set(ax * 0.7, -0.012 * s, az * 0.7); g.add(led);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.03 * s, 0.13 * s), body);
  g.add(plate);
  const batt = new THREE.Mesh(new THREE.BoxGeometry(0.045 * s, 0.035 * s, 0.09 * s), new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.6 }));
  batt.position.y = 0.035 * s; g.add(batt);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.025 * s, 0.025 * s, 0.025 * s), carbon);
  cam.position.set(0, 0.01 * s, -0.07 * s); cam.rotation.x = P.tilt * Math.PI / 180; g.add(cam);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.01 * s, 8), new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 1, roughness: 0.1 }));
  lens.rotation.x = Math.PI / 2 + P.tilt * Math.PI / 180; lens.position.set(0, 0.012 * s, -0.085 * s); g.add(lens);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 0.08 * s, 4), carbon);
  ant.position.set(0, 0.05 * s, 0.07 * s); ant.rotation.x = -0.6; g.add(ant);
  const bombs = [];
  if (P.warhead) {
    // заряд под рамой, смотрит вперёд
    const wm = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.22 * s, 10), wm);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, -0.04 * s, -0.04 * s); g.add(tube);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.09 * s, 10), wm);
    cone.rotation.x = -Math.PI / 2; cone.position.set(0, -0.04 * s, -0.19 * s); g.add(cone);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * s, 0.006 * s, 0.05 * s, 6), motorM);
    fuse.rotation.x = Math.PI / 2; fuse.position.set(0, -0.04 * s, -0.25 * s); g.add(fuse);
  }
  if (P.drops) {
    const bm = new THREE.MeshStandardMaterial({ color: 0x3e4a2e, roughness: 0.6 });
    for (let i = 0; i < P.drops; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.07 * s, 8), bm);
      b.position.set((i % 2 ? 1 : -1) * 0.03 * s, -0.04 * s, (i < 2 ? -1 : 1) * 0.025 * s);
      g.add(b); bombs.push(b);
    }
  }
  if (type === 'fiber') {
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.05 * s, 14), new THREE.MeshStandardMaterial({ color: 0xc9c06a, roughness: 0.4 }));
    spool.rotation.z = Math.PI / 2; spool.position.set(0, 0.03 * s, 0.1 * s); g.add(spool);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { props, blur, bombs };
  return g;
}
