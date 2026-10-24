// постобработка: блум от неона, ACES, виньетка, зерно, марево от жары
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT = `
precision highp float; uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
void main(){
  vec3 c = texture2D(t, vUv + px * vec2(-1.0,-1.0)).rgb + texture2D(t, vUv + px * vec2(1.0,-1.0)).rgb
         + texture2D(t, vUv + px * vec2(-1.0,1.0)).rgb + texture2D(t, vUv + px * vec2(1.0,1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  c *= smoothstep(0.9, 2.2, l);
  gl_FragColor = vec4(min(c, vec3(12.0)), 1.0);
}`;
const BLUR = `
precision highp float; uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(t, vUv).rgb * 0.227027;
  c += texture2D(t, vUv + dir * 1.3846).rgb * 0.316216;
  c += texture2D(t, vUv - dir * 1.3846).rgb * 0.316216;
  c += texture2D(t, vUv + dir * 3.2308).rgb * 0.070270;
  c += texture2D(t, vUv - dir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;
const FINAL = `
precision highp float;
uniform sampler2D tScene, tB1, tB2; uniform vec2 res; uniform float time, heat, exposure, alarm, bloom, ldr;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 aces(vec3 c){
  c *= exposure;
  const mat3 m1 = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
  const mat3 m2 = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
  c = m1 * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = vUv;
  // марево: дрожание по вертикали, сильнее внизу
  float hz = heat * (0.0015 + 0.0025 * (1.0 - uv.y));
  uv.x += sin(uv.y * 60.0 + time * 6.0) * hz + sin(uv.y * 23.0 - time * 3.7) * hz * 0.6;
  uv.y += cos(uv.x * 40.0 + time * 5.0) * hz * 0.5;
  vec2 c = uv - 0.5;
  float ca = 0.0012 + heat * 0.0015;
  vec3 col;
  col.r = texture2D(tScene, uv + c * ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - c * ca).b;
  if (ldr > 0.5) col *= 1.0;
  vec3 b = texture2D(tB1, vUv).rgb * 0.7 + texture2D(tB2, vUv).rgb * 0.9;
  col += b * bloom;
  // жара — тёплый сдвиг
  col *= mix(vec3(1.0), vec3(1.12, 0.96, 0.84), heat);
  col = aces(col);
  // виньетка
  float v = smoothstep(0.25, 0.95, length(c * vec2(1.0, 0.75)) * 1.25);
  col *= 1.0 - v * 0.6;
  col = mix(col, col * vec3(1.6, 0.35, 0.3), alarm * v * 0.9);
  col = toSRGB(col);
  col += (h(vUv * res + fract(time * 13.0)) - 0.5) * 0.03;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  constructor(renderer, quality) {
    this.r = renderer;
    this.q = quality;
    const gl = renderer.getContext();
    let type = THREE.UnsignedByteType;
    if (renderer.capabilities.isWebGL2 && gl.getExtension('EXT_color_buffer_float')) type = THREE.HalfFloatType;
    else if (!renderer.capabilities.isWebGL2 && gl.getExtension('OES_texture_half_float') && gl.getExtension('EXT_color_buffer_half_float')) type = THREE.HalfFloatType;
    this.ldr = type === THREE.UnsignedByteType;
    const o = { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.rt = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, o, { depthBuffer: true, samples: renderer.capabilities.isWebGL2 ? 4 : 0 }));
    this.a1 = new THREE.WebGLRenderTarget(4, 4, o); this.b1 = new THREE.WebGLRenderTarget(4, 4, o);
    this.a2 = new THREE.WebGLRenderTarget(4, 4, o); this.b2 = new THREE.WebGLRenderTarget(4, 4, o);
    const sm = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.mBright = sm(BRIGHT, { t: { value: null }, px: { value: new THREE.Vector2() } });
    this.mBlur = sm(BLUR, { t: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mFinal = sm(FINAL, {
      tScene: { value: this.rt.texture }, tB1: { value: this.b1.texture }, tB2: { value: this.b2.texture },
      res: { value: new THREE.Vector2(4, 4) }, time: { value: 0 }, heat: { value: 0 }, exposure: { value: 1 }, alarm: { value: 0 },
      bloom: { value: 1.35 }, ldr: { value: this.ldr ? 1 : 0 },
    });
    if (this.ldr) this.mBright.fragmentShader = this.mBright.fragmentShader.replace('smoothstep(0.9, 2.2, l)', 'smoothstep(0.7, 1.0, l)');
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mFinal);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    const w1 = Math.max(1, w >> 2), h1 = Math.max(1, h >> 2), w2 = Math.max(1, w >> 3), h2 = Math.max(1, h >> 3);
    this.a1.setSize(w1, h1); this.b1.setSize(w1, h1); this.a2.setSize(w2, h2); this.b2.setSize(w2, h2);
    this.w = w; this.h = h; this.w1 = w1; this.h1 = h1; this.w2 = w2; this.h2 = h2;
    this.mFinal.uniforms.res.value.set(w, h);
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }
  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    // яркое → 1/4
    this.mBright.uniforms.t.value = this.rt.texture; this.mBright.uniforms.px.value.set(1 / this.w, 1 / this.h);
    this.pass(this.mBright, this.a1);
    this.mBlur.uniforms.t.value = this.a1.texture; this.mBlur.uniforms.dir.value.set(1 / this.w1, 0); this.pass(this.mBlur, this.b1);
    this.mBlur.uniforms.t.value = this.b1.texture; this.mBlur.uniforms.dir.value.set(0, 1 / this.h1); this.pass(this.mBlur, this.a1);
    // 1/8 для широкого ореола
    this.mBlur.uniforms.t.value = this.a1.texture; this.mBlur.uniforms.dir.value.set(1.5 / this.w2, 0); this.pass(this.mBlur, this.a2);
    this.mBlur.uniforms.t.value = this.a2.texture; this.mBlur.uniforms.dir.value.set(0, 1.5 / this.h2); this.pass(this.mBlur, this.b2);
    // финал: b1 — копия a1 через ещё один проход
    this.mBlur.uniforms.t.value = this.a1.texture; this.mBlur.uniforms.dir.value.set(0.7 / this.w1, 0.7 / this.h1); this.pass(this.mBlur, this.b1);
    this.quad.material = this.mFinal;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
