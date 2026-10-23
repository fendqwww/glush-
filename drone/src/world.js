// процедурный посёлок: дома с интерьерами, дороги, промзона, лес, провода
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { rand, setSeed } from './textures.js';

const CELL = 16;
export const ROADS = [-180, -60, 60, 180];
export const ROAD_W = 10;
export const CITY_R = 250;

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.boxes = [];          // статические AABB
    this.grid = new Map();
    this.wires = [];          // отрезки проводов [ax,ay,az,bx,by,bz]
    this.houses = [];
    this.geos = new Map();    // ключ материала+чанк -> массив геометрий
    this.mats = {};
    this.tmpRes = [];
    this.stamp = 0;
    setSeed(9001);
    this.makeMaterials();
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildForest();
    this.buildWires();
    this.buildWarProps();
    this.buildGrass();
    this.flush();
  }

  makeMaterials() {
    const std = (t, uvs, o) => {
      const mat = new THREE.MeshStandardMaterial(Object.assign({ map: t.map, roughness: 0.92, metalness: 0 }, o || {}));
      if (t.normalMap) { mat.normalMap = t.normalMap; mat.normalScale.set(0.8, 0.8); }
      mat.uvs = uvs;
      return mat;
    };
    const m = this.mats;
    m.brickRed = std(TX.brick([8, 45, 36]), 2.4);
    m.brickWhite = std(TX.brick([35, 18, 66]), 2.4);
    m.plasterA = std(TX.plaster('#b9ab8f'), 3);
    m.plasterB = std(TX.plaster('#9aa7a6'), 3);
    m.plasterC = std(TX.plaster('#c7b37b'), 3);
    m.concrete = std(TX.concrete(), 3);
    m.roofA = std(TX.roof(10), 3, { metalness: 0.2, roughness: 0.75 });
    m.roofB = std(TX.roof(200), 3, { metalness: 0.3, roughness: 0.7 });
    m.roofC = std(TX.roof(100), 3);
    m.wood = std(TX.wood(), 2);
    m.floor = std(TX.floorTiles(), 2);
    m.wallIn1 = std(TX.wallpaper(40), 1.5);
    m.wallIn2 = std(TX.wallpaper(90), 1.5);
    m.wallIn3 = std(TX.wallpaper(205), 1.5);
    m.metal = std(TX.metal('#5f6366', false), 3, { metalness: 0.5, roughness: 0.6 });
    m.rust = std(TX.metal('#6e4a33', false), 3, { metalness: 0.4, roughness: 0.8 });
    m.dirt = std(TX.dirt(), 6);
    m.frame = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 });
    m.dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 });
    m.fabric = new THREE.MeshStandardMaterial({ color: 0x5a3a3a, roughness: 1 });
    m.fabric2 = new THREE.MeshStandardMaterial({ color: 0x34445a, roughness: 1 });
    m.ceil = std(TX.concrete(), 3);
    // имитация отражённого света внутри домов
    for (const k of ['wallIn1', 'wallIn2', 'wallIn3', 'floor', 'ceil', 'fabric', 'fabric2']) {
      const q = m[k];
      if (q.map) q.emissiveMap = q.map;
      q.emissive = new THREE.Color(k === 'ceil' ? 0x6a6a66 : 0x4a4642);
    }
    for (const k in m) m[k].uvs = m[k].uvs || 2;
  }

  // ---- коллизии -------------------------------------------------------
  addBox(minx, miny, minz, maxx, maxy, maxz, tag) {
    const b = { minx, miny, minz, maxx, maxy, maxz, tag: tag || 0, s: 0 };
    this.boxes.push(b);
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL);
    const z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x * 4096 + z;
      let a = this.grid.get(k);
      if (!a) { a = []; this.grid.set(k, a); }
      a.push(b);
    }
    return b;
  }

  // все AABB вокруг точки радиуса r
  near(x, z, r) {
    const res = this.tmpRes; res.length = 0;
    this.stamp++;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.grid.get(i * 4096 + j);
      if (!a) continue;
      for (let n = 0; n < a.length; n++) {
        const b = a[n];
        if (b.s === this.stamp) continue;
        b.s = this.stamp; res.push(b);
      }
    }
    return res;
  }

  // выталкивание сферы; возвращает нормаль удара или null
  collideSphere(p, r, outN) {
    let hit = false;
    const list = this.near(p.x, p.z, r + 1);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const cx = p.x < b.minx ? b.minx : p.x > b.maxx ? b.maxx : p.x;
        const cy = p.y < b.miny ? b.miny : p.y > b.maxy ? b.maxy : p.y;
        const cz = p.z < b.minz ? b.minz : p.z > b.maxz ? b.maxz : p.z;
        let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-5) {
          // центр внутри коробки: выталкиваем по ближайшей грани
          const opts = [p.x - b.minx, b.maxx - p.x, p.y - b.miny, b.maxy - p.y, p.z - b.minz, b.maxz - p.z];
          let mi = 0; for (let k = 1; k < 6; k++) if (opts[k] < opts[mi]) mi = k;
          dx = dy = dz = 0;
          if (mi === 0) dx = -1; else if (mi === 1) dx = 1; else if (mi === 2) dy = -1; else if (mi === 3) dy = 1; else if (mi === 4) dz = -1; else dz = 1;
          const pen = opts[mi] + r;
          p.x += dx * pen; p.y += dy * pen; p.z += dz * pen;
          outN.set(dx, dy, dz);
        } else {
          dx /= d; dy /= d; dz /= d;
          const pen = r - d;
          p.x += dx * pen; p.y += dy * pen; p.z += dz * pen;
          outN.set(dx, dy, dz);
        }
        hit = true;
      }
    }
    return hit;
  }

  // точка внутри какой-либо коробки (для снарядов)
  pointHit(p) {
    const list = this.near(p.x, p.z, 0.5);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (p.x > b.minx && p.x < b.maxx && p.y > b.miny && p.y < b.maxy && p.z > b.minz && p.z < b.maxz) return b;
    }
    return null;
  }

  // прямая видимость между точками
  lineClear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(len / CELL));
    this.stamp++;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = a.x + dx * t, pz = a.z + dz * t;
      const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
      for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
        const arr = this.grid.get(i * 4096 + j);
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const bx = arr[n];
          if (bx.s === this.stamp) continue;
          bx.s = this.stamp;
          if (segBox(a.x, a.y, a.z, dx, dy, dz, bx)) return false;
        }
      }
    }
    return true;
  }

  // близость к проводам
  wireHit(p, r) {
    for (let i = 0; i < this.wires.length; i++) {
      const w = this.wires[i];
      if (Math.abs(p.x - w[6]) > w[7] || Math.abs(p.z - w[8]) > w[7]) continue;
      const ex = w[3] - w[0], ey = w[4] - w[1], ez = w[5] - w[2];
      const l2 = ex * ex + ey * ey + ez * ez;
      let t = ((p.x - w[0]) * ex + (p.y - w[1]) * ey + (p.z - w[2]) * ez) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = w[0] + ex * t - p.x, qy = w[1] + ey * t - p.y, qz = w[2] + ez * t - p.z;
      if (qx * qx + qy * qy + qz * qz < r * r) return true;
    }
    return false;
  }

  heightAt(x, z) {
    const r = Math.max(Math.abs(x), Math.abs(z));
    if (r < 270) return 0;
    const t = Math.min(1, (r - 270) / 120);
    const n = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 14 + Math.sin(x * 0.031 + z * 0.02) * 5 + 12;
    return t * t * (3 - 2 * t) * Math.max(0, n) + Math.max(0, r - 420) * 0.4;
  }

  // ---- геометрия ------------------------------------------------------
  // коробка в мировых координатах с мировой развёрткой UV
  box(mat, cx, cy, cz, sx, sy, sz, collide) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(cx, cy, cz);
    worldUV(g, mat.uvs || 2);
    const chunk = Math.floor((cx + 1000) / 120) * 100 + Math.floor((cz + 1000) / 120);
    const key = mat.uuid + '|' + chunk;
    let e = this.geos.get(key);
    if (!e) { e = { mat, list: [] }; this.geos.set(key, e); }
    e.list.push(g);
    if (collide !== false) this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, collide === true ? 0 : collide);
  }

  addGeo(mat, g) {
    const key = mat.uuid + '|g';
    let e = this.geos.get(key);
    if (!e) { e = { mat, list: [] }; this.geos.set(key, e); }
    e.list.push(g);
  }

  flush() {
    for (const [, e] of this.geos) {
      const g = mergeGeometries(e.list.map(q => q.index ? q.toNonIndexed() : q), false);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, e.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      e.list.forEach(q => q.dispose());
    }
    this.geos.clear();
  }

  buildGround() {
    const size = 1500, seg = this.quality > 0 ? 150 : 90;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    g.computeVertexNormals();
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = Math.sin(x * 0.021 + Math.sin(z * 0.017) * 2) * 0.5 + Math.sin(z * 0.043 - x * 0.013) * 0.3 + Math.sin(x * 0.11 + z * 0.09) * 0.12;
      const k = 0.82 + n * 0.16;
      col[i * 3] = k * (1 + n * 0.12); col[i * 3 + 1] = k; col[i * 3 + 2] = k * (0.9 - n * 0.06);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 9, pos.getZ(i) / 9);
    const t = TX.grass();
    const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 1, vertexColors: true });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    this.scene.add(m);
  }

  buildRoads() {
    const t = TX.road();
    const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.95 });
    const L = 760;
    const geos = [];
    for (const r of ROADS) {
      // вдоль Z
      const a = new THREE.PlaneGeometry(ROAD_W, L, 1, 1);
      a.rotateX(-Math.PI / 2); a.translate(r, 0.03, 0);
      setUV(a, [0, 0, 1, 0, 0, L / 20, 1, L / 20]);
      geos.push(a);
      // вдоль X
      const b = new THREE.PlaneGeometry(L, ROAD_W, 1, 1);
      b.rotateX(-Math.PI / 2); b.translate(0, 0.035, r);
      setUV(b, [0, 0, 0, 1, L / 20, 0, L / 20, 1]);
      geos.push(b);
    }
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.receiveShadow = true;
    this.scene.add(m);
    // перекрёстки — чистый асфальт поверх разметки
    const asp = TX.asphalt();
    const am = new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normalMap, roughness: 0.95 });
    const ig = [];
    for (const x of ROADS) for (const z of ROADS) {
      const p = new THREE.PlaneGeometry(ROAD_W, ROAD_W);
      p.rotateX(-Math.PI / 2); p.translate(x, 0.045, z);
      ig.push(p);
    }
    const im = new THREE.Mesh(mergeGeometries(ig), am);
    im.receiveShadow = true;
    this.scene.add(im);
    // бордюры
    const curb = this.mats.concrete;
    for (const r of ROADS) {
      for (let i = 0; i < ROADS.length + 1; i++) {
        const a0 = i === 0 ? -380 : ROADS[i - 1] + ROAD_W / 2;
        const a1 = i === ROADS.length ? 380 : ROADS[i] - ROAD_W / 2;
        const len = a1 - a0, mid = (a0 + a1) / 2;
        for (const s of [-1, 1]) {
          this.box(curb, r + s * (ROAD_W / 2 + 0.15), 0.08, mid, 0.3, 0.16, len, false);
          this.box(curb, mid, 0.08, r + s * (ROAD_W / 2 + 0.15), len, 0.16, 0.3, false);
        }
      }
    }
    // граф дорог для техники
    this.nodes = [];
    for (const x of ROADS) for (const z of ROADS) this.nodes.push(new THREE.Vector3(x, 0, z));
  }

  // ---- кварталы ------------------------------------------------------
  buildBlocks() {
    const edges = [-300, ...ROADS, 300];
    let bi = 0;
    for (let i = 0; i < edges.length - 1; i++) {
      for (let j = 0; j < edges.length - 1; j++) {
        const x0 = edges[i] + ROAD_W / 2 + 4, x1 = edges[i + 1] - ROAD_W / 2 - 4;
        const z0 = edges[j] + ROAD_W / 2 + 4, z1 = edges[j + 1] - ROAD_W / 2 - 4;
        const outer = i === 0 || j === 0 || i === edges.length - 2 || j === edges.length - 2;
        bi++;
        if (i === 2 && j === 2) { this.industrial(x0, z0, x1, z1); continue; }
        if (i === 1 && j === 2) { this.highrises(x0, z0, x1, z1); continue; }
        if (i === 3 && j === 1) { this.garages(x0, z0, x1, z1); continue; }
        if (outer) { this.fields(x0, z0, x1, z1, bi); continue; }
        this.residential(x0, z0, x1, z1);
      }
    }
  }

  // жилой квартал: дома по всем четырём сторонам фасадом на дорогу
  residential(x0, z0, x1, z1) {
    const W = x1 - x0, D = z1 - z0;
    const step = 17;
    // юг (фасад -z, rot 2) и север (фасад +z, rot 0)
    for (let u = x0 + 10; u < x1 - 8; u += step) {
      const ja = (rand() - 0.5) * 2;
      if (rand() < 0.9) { const hx = u + ja; this.house(hx, z0 + 9 + rand() * 2, 2); this.fenceGap(hx - step / 2, z0 + 1, hx + step / 2, z0 + 1, hx + 1.2); }
      if (rand() < 0.9) { const hx = u - ja; this.house(hx, z1 - 9 - rand() * 2, 0); this.fenceGap(hx - step / 2, z1 - 1, hx + step / 2, z1 - 1, hx - 1.2); }
    }
    // запад (фасад -x, rot 3) и восток (фасад +x, rot 1), без углов
    for (let v = z0 + 30; v < z1 - 28; v += step) {
      if (rand() < 0.8) { this.house(x0 + 9 + rand() * 2, v, 3); this.fenceGapZ(x0 + 1, v - step / 2, v + step / 2, v - 1.2); }
      if (rand() < 0.8) { this.house(x1 - 9 - rand() * 2, v, 1); this.fenceGapZ(x1 - 1, v - step / 2, v + step / 2, v + 1.2); }
    }
    // в середине квартала — сады, сараи
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < 14; i++) this.tree(cx + (rand() - 0.5) * (W - 50), cz + (rand() - 0.5) * (D - 50));
    for (let i = 0; i < 3; i++) this.shed(cx + (rand() - 0.5) * (W - 50), cz + (rand() - 0.5) * (D - 50));
  }

  fenceGap(xa, z, xb, _z, gapX) {
    if (rand() < 0.25) return;
    this.fenceLine(xa + 0.5, z, gapX - 1.4, z, rand() < 0.3);
    this.fenceLine(gapX + 1.4, z, xb - 0.5, z, rand() < 0.3);
  }

  fenceGapZ(x, za, zb, gapZ) {
    if (rand() < 0.25) return;
    this.fenceLine(x, za + 0.5, x, gapZ - 1.4, rand() < 0.3);
    this.fenceLine(x, gapZ + 1.4, x, zb - 0.5, rand() < 0.3);
  }

  // дом: rot 0 => фасад смотрит в +z
  house(x, z, rot) {
    const floors = rand() < 0.35 ? 2 : 1;
    const W = 9 + Math.floor(rand() * 3) * 1.5, D = 8 + Math.floor(rand() * 2) * 1.5;
    const FH = 3.0, T = 0.25;
    const ext = [this.mats.plasterA, this.mats.plasterB, this.mats.plasterC, this.mats.brickRed, this.mats.brickWhite][Math.floor(rand() * 5)];
    const inn = [this.mats.wallIn1, this.mats.wallIn2, this.mats.wallIn3][Math.floor(rand() * 3)];
    const L = this.local(x, z, rot);
    const house = { x, z, rot, W, D, floors, windows: [], door: null, interior: [] };
    this.lining = inn;
    const WIN_W = 1.5, WIN_H = 1.45, SILL = 0.85, DOOR_W = 1.5, DOOR_H = 2.3;

    for (let f = 0; f < floors; f++) {
      const y0 = f * FH;
      // фасад (+z): дверь и окна
      const front = [];
      if (f === 0) front.push([-1.2 - DOOR_W / 2, -1.2 + DOOR_W / 2, 0.02, DOOR_H]);
      else front.push([-1.2 - WIN_W / 2, -1.2 + WIN_W / 2, SILL, SILL + WIN_H]);
      front.push([W / 2 - 2.2 - WIN_W / 2, W / 2 - 2.2 + WIN_W / 2, SILL, SILL + WIN_H]);
      if (W > 10) front.push([-W / 2 + 1.8 - WIN_W / 2, -W / 2 + 1.8 + WIN_W / 2, SILL, SILL + WIN_H]);
      this.wall(L, ext, 'x', D / 2 - T / 2, y0, -W / 2, W / 2, FH, T, front, house, f, [0, 1]);
      // задняя (-z)
      const back = [[-W / 4 - WIN_W / 2, -W / 4 + WIN_W / 2, SILL, SILL + WIN_H], [W / 4 - WIN_W / 2, W / 4 + WIN_W / 2, SILL, SILL + WIN_H]];
      this.wall(L, ext, 'x', -D / 2 + T / 2, y0, -W / 2, W / 2, FH, T, back, house, f, [0, -1]);
      // боковые (±x), длина по z без углов
      const side = [[-WIN_W / 2 + D / 6, WIN_W / 2 + D / 6, SILL, SILL + WIN_H]];
      this.wallZ(L, ext, W / 2 - T / 2, y0, -D / 2 + T, D / 2 - T, FH, T, side, house, f, [1, 0]);
      this.wallZ(L, ext, -W / 2 + T / 2, y0, -D / 2 + T, D / 2 - T, FH, T, [[-WIN_W / 2 - D / 6, WIN_W / 2 - D / 6, SILL, SILL + WIN_H]], house, f, [-1, 0]);
      // перегородка поперёк с дверным проёмом
      this.wall(L, inn, 'x', -0.4, y0, -W / 2 + T, W / 2 - T, FH, 0.15, [[W / 2 - 3.2, W / 2 - 1.6, 0.02, 2.3]], null, f);
      // перекрытие с лестничным проёмом в задней левой части
      const slabY = y0 + FH;
      const hole = f < floors - 1 ? [-W / 2 + T, -W / 2 + T + 2.4, -D / 2 + T, -D / 2 + T + 2.4] : null;
      this.slab(L, this.mats.ceil, -W / 2, W / 2, -D / 2, D / 2, slabY, 0.25, hole);
      // пол
      this.lbox(L, this.mats.floor, 0, y0 + 0.05, 0, W - 2 * T, 0.1, D - 2 * T, f === 0 ? false : false);
      if (hole) {
        // лестница-пандус условно ступенями
        for (let s = 0; s < 6; s++) this.lbox(L, this.mats.wood, -W / 2 + T + 1.2, y0 + 0.25 + s * 0.48, -D / 2 + T + 2.4 + 1.6 - s * 0.45, 2.2, 0.12, 0.45, true);
      }
      // мебель
      this.furniture(L, y0, W, D, T, f);
    }
    const topY = floors * FH;
    const roofMat = [this.mats.roofA, this.mats.roofB, this.mats.roofC][Math.floor(rand() * 3)];
    if (floors === 1 || rand() < 0.5) {
      const rh = 2.2 + rand();
      this.gableRoof(L, roofMat, ext, W + 0.8, D + 0.8, topY + 0.25, rh);
      // печная труба
      const cx = (rand() < 0.5 ? -1 : 1) * W / 4;
      this.lbox(L, this.mats.brickRed, cx, topY + 0.25 + rh * 0.75, -0.6, 0.6, rh * 1.1, 0.6, true);
      this.lbox(L, this.mats.concrete, cx, topY + 0.25 + rh * 1.3, -0.6, 0.75, 0.1, 0.75, false);
    }
    else {
      // плоская крыша с парапетом
      this.lbox(L, this.mats.concrete, 0, topY + 0.55, D / 2, W, 0.6, 0.25, true);
      this.lbox(L, this.mats.concrete, 0, topY + 0.55, -D / 2, W, 0.6, 0.25, true);
      this.lbox(L, this.mats.concrete, W / 2, topY + 0.55, 0, 0.25, 0.6, D, true);
      this.lbox(L, this.mats.concrete, -W / 2, topY + 0.55, 0, 0.25, 0.6, D, true);
    }
    this.lining = null;
    // цоколь и крыльцо
    this.lbox(L, this.mats.concrete, -1.2, 0.12, D / 2 + 0.8, 2.6, 0.24, 1.6, true);
    this.houses.push(house);
  }

  // функция-перевод из локальных координат дома в мир
  local(x, z, rot) {
    return {
      x, z, rot,
      p(lx, lz) {
        switch (rot) {
          case 0: return [x + lx, z + lz];
          case 1: return [x + lz, z - lx];
          case 2: return [x - lx, z - lz];
          default: return [x - lz, z + lx];
        }
      },
      s(sx, sz) { return rot % 2 ? [sz, sx] : [sx, sz]; },
      n(nx, nz) {
        switch (rot) {
          case 0: return [nx, nz];
          case 1: return [nz, -nx];
          case 2: return [-nx, -nz];
          default: return [-nz, nx];
        }
      }
    };
  }

  lbox(L, mat, lx, y, lz, sx, sy, sz, collide) {
    const [wx, wz] = L.p(lx, lz), [ax, az] = L.s(sx, sz);
    this.box(mat, wx, y, wz, ax, sy, az, collide);
  }

  // стена вдоль локальной оси x на позиции lz, проёмы [u0,u1,v0,v1]
  wall(L, mat, axis, lz, y0, u0, u1, H, T, holes, house, floor, nrm) {
    const lin = house && this.lining && nrm;
    const seg = (cx, cy, sx, sy) => {
      this.lbox(L, mat, cx, cy, lz, sx, sy, T, true);
      if (lin) this.lbox(L, this.lining, cx, cy, lz - nrm[1] * (T / 2 + 0.012), sx, sy, 0.02, false);
    };
    holes = holes.slice().sort((a, b) => a[0] - b[0]);
    let u = u0;
    for (const h of holes) {
      if (h[0] > u) seg((u + h[0]) / 2, y0 + H / 2, h[0] - u, H);
      const w = h[1] - h[0];
      if (h[2] > 0.05) seg((h[0] + h[1]) / 2, y0 + h[2] / 2, w, h[2]);
      if (h[3] < H) seg((h[0] + h[1]) / 2, y0 + (h[3] + H) / 2, w, H - h[3]);
      if (house) this.opening(L, (h[0] + h[1]) / 2, y0, lz, h, T, house, floor, nrm, 'x');
      u = h[1];
    }
    if (u < u1) seg((u + u1) / 2, y0 + H / 2, u1 - u, H);
  }

  // стена вдоль локальной оси z на позиции lx
  wallZ(L, mat, lx, y0, u0, u1, H, T, holes, house, floor, nrm) {
    const lin = house && this.lining && nrm;
    const seg = (cz, cy, sz, sy) => {
      this.lbox(L, mat, lx, cy, cz, T, sy, sz, true);
      if (lin) this.lbox(L, this.lining, lx - nrm[0] * (T / 2 + 0.012), cy, cz, 0.02, sy, sz, false);
    };
    holes = holes.slice().sort((a, b) => a[0] - b[0]);
    let u = u0;
    for (const h of holes) {
      if (h[0] > u) seg((u + h[0]) / 2, y0 + H / 2, h[0] - u, H);
      const w = h[1] - h[0];
      if (h[2] > 0.05) seg((h[0] + h[1]) / 2, y0 + h[2] / 2, w, h[2]);
      if (h[3] < H) seg((h[0] + h[1]) / 2, y0 + (h[3] + H) / 2, w, H - h[3]);
      if (house) this.opening(L, lx, y0, (h[0] + h[1]) / 2, h, T, house, floor, nrm, 'z');
      u = h[1];
    }
    if (u < u1) seg((u + u1) / 2, y0 + H / 2, u1 - u, H);
  }

  // рамы проёма и запись для гонок
  opening(L, lu, y0, lv, h, T, house, floor, nrm, axis) {
    const w = h[1] - h[0], hh = h[3] - h[2], fr = 0.08;
    const isDoor = h[2] < 0.1;
    const cy = y0 + (h[2] + h[3]) / 2;
    if (axis === 'x') {
      this.lbox(L, this.mats.frame, lu - w / 2 + fr / 2, cy, lv, fr, hh, T + 0.04, false);
      this.lbox(L, this.mats.frame, lu + w / 2 - fr / 2, cy, lv, fr, hh, T + 0.04, false);
      this.lbox(L, this.mats.frame, lu, y0 + h[3] - fr / 2, lv, w, fr, T + 0.04, false);
      if (!isDoor) this.lbox(L, this.mats.frame, lu, y0 + h[2] + 0.03, lv + nrm[1] * 0.12, w + 0.1, 0.06, 0.3, false);
    } else {
      this.lbox(L, this.mats.frame, lu, cy, lv - w / 2 + fr / 2, T + 0.04, hh, fr, false);
      this.lbox(L, this.mats.frame, lu, cy, lv + w / 2 - fr / 2, T + 0.04, hh, fr, false);
      this.lbox(L, this.mats.frame, lu, y0 + h[3] - fr / 2, lv, T + 0.04, fr, w, false);
      if (!isDoor) this.lbox(L, this.mats.frame, lu + nrm[0] * 0.12, y0 + h[2] + 0.03, lv, 0.3, 0.06, w + 0.1, false);
    }
    const [wx, wz] = L.p(lu, lv);
    const [nx, nz] = L.n(nrm[0], nrm[1]);
    const rec = { x: wx, y: cy, z: wz, nx, nz, w, h: hh, floor, door: isDoor };
    if (isDoor) house.door = rec; else house.windows.push(rec);
  }

  // перекрытие с прямоугольной дырой
  slab(L, mat, x0, x1, z0, z1, y, t, hole) {
    if (!hole) { this.lbox(L, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, t, z1 - z0, true); return; }
    const [hx0, hx1, hz0, hz1] = hole;
    if (hz0 > z0) this.lbox(L, mat, (x0 + x1) / 2, y, (z0 + hz0) / 2, x1 - x0, t, hz0 - z0, true);
    if (hz1 < z1) this.lbox(L, mat, (x0 + x1) / 2, y, (hz1 + z1) / 2, x1 - x0, t, z1 - hz1, true);
    if (hx0 > x0) this.lbox(L, mat, (x0 + hx0) / 2, y, (hz0 + hz1) / 2, hx0 - x0, t, hz1 - hz0, true);
    if (hx1 < x1) this.lbox(L, mat, (hx1 + x1) / 2, y, (hz0 + hz1) / 2, x1 - hx1, t, hz1 - hz0, true);
  }

  gableRoof(L, mat, wallMat, W, D, y, H) {
    // скаты вдоль локальной x, конёк по x
    const geo = new THREE.BufferGeometry();
    const hw = W / 2, hd = D / 2;
    const pts = [
      // левый скат (−z)
      [-hw, 0, -hd], [hw, 0, -hd], [hw, H, 0], [-hw, 0, -hd], [hw, H, 0], [-hw, H, 0],
      // правый скат (+z)
      [-hw, 0, hd], [hw, H, 0], [hw, 0, hd], [-hw, 0, hd], [-hw, H, 0], [hw, H, 0],
    ];
    const gab = [
      [hw - 0.4, 0, -hd + 0.4], [hw - 0.4, 0, hd - 0.4], [hw - 0.4, H - 0.3, 0],
      [-hw + 0.4, 0, -hd + 0.4], [-hw + 0.4, H - 0.3, 0], [-hw + 0.4, 0, hd - 0.4],
    ];
    const mk = (list, scale) => {
      const g = new THREE.BufferGeometry();
      const pos = [];
      for (const q of list) {
        const [wx, wz] = L.p(q[0], q[2]);
        pos.push(wx, y + q[1], wz);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      worldUV(g, scale);
      return g;
    };
    const r = mk(pts, mat.uvs || 3);
    // двусторонняя: добавим обратные треугольники для вида изнутри чердака
    const back = r.clone();
    const bp = back.attributes.position.array;
    for (let i = 0; i < bp.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = bp[i + 3 + k]; bp[i + 3 + k] = bp[i + 6 + k]; bp[i + 6 + k] = t; }
    }
    back.computeVertexNormals(); worldUV(back, 3);
    this.addGeo(mat, r); this.addGeo(this.mats.wood, back);
    const g2 = mk(gab, wallMat.uvs || 3);
    this.addGeo(wallMat, g2);
    // ступенчатая коллизия крыши
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const f = (s + 0.5) / steps;
      const hz = hd * (1 - f);
      const [cx, cz] = L.p(0, 0), [sx, sz] = L.s(W, hz * 2);
      this.addBox(cx - sx / 2, y + H * s / steps, cz - sz / 2, cx + sx / 2, y + H * (s + 1) / steps * 0.95, cz + sz / 2);
    }
  }

  furniture(L, y0, W, D, T, f) {
    const m = this.mats;
    // стол
    this.lbox(L, m.wood, W / 4, y0 + 0.75, D / 4, 1.4, 0.06, 0.8, true);
    for (const a of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) this.lbox(L, m.wood, W / 4 + a[0], y0 + 0.37, D / 4 + a[1], 0.06, 0.72, 0.06, false);
    // шкаф у задней стены
    this.lbox(L, m.wood, W / 2 - T - 0.35, y0 + 1.0, -D / 2 + T + 1.4, 0.6, 2.0, 1.2, true);
    // диван / кровать
    const sx = -W / 2 + T + 1.15;
    this.lbox(L, f ? m.fabric2 : m.fabric, sx, y0 + 0.3, D / 2 - T - 0.6, 2.0, 0.5, 0.9, true);
    this.lbox(L, f ? m.fabric2 : m.fabric, sx, y0 + 0.75, D / 2 - T - 0.15, 2.0, 0.5, 0.2, true);
    // ящики в задней комнате
    if (rand() < 0.6) this.lbox(L, m.wood, W / 4, y0 + 0.35, -D / 4, 0.7, 0.7, 0.7, true);
  }

  shed(x, z) {
    const m = this.mats;
    this.box(m.wood, x, 1.2, z, 4, 2.4, 3, true);
    this.box(m.rust, x, 2.5, z, 4.4, 0.15, 3.4, true);
  }

  fenceLine(x0, z0, x1, z1, broken) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / 2.5);
    for (let i = 0; i < n; i++) {
      if (broken && rand() < 0.3) continue;
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const h = 1.3 + rand() * 0.2;
      this.box(this.mats.wood, x, h / 2, z, along ? 2.3 : 0.06, h, along ? 0.06 : 2.3, false);
    }
  }

  fields(x0, z0, x1, z1, bi) {
    // окраина: огороды, редкие дома, ежи и блокпосты
    const W = x1 - x0, D = z1 - z0;
    const dg = new THREE.PlaneGeometry(W * 0.5, D * 0.4);
    dg.rotateX(-Math.PI / 2);
    dg.translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    worldUV(dg, 6);
    this.addGeo(this.mats.dirt, dg);
    if (bi % 3 === 0) this.house(x0 + 15, z1 - 12, 0);
    if (bi % 4 === 1) this.house(x1 - 15, z0 + 12, 2);
    for (let i = 0; i < 14; i++) this.tree(x0 + rand() * W, z0 + rand() * D);
    for (let i = 0; i < 4; i++) this.hedgehog(x0 + rand() * W, z0 + rand() * D);
  }

  hedgehog(x, z) {
    const m = this.mats.rust;
    const g1 = new THREE.BoxGeometry(2.2, 0.2, 0.2);
    const parts = [];
    const a = g1.clone(); a.rotateZ(0.6); parts.push(a);
    const b = g1.clone(); b.rotateY(Math.PI / 2); b.rotateX(0.6); parts.push(b);
    const c = g1.clone(); c.rotateZ(Math.PI / 2); c.rotateY(0.7); parts.push(c);
    for (const p of parts) { p.rotateY(rand() * 3); p.translate(x, 0.75, z); worldUV(p, 2); this.addGeo(m, p); }
    this.addBox(x - 0.8, 0, z - 0.8, x + 0.8, 1.4, z + 0.8);
  }

  // промзона: цех с воротами насквозь, водонапорная башня, контейнеры
  industrial(x0, z0, x1, z1) {
    const m = this.mats;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const HW = 22, HD = 14, H = 12, T = 0.4;
    // бетонный пол
    this.box(m.concrete, cx, 0.05, cz, x1 - x0, 0.1, z1 - z0, false);
    // длинные стены с окнами под крышей
    const L = this.local(cx, cz, 0);
    const winRow = [];
    for (let u = -HW + 4; u < HW - 3; u += 6) winRow.push([u - 1.5, u + 1.5, 7.5, 10]);
    this.wall(L, m.brickRed, 'x', HD - T / 2, 0, -HW, HW, H, T, winRow, null, 0);
    this.wall(L, m.brickRed, 'x', -HD + T / 2, 0, -HW, HW, H, T, winRow, null, 0);
    // торцы с огромными воротами
    this.wallZ(L, m.brickRed, HW - T / 2, 0, -HD + T, HD - T, H, T, [[-4, 4, 0.02, 7]], null, 0);
    this.wallZ(L, m.brickRed, -HW + T / 2, 0, -HD + T, HD - T, H, T, [[-3, 3, 0.02, 6]], null, 0);
    // крыша из ферм с дырами (от прилётов)
    for (let u = -HW; u < HW; u += 4) {
      const holed = Math.abs(u - 6) < 3 || Math.abs(u + 14) < 2;
      if (holed) {
        this.box(m.metal, cx + u + 2, H + 0.1, cz - HD / 2 - 2, 4, 0.2, HD - 4, true);
        this.box(m.metal, cx + u + 2, H + 0.1, cz + HD / 2 + 2, 4, 0.2, HD - 4, true);
      } else this.box(m.metal, cx + u + 2, H + 0.1, cz, 4, 0.2, HD * 2, true);
      this.box(m.rust, cx + u, H - 0.5, cz, 0.3, 0.8, HD * 2 - 1, true);
    }
    // станки внутри
    for (let i = 0; i < 5; i++) this.box(m.metal, cx - 14 + i * 7, 0.9, cz + (i % 2 ? 6 : -6), 3, 1.8, 2, true);
    // кран-балка
    this.box(m.rust, cx, 9, cz, HW * 2 - 2, 0.5, 0.6, true);
    // контейнеры снаружи
    const cmat = [m.rust, m.metal];
    for (let i = 0; i < 8; i++) {
      const px = x0 + 6 + (i % 4) * 7, pz = z1 - 8 - Math.floor(i / 4) * 3;
      if (px > x1 - 4) continue;
      this.box(cmat[i % 2], px, 1.3, pz, 6, 2.6, 2.4, true);
      if (i % 3 === 0) this.box(cmat[(i + 1) % 2], px, 3.9, pz, 6, 2.6, 2.4, true);
    }
    // водонапорная башня
    const tx = x1 - 10, tz = z0 + 10;
    for (const a of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) this.box(m.rust, tx + a[0], 9, tz + a[1], 0.4, 18, 0.4, true);
    this.box(m.rust, tx, 20, tz, 6, 4, 6, true);
    this.box(m.metal, tx, 22.3, tz, 6.6, 0.6, 6.6, true);
  }

  // пятиэтажки
  highrises(x0, z0, x1, z1) {
    const m = this.mats;
    const W = 40, D = 12, FH = 3, floors = 5, T = 0.3;
    for (const [cz, rot] of [[z0 + 14, 2], [z1 - 14, 0]]) {
      const cx = (x0 + x1) / 2;
      const L = this.local(cx, cz, rot);
      const house = { x: cx, z: cz, rot, W, D, floors, windows: [], door: null };
      this.lining = m.wallIn3;
      for (let f = 0; f < floors; f++) {
        const y0 = f * FH;
        const holes = [];
        for (let u = -W / 2 + 3; u < W / 2 - 2; u += 4) {
          if (f === 0 && Math.abs(u - 1) < 1.5) holes.push([u - 0.8, u + 0.8, 0.02, 2.3]);
          else holes.push([u - 0.75, u + 0.75, 0.9, 2.3]);
        }
        this.wall(L, m.plasterB, 'x', D / 2 - T / 2, y0, -W / 2, W / 2, FH, T, holes, house, f, [0, 1]);
        this.wall(L, m.plasterB, 'x', -D / 2 + T / 2, y0, -W / 2, W / 2, FH, T, holes.filter((_, i) => i % 2 === 0).map(h => [h[0], h[1], 0.9, 2.3]), house, f, [0, -1]);
        this.wallZ(L, m.plasterB, W / 2 - T / 2, y0, -D / 2 + T, D / 2 - T, FH, T, [], null, f);
        this.wallZ(L, m.plasterB, -W / 2 + T / 2, y0, -D / 2 + T, D / 2 - T, FH, T, [[-1, 1, 0.9, 2.3]], house, f, [-1, 0]);
        // коридор: продольная перегородка с проёмами
        const doors = []; for (let u = -W / 2 + 5; u < W / 2 - 4; u += 8) doors.push([u - 0.8, u + 0.8, 0.02, 2.2]);
        this.wall(L, m.wallIn2, 'x', 0, y0, -W / 2 + T, W / 2 - T, FH, 0.15, doors, null, f);
        // поперечные стены квартир
        for (let u = -W / 2 + 10; u < W / 2 - 5; u += 10) this.wallZ(L, m.wallIn1, u, y0, 0.1, D / 2 - T, FH, 0.15, [], null, f);
        const hole = f < floors - 1 ? [W / 2 - 4.5, W / 2 - T, -D / 2 + T, -0.1] : null;
        this.slab(L, m.ceil, -W / 2, W / 2, -D / 2, D / 2, y0 + FH, 0.25, hole);
        this.lbox(L, m.floor, 0, y0 + 0.04, 0, W - 0.6, 0.08, D - 0.6, false);
        // балконы
        if (f > 0) for (let u = -W / 2 + 7; u < W / 2 - 2; u += 8) {
          this.lbox(L, m.concrete, u, y0 + 0.1, D / 2 + 0.6, 2.4, 0.15, 1.2, true);
          this.lbox(L, m.concrete, u, y0 + 0.6, D / 2 + 1.15, 2.4, 0.9, 0.1, true);
        }
        this.furniture(L, y0, W / 3, D, T, f);
      }
      this.lining = null;
      this.lbox(L, m.concrete, 0, floors * FH + 0.5, D / 2, W, 0.8, 0.3, true);
      this.lbox(L, m.concrete, 0, floors * FH + 0.5, -D / 2, W, 0.8, 0.3, true);
      this.lbox(L, m.metal, 8, floors * FH + 1.3, 0, 3, 2.4, 3, true);
      this.houses.push(house);
    }
    for (let i = 0; i < 8; i++) this.tree(x0 + 5 + rand() * (x1 - x0 - 10), (z0 + z1) / 2 + (rand() - 0.5) * 20);
  }

  garages(x0, z0, x1, z1) {
    const m = this.mats;
    for (let r = 0; r < 2; r++) {
      const z = (z0 + z1) / 2 + (r ? 8 : -8);
      for (let x = x0 + 6; x < x1 - 6; x += 4.2) {
        const open = rand() < 0.3;
        const L = this.local(x, z, r ? 0 : 2);
        this.lbox(L, m.brickWhite, -2, 1.3, 0, 0.2, 2.6, 6, true);
        this.lbox(L, m.brickWhite, 0, 1.3, -3, 4, 2.6, 0.2, true);
        this.lbox(L, m.concrete, 0, 2.7, 0, 4.4, 0.2, 6.4, true);
        if (!open) this.lbox(L, m.rust, 0, 1.2, 2.95, 3.6, 2.4, 0.1, true);
        else this.lbox(L, m.rust, 0, 2.2, 2.95, 3.6, 0.6, 0.1, true);
      }
    }
    for (let i = 0; i < 12; i++) this.tree(x0 + rand() * (x1 - x0), z0 + rand() * 10);
  }

  // ---- деревья (инстансы) -------------------------------------------
  tree(x, z) {
    if (!this.treeList) this.treeList = [];
    for (const r of ROADS) if (Math.abs(x - r) < 8 || Math.abs(z - r) < 8) return;
    this.treeList.push([x, z, 0.8 + rand() * 0.7, rand() < 0.3 ? 1 : 0, rand() * 6.28]);
  }

  buildForest() {
    const list = this.treeList || [];
    // кольцо леса вокруг посёлка
    for (let i = 0; i < (this.quality > 0 ? 900 : 500); i++) {
      const a = rand() * Math.PI * 2, r = 285 + rand() * 260;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (ROADS.some(q => Math.abs(x - q) < 9 || Math.abs(z - q) < 9)) continue;
      list.push([x, z, 0.9 + rand() * 0.9, rand() < 0.65 ? 1 : 0, rand() * 6.28]);
    }
    const leaves = TX.treeLeaves(), bark = TX.bark();
    const trunkG = new THREE.CylinderGeometry(0.18, 0.3, 4, 6); trunkG.translate(0, 2, 0);
    const crownG = new THREE.IcosahedronGeometry(2.6, 1);
    jitter(crownG, 0.5); crownG.scale(1, 1.15, 1); crownG.translate(0, 5.3, 0);
    const pineG = new THREE.ConeGeometry(2.4, 7, 7, 3); jitter(pineG, 0.25); pineG.translate(0, 6, 0);
    const pine2 = new THREE.ConeGeometry(1.8, 4, 7, 2); jitter(pine2, 0.2); pine2.translate(0, 9.2, 0);
    const pineFull = mergeGeometries([pineG.toNonIndexed(), pine2.toNonIndexed()]);
    const trunkM = new THREE.MeshStandardMaterial({ map: bark, roughness: 1 });
    const crownM = new THREE.MeshStandardMaterial({ map: leaves, color: 0xffffff, roughness: 1, flatShading: true });
    const pineM = new THREE.MeshStandardMaterial({ map: leaves, color: 0xa8c0a0, roughness: 1, flatShading: true });
    const dec = list.filter(t => t[3] === 0), con = list.filter(t => t[3] === 1);
    const mk = (geo, mat, arr, yOff) => {
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const col = new THREE.Color();
      arr.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t[4]);
        s.set(t[2], t[2], t[2]);
        p.set(t[0], this.heightAt(t[0], t[1]) + yOff, t[1]);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
        col.setHSL(0.2 + (t[4] % 1) * 0.08, 0.35, 0.62 + (t[4] % 0.5) * 0.3);
        im.setColorAt(i, col);
      });
      im.castShadow = true; im.receiveShadow = true;
      this.scene.add(im);
    };
    mk(trunkG, trunkM, list, 0);
    mk(crownG, crownM, dec, 0);
    mk(pineFull, pineM, con, 0);
    for (const t of list) {
      const y = this.heightAt(t[0], t[1]);
      const s = t[2];
      this.addBox(t[0] - 0.3 * s, y, t[1] - 0.3 * s, t[0] + 0.3 * s, y + 4 * s, t[1] + 0.3 * s);
      // крона: мягкая коллизия поменьше видимой
      const cr = t[3] ? 1.2 * s : 1.6 * s;
      this.addBox(t[0] - cr, y + (t[3] ? 4 : 4.2) * s, t[1] - cr, t[0] + cr, y + (t[3] ? 9.5 : 6.8) * s, t[1] + cr);
    }
  }

  // ---- столбы и провода --------------------------------------------
  buildWires() {
    const m = this.mats.wood;
    const poleH = 8;
    const pos = [];
    for (const r of [-60, 60]) {
      const x = r + 7.5;
      let prevZ = null;
      for (let z = -255; z <= 255; z += 30) {
        this.box(m, x, poleH / 2, z, 0.3, poleH, 0.3, true);
        this.box(m, x, poleH - 0.4, z, 1.6, 0.12, 0.12, false);
        if (prevZ !== null) {
          for (const off of [-0.7, 0.7]) {
            const seg = 6;
            let px = 0, py = 0, pz = 0;
            for (let s = 0; s <= seg; s++) {
              const t = s / seg;
              const wx = x + off, wz = prevZ + (z - prevZ) * t;
              const wy = poleH - 0.35 - Math.sin(t * Math.PI) * 1.1;
              if (s > 0) {
                pos.push(px, py, pz, wx, wy, wz);
                this.wires.push([px, py, pz, wx, wy, wz, wx, Math.abs(wz - pz) / 2 + 1.5, (pz + wz) / 2]);
              }
              px = wx; py = wy; pz = wz;
            }
          }
        }
        prevZ = z;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x111111 })));
  }

  // трава пучками вокруг камеры (сетка мира, чтобы пучки не прыгали)
  buildGrass() {
    const S = 64, c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const bx = 4 + Math.random() * (S - 8), h = S * (0.45 + Math.random() * 0.55);
      x.strokeStyle = `hsl(${62 + Math.random() * 22},${28 + Math.random() * 16}%,${18 + Math.random() * 14}%)`;
      x.lineWidth = 1.5 + Math.random() * 1.5;
      x.beginPath(); x.moveTo(bx, S); x.quadraticCurveTo(bx + (Math.random() - 0.5) * 8, S - h * 0.6, bx + (Math.random() - 0.5) * 16, S - h); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const parts = [];
    for (let k = 0; k < 2; k++) { const p = new THREE.PlaneGeometry(0.9, 0.55); p.translate(0, 0.27, 0); p.rotateY(k * Math.PI / 2); parts.push(p); }
    const g = mergeGeometries(parts);
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
    this.grassCell = 1.7;
    this.grassR = this.quality > 0 ? 34 : 26;
    const side = Math.ceil(this.grassR * 2 / this.grassCell);
    this.grass = new THREE.InstancedMesh(g, mat, side * side);
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    this.grass.count = 0;
    this.scene.add(this.grass);
    this.grassAt = null;
  }

  updateGrass(p) {
    if (!this.grass) return;
    const C = this.grassCell;
    const cx = Math.round(p.x / 8), cz = Math.round(p.z / 8);
    if (p.y > 60) { this.grass.visible = false; return; }
    this.grass.visible = true;
    if (this.grassAt && this.grassAt[0] === cx && this.grassAt[1] === cz) return;
    this.grassAt = [cx, cz];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const R = this.grassR, x0 = Math.floor((p.x - R) / C), z0 = Math.floor((p.z - R) / C), N = Math.ceil(R * 2 / C);
    let n = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const gi = x0 + i, gj = z0 + j;
      const h = hash(gi, gj);
      if (h > 0.8) continue;
      const wx = (gi + hash(gj, gi)) * C, wz = (gj + hash(gi + 7, gj + 3)) * C;
      const dx = wx - p.x, dz = wz - p.z;
      if (dx * dx + dz * dz > R * R) continue;
      if (ROADS.some(r => Math.abs(wx - r) < 5.6 || Math.abs(wz - r) < 5.6)) continue;
      if (Math.abs(wx) < 51 && Math.abs(wz) < 51) continue; // бетон промзоны
      v.set(wx, this.heightAt(wx, wz), wz);
      if (v.y < 0.5) { this.tmpP = this.tmpP || new THREE.Vector3(); this.tmpP.set(wx, 0.3, wz); if (this.pointHit(this.tmpP)) continue; }
      q.setFromAxisAngle(Y, h * 20);
      const sc = 0.7 + hash(gj + 11, gi) * 0.8;
      s.set(sc, sc * (0.8 + h * 0.6), sc);
      m4.compose(v, q, s);
      this.grass.setMatrixAt(n++, m4);
    }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
  }

  // следы войны: сгоревшие машины, воронки, блокпосты, мешки
  buildWarProps() {
    const m = this.mats;
    const burnt = new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 1, metalness: 0.2 });
    burnt.uvs = 2;
    const rustB = m.rust;
    for (let i = 0; i < 14; i++) {
      const r = ROADS[Math.floor(rand() * ROADS.length)];
      const a = (rand() - 0.5) * 460;
      const alongZ = rand() < 0.5;
      const side = rand() < 0.5 ? -1 : 1;
      const x = alongZ ? r + side * 3.8 : a, z = alongZ ? a : r + side * 3.8;
      if (ROADS.some(q => Math.abs(a - q) < 14)) continue;
      const sx = alongZ ? 1.9 : 4.4, sz = alongZ ? 4.4 : 1.9;
      this.box(burnt, x, 0.65, z, sx, 0.7, sz, true);
      this.box(rustB, x + (alongZ ? 0 : 0.4), 1.25, z + (alongZ ? 0.4 : 0), sx * (alongZ ? 0.9 : 0.45), 0.5, sz * (alongZ ? 0.45 : 0.9), true);
    }
    // мешки с песком у перекрёстков
    const bag = new THREE.MeshStandardMaterial({ color: 0x7d7052, roughness: 1 });
    bag.uvs = 1;
    for (const [x, z] of [[-60, -60], [60, 60], [-180, 60], [180, -180], [60, -180]]) {
      const ox = x + 8, oz = z + 8;
      for (let k = 0; k < 3; k++) {
        this.box(bag, ox + k * 0.9, 0.25, oz, 0.85, 0.5, 0.5, true);
        this.box(bag, ox + k * 0.9 + 0.45, 0.72, oz, 0.85, 0.45, 0.5, true);
        this.box(bag, ox, 0.25, oz + 0.9 + k * 0.9, 0.5, 0.5, 0.85, true);
      }
      // бетонные блоки
      this.box(m.concrete, x - 8, 0.6, z + 8, 1.2, 1.2, 1.2, true);
      this.box(m.concrete, x + 8, 0.6, z - 8, 1.2, 1.2, 1.2, true);
    }
    // старые воронки на полях и обочинах
    const ct = TX.craterTex();
    const cm = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const geos = [];
    for (let i = 0; i < 70; i++) {
      const x = (rand() - 0.5) * 520, z = (rand() - 0.5) * 520;
      const s = 2 + rand() * 4;
      const g = new THREE.PlaneGeometry(s, s); g.rotateX(-Math.PI / 2); g.rotateY(rand() * 6); g.translate(x, 0.05 + i * 0.0003, z);
      geos.push(g);
    }
    const cmesh = new THREE.Mesh(mergeGeometries(geos), cm);
    cmesh.renderOrder = 1;
    this.scene.add(cmesh);
  }

  // случайная точка на дороге
  roadPoint() {
    const r = ROADS[Math.floor(Math.random() * ROADS.length)];
    const a = (Math.random() - 0.5) * 400;
    return Math.random() < 0.5 ? new THREE.Vector3(r, 0, a) : new THREE.Vector3(a, 0, r);
  }
}

function hash(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function segBox(ax, ay, az, dx, dy, dz, b) {
  let t0 = 0, t1 = 1;
  const o = [ax, ay, az], d = [dx, dy, dz], mn = [b.minx, b.miny, b.minz], mx = [b.maxx, b.maxy, b.maxz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) { if (o[i] < mn[i] || o[i] > mx[i]) return false; continue; }
    let ta = (mn[i] - o[i]) / d[i], tb = (mx[i] - o[i]) / d[i];
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

// UV из мировых координат по нормали грани
function worldUV(g, scale) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else if (ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function setUV(g, arr) { g.setAttribute('uv', new THREE.Float32BufferAttribute(arr, 2)); }

function jitter(g, a) {
  const p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 100) + ',' + Math.round(p.getY(i) * 100) + ',' + Math.round(p.getZ(i) * 100);
    let o = map.get(k);
    if (!o) { o = [(Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a]; map.set(k, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.computeVertexNormals();
}
