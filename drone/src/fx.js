// частицы, взрывы, обломки, воронки, пожары
import * as THREE from 'three';
import * as TX from './textures.js';

const VS = `
attribute float size;
attribute vec4 rgba;
varying vec4 vC;
uniform float scale;
void main(){
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D tex;
varying vec4 vC;
void main(){
  vec4 t = texture2D(tex, gl_PointCoord);
  gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
}`;

class Pool {
  constructor(scene, n, tex, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.c0 = new Float32Array(n * 4);
    this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('rgba', this.aCol);
    g.setAttribute('size', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { tex: { value: tex }, scale: { value: 400 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, gg, b, a, drag, grav) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i * 4] = r; this.c0[i * 4 + 1] = gg; this.c0[i * 4 + 2] = b; this.c0[i * 4 + 3] = a;
    this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.max[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.col[i * 4] = this.c0[i * 4]; this.col[i * 4 + 1] = this.c0[i * 4 + 1]; this.col[i * 4 + 2] = this.c0[i * 4 + 2];
      this.col[i * 4 + 3] = this.c0[i * 4 + 3] * fade;
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    const soft = TX.softSprite(), smoke = TX.smokeSprite();
    this.fire = new Pool(scene, quality > 0 ? 1600 : 900, soft, true);
    this.smoke = new Pool(scene, quality > 0 ? 1800 : 1000, smoke, false);
    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 60, 2);
      scene.add(l); this.lights.push({ l, t: 0, max: 0, i0: 0 });
    }
    // обломки
    const N = 220;
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.9 }), N);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    scene.add(this.debris);
    this.deb = [];
    for (let i = 0; i < N; i++) this.deb.push({ p: new THREE.Vector3(0, -100, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0, life: 0, rest: false });
    this.debHead = 0;
    this.m4 = new THREE.Matrix4(); this.qq = new THREE.Quaternion(); this.sv = new THREE.Vector3();
    // воронки
    const ct = TX.craterTex();
    this.craterMat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.craters = []; this.craterHead = 0;
    const cg = new THREE.PlaneGeometry(1, 1); cg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(cg, this.craterMat); m.visible = false; m.renderOrder = 1; scene.add(m); this.craters.push(m); }
    // ударные волны
    this.rings = [];
    const rg = new THREE.RingGeometry(0.8, 1, 40); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffeedd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      scene.add(m); this.rings.push({ m, t: 1 });
    }
    // постоянные очаги (горящие обломки)
    this.burners = [];
    this.shake = 0;
  }

  explode(p, scale, opts) {
    opts = opts || {};
    const s = scale;
    const F = this.fire, S = this.smoke;
    const nF = Math.floor(60 * Math.min(2, s) * (this.q > 0 ? 1 : 0.6));
    // ядро вспышки
    F.emit(p.x, p.y + 0.3, p.z, 0, 0, 0, 0.16, 5 * s, 12 * s, 1, 0.75, 0.45, 0.9, 0, 0);
    for (let i = 0; i < nF; i++) {
      const v = rndDir(); const sp = (4 + Math.random() * 10) * Math.sqrt(s);
      F.emit(p.x, p.y + 0.3, p.z, v.x * sp, Math.abs(v.y) * sp * 0.8 + 2, v.z * sp, 0.4 + Math.random() * 0.6, 1.5 * s, 3.5 * s, 1, 0.32 + Math.random() * 0.25, 0.06, 0.5, 3, 1.5);
    }
    // искры
    for (let i = 0; i < nF; i++) {
      const v = rndDir(); const sp = 12 + Math.random() * 25 * Math.sqrt(s);
      F.emit(p.x, p.y + 0.3, p.z, v.x * sp, Math.abs(v.y) * sp + 3, v.z * sp, 0.6 + Math.random() * 1.2, 0.25, 0.1, 1, 0.75, 0.35, 1, 0.8, -9.8);
    }
    // дым
    const nS = Math.floor(40 * Math.min(2, s) * (this.q > 0 ? 1 : 0.6));
    for (let i = 0; i < nS; i++) {
      const v = rndDir(); const sp = (2 + Math.random() * 5) * Math.sqrt(s);
      const g = 0.12 + Math.random() * 0.12;
      S.emit(p.x + v.x, p.y + 0.5, p.z + v.z, v.x * sp, Math.abs(v.y) * sp * 0.6 + 1.5, v.z * sp, 2.5 + Math.random() * 3, 2 * s, 9 * s, g, g * 0.95, g * 0.9, 0.85, 1.2, 0.6);
    }
    // пыль по земле
    if (p.y < 3) for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.28, sp = 8 + Math.random() * 8;
      S.emit(p.x, 0.4, p.z, Math.cos(a) * sp, 0.5, Math.sin(a) * sp, 1.5 + Math.random(), 1.5 * s, 6 * s, 0.42, 0.37, 0.3, 0.6, 2.2, 0.2);
    }
    // свет
    const L = this.lights.reduce((a, b) => (a.t > b.t ? b : a));
    L.l.position.set(p.x, p.y + 1.5, p.z); L.t = 0.35; L.max = 0.35; L.i0 = 60 * s * s;
    // обломки
    const nd = opts.debris != null ? opts.debris : Math.floor(10 * s);
    for (let i = 0; i < nd; i++) this.addDebris(p, s, opts.color);
    // воронка
    if (p.y < 1.5 && !opts.noCrater) {
      const c = this.craters[this.craterHead]; this.craterHead = (this.craterHead + 1) % this.craters.length;
      c.visible = true; c.position.set(p.x, 0.06 + this.craterHead * 0.0005, p.z); c.scale.setScalar(2.5 * s + 1); c.rotation.y = Math.random() * 6;
    }
    // ударная волна
    const r = this.rings.find(x => x.t >= 1) || this.rings[0];
    r.t = 0; r.s = s; r.m.position.set(p.x, Math.max(0.2, p.y), p.z);
  }

  addDebris(p, s, color) {
    const d = this.deb[this.debHead]; this.debHead = (this.debHead + 1) % this.deb.length;
    const v = rndDir();
    const sp = 6 + Math.random() * 14 * Math.sqrt(s);
    d.p.copy(p); d.p.y += 0.5;
    d.v.set(v.x * sp, Math.abs(v.y) * sp + 4, v.z * sp);
    d.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    d.s = (0.1 + Math.random() * 0.4) * Math.min(1.5, s);
    d.life = 6 + Math.random() * 4; d.rest = false;
  }

  // горение подбитой техники
  addBurner(obj, strength) { this.burners.push({ obj, s: strength || 1, t: 0, life: 40 }); }

  muzzle(p, dir) {
    this.fire.emit(p.x, p.y, p.z, dir.x * 5, dir.y * 5, dir.z * 5, 0.06, 1.5, 2.5, 1, 0.8, 0.4, 1, 0, 0);
    this.smoke.emit(p.x, p.y, p.z, dir.x * 3, dir.y * 3 + 0.5, dir.z * 3, 1.2, 0.5, 2.5, 0.5, 0.5, 0.5, 0.4, 1.5, 0.3);
  }

  spark(p, n) {
    for (let i = 0; i < n; i++) { const v = rndDir(); this.fire.emit(p.x, p.y, p.z, v.x * 6, v.y * 6 + 2, v.z * 6, 0.3 + Math.random() * 0.3, 0.18, 0.05, 1, 0.8, 0.5, 1, 1, -9.8); }
  }

  dust(p) {
    for (let i = 0; i < 2; i++) this.smoke.emit(p.x + (Math.random() - 0.5) * 2, p.y, p.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.4, (Math.random() - 0.5) * 2, 1.2, 0.8, 2.5, 0.45, 0.4, 0.33, 0.35, 1, 0.2);
  }

  update(dt, camPos) {
    this.fire.update(dt); this.smoke.update(dt);
    for (const L of this.lights) {
      if (L.t > 0) { L.t -= dt; L.l.intensity = L.i0 * Math.max(0, L.t / L.max); } else L.l.intensity = 0;
    }
    for (const r of this.rings) {
      if (r.t >= 1) { r.m.visible = false; continue; }
      r.t += dt * 2.2; r.m.visible = true;
      r.m.scale.setScalar(1 + r.t * 14 * r.s);
      r.m.material.opacity = (1 - r.t) * 0.5;
    }
    // обломки
    for (let i = 0; i < this.deb.length; i++) {
      const d = this.deb[i];
      if (d.life > 0) {
        d.life -= dt;
        if (!d.rest) {
          d.v.y -= 9.8 * dt;
          d.p.addScaledVector(d.v, dt);
          d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
          if (d.p.y < d.s / 2) { d.p.y = d.s / 2; d.v.multiplyScalar(0.4); d.v.y = -d.v.y * 0.4; d.w.multiplyScalar(0.5); if (d.v.lengthSq() < 0.5) d.rest = true; }
          if (Math.random() < 0.25 && d.v.lengthSq() > 4) this.smoke.emit(d.p.x, d.p.y, d.p.z, 0, 0.5, 0, 0.8, 0.3, 1.2, 0.15, 0.15, 0.15, 0.5, 1, 0.2);
        }
      } else if (d.s > 0) { d.s *= 0.95; if (d.s < 0.01) d.s = 0; }
      this.qq.setFromEuler(d.r);
      this.sv.setScalar(Math.max(0.0001, d.s));
      this.m4.compose(d.p, this.qq, this.sv);
      this.debris.setMatrixAt(i, this.m4);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    // пожары
    for (let i = this.burners.length - 1; i >= 0; i--) {
      const b = this.burners[i];
      b.life -= dt; b.t += dt;
      if (b.life <= 0) { this.burners.splice(i, 1); continue; }
      const p = b.obj.position;
      const near = camPos ? camPos.distanceToSquared(p) < 250 * 250 : true;
      if (!near) continue;
      const k = Math.min(1, b.life / 10);
      if (Math.random() < 0.7 * k) this.fire.emit(p.x + (Math.random() - 0.5) * 1.5, p.y + 1.2, p.z + (Math.random() - 0.5) * 1.5, 0, 2 + Math.random() * 2, 0, 0.6 + Math.random() * 0.6, 2.2 * b.s, 0.6, 1, 0.35 + Math.random() * 0.2, 0.06, 0.7, 0.5, 1.5);
      if (Math.random() < 0.5) {
        const g = 0.06 + Math.random() * 0.08;
        this.smoke.emit(p.x + (Math.random() - 0.5), p.y + 1.8, p.z + (Math.random() - 0.5), 0.6, 2.5 + Math.random() * 1.5, 0.3, 6 + Math.random() * 3, 1.5 * b.s, 10 * b.s, g, g, g, 0.75 * k, 0.15, 0.3);
      }
    }
    this.shake *= Math.exp(-dt * 4);
  }

  setScale(h) { this.fire.mat.uniforms.scale.value = h * 0.9; this.smoke.mat.uniforms.scale.value = h * 0.9; }
}

const _d = new THREE.Vector3();
function rndDir() {
  _d.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  if (_d.lengthSq() < 0.001) _d.set(0, 1, 0);
  return _d.normalize();
}
