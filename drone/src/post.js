// аналоговый FPV-сигнал: дисторсия, аберрация, помехи, тонмаппинг
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 res;
uniform float time, signal, distort, analog, flash, hurt, exposure;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
vec3 aces(vec3 c){
  c *= exposure / 0.6;
  const mat3 m1 = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
  const mat3 m2 = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
  c = m1 * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
vec3 samp(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
void main(){
  vec2 uv = vUv;
  float bad = clamp(1.0 - signal, 0.0, 1.0);
  // срыв строк
  float line = floor(uv.y * 180.0);
  float jit = (h(vec2(line, floor(time * 30.0))) - 0.5) * bad * bad * 0.12 * analog;
  float roll = step(0.85, bad) * fract(time * 0.7) * 0.0;
  uv.x += jit;
  uv.y = fract(uv.y + roll);
  // бочка
  vec2 c = uv - 0.5;
  float r2 = dot(c * vec2(res.x / res.y, 1.0), c * vec2(res.x / res.y, 1.0));
  vec2 d = c * (1.0 + distort * r2) / (1.0 + distort * 0.35);
  vec2 uvd = d + 0.5;
  float ca = (0.0025 + bad * 0.01) * analog + distort * 0.004 * r2;
  vec3 col;
  col.r = samp(uvd + d * ca * 2.0).r;
  col.g = samp(uvd).g;
  col.b = samp(uvd - d * ca * 2.0).b;
  col = aces(col);
  // аналог: шум, строки, обесцвечивание
  float n = h(uv * res + fract(time) * 100.0);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), bad * 0.7 * analog);
  col += (n - 0.5) * (0.05 + bad * 0.5) * analog;
  float snow = smoothstep(0.55, 1.0, bad);
  col = mix(col, vec3(n * 0.9), snow * analog);
  col *= 1.0 - analog * 0.06 * (0.5 + 0.5 * sin(uv.y * res.y * 1.6));
  // полоса помехи
  float band = smoothstep(0.0, 0.02, abs(fract(uv.y * 0.5 + time * 0.13) - 0.5) - 0.2 * (1.0 - bad));
  col = mix(col, col * 0.6 + n * 0.2, (1.0 - band) * bad * analog);
  // виньетка
  col *= 1.0 - smoothstep(0.35, 1.05, length(c * vec2(1.0, 0.85)) * 1.25) * 0.75;
  col = toSRGB(clamp(col, 0.0, 1.0));
  col += vec3(1.0, 0.85, 0.6) * flash;
  col = mix(col, vec3(0.8, 0.05, 0.03), hurt * 0.45);
  if (uvd.x < 0.0 || uvd.x > 1.0 || uvd.y < 0.0 || uvd.y > 1.0) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const gl = renderer.getContext();
    let type = THREE.UnsignedByteType;
    if (renderer.capabilities.isWebGL2 && gl.getExtension('EXT_color_buffer_float')) type = THREE.HalfFloatType;
    else if (!renderer.capabilities.isWebGL2 && gl.getExtension('OES_texture_half_float') && gl.getExtension('EXT_color_buffer_half_float')) type = THREE.HalfFloatType;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: true, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.generateMipmaps = false;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: {
        tDiffuse: { value: this.rt.texture }, res: { value: new THREE.Vector2(4, 4) }, time: { value: 0 },
        signal: { value: 1 }, distort: { value: 0.22 }, analog: { value: 1 }, flash: { value: 0 }, hurt: { value: 0 }, exposure: { value: 1 },
      },
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize(w, h) { this.rt.setSize(w, h); this.mat.uniforms.res.value.set(w, h); }
  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
