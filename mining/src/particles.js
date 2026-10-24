// лёгкая система частиц на одном draw call: дым, огонь, искры, пыль, пузыри
import * as THREE from 'three';

const VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aRot;
uniform float scale;
varying float vA; varying vec3 vC; varying float vR;
void main(){
  vA = aAlpha; vC = aColor; vR = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D map;
varying float vA; varying vec3 vC; varying float vR;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vR), s = sin(vR);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  vec4 t = texture2D(map, p);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.004) discard;
}`;

export class Particles {
  constructor(scene, max, map, additive) {
    this.max = max;
    this.n = 0;
    this.p = [];
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { map: { value: map }, scale: { value: 400 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Points(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a, grow = 0, drag = 0, grav = 0) {
    if (this.p.length >= this.max) return;
    this.p.push({ x, y, z, vx, vy, vz, life, t: 0, size, r, g, b, a, grow, drag, grav, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.5 });
  }
  update(dt) {
    const P = this.p;
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) continue;
      q.vy -= q.grav * dt;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d; q.vy *= d; q.vz *= d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.vr * dt;
      P[j++] = q;
    }
    P.length = j;
    for (let i = 0; i < j; i++) {
      const q = P[i], k = q.t / q.life;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.size[i] = q.size * (1 + q.grow * k);
      this.alpha[i] = q.a * Math.min(1, k * 6) * (1 - k);
      this.col[i * 3] = q.r; this.col[i * 3 + 1] = q.g; this.col[i * 3 + 2] = q.b;
      this.rot[i] = q.rot;
    }
    this.geo.setDrawRange(0, j);
    for (const k in this.geo.attributes) this.geo.attributes[k].needsUpdate = true;
  }
}
