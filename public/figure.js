// The human figure on the Body tab.
//
// Mesh, shape targets and skeleton come from the MakeHuman / MPFB2 project (CC0), packed by
// scripts/build-body.py. Rendering is three.js. This file does two jobs:
//   1. shapeFor(): morph the mesh until its tape measurements match the person's.
//   2. Figure: a skinned, lit three.js mesh that can change shape smoothly.

import * as THREE from '/vendor/three.module.js';
export { THREE };

const loading = {};
export function loadBody(sex) {
  const s = sex === 'female' ? 'female' : 'male';
  loading[s] ||= Promise.all([
    fetch(`/body/${s}.json`).then((r) => r.json()),
    // The numbers are stored gzipped; the browser unpacks them as they arrive.
    fetch(`/body/${s}.bin.gz`).then((r) => new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()),
  ]).then(([meta, bin]) => {
    const types = { float32: Float32Array, uint16: Uint16Array, int8: Int8Array, uint8: Uint8Array };
    const get = (name) => { const l = meta.layout[name]; return new types[l.type](bin, l.offset, l.length); };
    const N = meta.vertices;
    const skinIndex = get('skinIndex'), skinWeight = get('skinWeight'), index = get('index');
    const dominant = new Uint8Array(N);
    for (let v = 0; v < N; v++) { let best = 0; for (let k = 1; k < 4; k++) if (skinWeight[v * 4 + k] > skinWeight[v * 4 + best]) best = k; dominant[v] = skinIndex[v * 4 + best]; }
    const bone = Object.fromEntries(meta.bones.map((b, i) => [b.name, i]));
    // Triangles grouped by the body part they mostly belong to, for taking measurements.
    const region = (names) => { const set = new Set(names.map((n) => bone[n])); const out = []; for (let t = 0; t < index.length; t += 3) if (set.has(dominant[index[t]]) && set.has(dominant[index[t + 1]]) && set.has(dominant[index[t + 2]])) out.push(t); return out; };
    const target = (name) => ({ i: get(`t:${name}:i`), d: get(`t:${name}:d`), k: meta.layout[`t:${name}:d`].scale });
    const torso = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'];
    return {
      meta, N, index, skinIndex, skinWeight, dominant, bone, base: get('position'), target, female: s === 'female',
      regions: {
        torso: region(torso), lower: region(['pelvis', 'spine_01', 'thigh_l', 'thigh_r']), yoke: region([...torso, 'upperarm_l', 'upperarm_r']),
        neck: region(['neck_01', 'head']), thigh: region(['thigh_l']), calf: region(['calf_l']), bicep: region(['upperarm_l']), forearm: region(['lowerarm_l']),
      },
    };
  });
  return loading[s];
}

/* ---------- measuring: a tape is the convex outline of a slice through the body ---------- */

function hullLength(points) {
  if (points.length < 3) return 0;
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => { const h = []; for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  const hull = [...half(points), ...half([...points].reverse())];
  let sum = 0;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; sum += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return sum;
}

// Length of a tape around the part of the mesh in `tris`, on the plane through `p` with normal `n`.
function tape(data, pos, tris, p, n) {
  const u = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  const al = Math.hypot(...a); a[0] /= al; a[1] /= al; a[2] /= al;
  const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const points = [], idx = data.index;
  const side = (v) => (pos[v * 3] - p[0]) * n[0] + (pos[v * 3 + 1] - p[1]) * n[1] + (pos[v * 3 + 2] - p[2]) * n[2];
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const v0 = idx[t + e], v1 = idx[t + ((e + 1) % 3)], s0 = side(v0), s1 = side(v1);
      if (s0 * s1 >= 0) continue;
      const f = s0 / (s0 - s1);
      const x = pos[v0 * 3] + (pos[v1 * 3] - pos[v0 * 3]) * f - p[0], y = pos[v0 * 3 + 1] + (pos[v1 * 3 + 1] - pos[v0 * 3 + 1]) * f - p[1], z = pos[v0 * 3 + 2] + (pos[v1 * 3 + 2] - pos[v0 * 3 + 2]) * f - p[2];
      points.push([x * a[0] + y * a[1] + z * a[2], x * b[0] + y * b[1] + z * b[2]]);
    }
  }
  return hullLength(points);
}

const mean = (pos, list) => { const o = [0, 0, 0]; for (const v of list) { o[0] += pos[v * 3]; o[1] += pos[v * 3 + 1]; o[2] += pos[v * 3 + 2]; } return o.map((x) => x / list.length); };
export const jointsOf = (data, pos) => data.meta.bones.map((b) => ({ head: mean(pos, b.head), tail: mean(pos, b.tail) }));

// Where on the body each measurement is taken, relative to the joints so it follows the shape.
function sites(data, pos) {
  const j = jointsOf(data, pos), B = data.bone;
  const along = (name, t) => { const { head, tail } = j[B[name]]; const d = [tail[0] - head[0], tail[1] - head[1], tail[2] - head[2]]; const l = Math.hypot(...d); return [[head[0] + d[0] * t, head[1] + d[1] * t, head[2] + d[2] * t], d.map((x) => x / l)]; };
  const hip = j[B.pelvis].head[1], top = j[B.neck_01].head[1], L = top - hip;
  const level = (f) => [[0, hip + L * f, 0], [0, 1, 0]];
  return {
    hips: ['lower', ...level(-0.03)], belly: ['torso', ...level(0.2)], waist: ['torso', ...level(0.34)], chest: ['torso', ...level(0.66)],
    // Around both shoulders, just below the joint, where a tape crosses the deltoids.
    shoulders: ['yoke', [0, j[B.upperarm_l].head[1] - L * 0.05, 0], [0, 1, 0]],
    neck: ['neck', ...along('neck_01', 0.5)], thigh: ['thigh', ...along('thigh_l', 0.22)], calf: ['calf', ...along('calf_l', 0.3)],
    bicep: ['bicep', ...along('upperarm_l', 0.45)], forearm: ['forearm', ...along('lowerarm_l', 0.22)],
  };
}

/* ---------- shaping ---------- */

function add(data, pos, name, w) {
  if (!w) return;
  const { i, d, k } = data.target(name), f = k * w;
  for (let n = 0; n < i.length; n++) { const v = i[n] * 3; pos[v] += d[n * 3] * f; pos[v + 1] += d[n * 3 + 1] * f; pos[v + 2] += d[n * 3 + 2] * f; }
}

export const SOLVED = ['hips', 'waist', 'belly', 'chest', 'shoulders', 'thigh', 'calf', 'bicep', 'forearm', 'neck'];

// Morph the mesh for a person. `measurements` holds only sites actually measured (cm); the rest follow weight.
export function shapeFor(data, { height_cm, weight_kg, measurements = {}, muscle = 0 }) {
  const pos = new Float32Array(data.base);
  const bmi = weight_kg && height_cm ? weight_kg / (height_cm / 100) ** 2 : 23;
  const heavy = bmi >= 22 ? Math.min((bmi - 22) / 11, 1.25) : Math.max((bmi - 22) / 4.5, -1);
  add(data, pos, heavy >= 0 ? 'heavy' : 'light', Math.abs(heavy));
  add(data, pos, muscle >= 0 ? 'muscular' : 'soft', Math.abs(muscle));

  let lo = Infinity, hi = -Infinity;
  for (const v of data.index) { const y = pos[v * 3 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
  const cm = (height_cm || 170) / (hi - lo); // centimetres per mesh unit
  // Each measured site has a target that grows or shrinks it. Swap a site's amount by removing exactly what was added.
  const weights = {};
  const setSite = (site, w) => {
    const old = weights[site] || 0;
    if (old) add(data, pos, `${site}-${old >= 0 ? 'incr' : 'decr'}`, -Math.abs(old));
    if (w) add(data, pos, `${site}-${w >= 0 ? 'incr' : 'decr'}`, Math.abs(w));
    weights[site] = w;
  };
  const read = (site) => { const [region, p, n] = sites(data, pos)[site]; return tape(data, pos, data.regions[region], p, n) * cm; };
  // The mesh stands with its arms out, so a slice across the shoulders is longer than a tape on someone standing
  // arms-down. Scale the wanted shoulder length by the same ratio seen on the average figure.
  if (!data.yoke) {
    const base = data.base; let b0 = Infinity, b1 = -Infinity;
    for (const v of data.index) { const y = base[v * 3 + 1]; if (y < b0) b0 = y; if (y > b1) b1 = y; }
    const [region, p, n] = sites(data, base).shoulders;
    data.yoke = tape(data, base, data.regions[region], p, n) / ((data.female ? 0.6 : 0.65) * (b1 - b0));
  }
  const wanted = { ...measurements };
  if (wanted.shoulders) wanted.shoulders *= data.yoke;
  const order = SOLVED.filter((x) => measurements[x]);
  for (let pass = 0; pass < 4; pass++) {
    for (const site of order) {
      const want = wanted[site], now = read(site), w0 = weights[site] || 0;
      if (Math.abs(want - now) < 0.15) continue;
      // Nudge the target to learn how much it moves the tape, then step to the wanted length.
      const probe = w0 + (want > now ? 0.4 : -0.4);
      setSite(site, probe);
      const slope = (read(site) - now) / (probe - w0);
      setSite(site, Math.abs(slope) > 0.05 ? Math.max(-2, Math.min(2.2, w0 + (want - now) / slope)) : w0);
    }
  }
  return { pos, cm, lo, hi, weights, fit: Object.fromEntries(order.map((x) => [x, Math.round((read(x) / (x === 'shoulders' ? data.yoke : 1)) * 10) / 10])) };
}

/* ---------- where the drawing puts its lines ---------- */

// For each vertex, how much the surface folds inward there (positive) or bulges out (negative), relative
// to the spacing of the mesh. Valleys between muscles, under the chest and around the joints come out
// positive. Smoothed so the lines are soft strokes rather than following individual triangles, then
// scaled so 1 marks the deepest few percent of the body.
function creases(data, pos, normals) {
  const N = data.N, idx = data.index;
  if (!data.neighbours) {
    const sets = Array.from({ length: N }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + ((e + 1) % 3)]; sets[a].add(b); sets[b].add(a); }
    data.neighbours = sets.map((x) => Uint16Array.from(x));
  }
  const nb = data.neighbours;
  let k = new Float32Array(N);
  for (let v = 0; v < N; v++) {
    const list = nb[v];
    if (!list.length) continue;
    let sum = 0, len = 0;
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    for (const u of list) {
      const dx = pos[u * 3] - pos[v * 3], dy = pos[u * 3 + 1] - pos[v * 3 + 1], dz = pos[u * 3 + 2] - pos[v * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (!d2) continue;
      sum += (dx * nx + dy * ny + dz * nz) / d2; len += Math.sqrt(d2);
    }
    k[v] = (sum / list.length) * (len / list.length); // dimensionless: independent of mesh density
  }
  for (let pass = 0; pass < 1; pass++) {
    const next = new Float32Array(N);
    for (let v = 0; v < N; v++) { let s = k[v] * 2; for (const u of nb[v]) s += k[u]; next[v] = s / (nb[v].length + 2); }
    k = next;
  }
  const drawn = [...new Set(idx)].map((v) => k[v]).filter((x) => x > 0).sort((a, b) => a - b);
  const scale = drawn[Math.floor(drawn.length * 0.9)] || 1;
  const head = data.bone.head;
  for (let v = 0; v < N; v++) k[v] = (k[v] / scale) * (data.dominant[v] === head ? 0.55 : 1); // a lighter hand on the face
  return k;
}

// Drawn anatomy, like an illustrator's body-fat chart. Each line is placed relative to the skeleton so it
// follows the person's shape, and has a "tier": how lean the body must be before it shows (0 shows first).
// Torso lines are [x, y] as fractions of shoulder width and hip-to-neck length. Limb lines are [t, angle]:
// t runs 0 to 1 down the bone, angle is degrees around it, 0 at the front and 90 on the outer side.
const TORSO_FRONT = [
  { tier: 0.12, pts: [[0.04, 0.64], [0.2, 0.6], [0.4, 0.61], [0.58, 0.68], [0.72, 0.78]], mirror: true }, // lower edge of the chest
  { tier: 0.25, pts: [[0.08, 0.86], [0.3, 0.88], [0.52, 0.87]], mirror: true }, // collarbone
  { tier: 0.42, pts: [[0, 0.24], [0, 0.6]] }, // centre line of the abs
  { tier: 0.5, pts: [[0.24, 0.22], [0.29, 0.38], [0.27, 0.58]], mirror: true }, // outer edge of the abs
  { tier: 0.55, pts: [[0.44, 0.2], [0.27, 0.06], [0.12, -0.05]], mirror: true }, // V-line over the hips
  { tier: 0.6, pts: [[0, 0.5], [0.23, 0.485]], mirror: true },
  { tier: 0.66, pts: [[0, 0.41], [0.25, 0.4]], mirror: true },
  { tier: 0.76, pts: [[0, 0.32], [0.24, 0.315]], mirror: true },
  { tier: 0.82, pts: [[0.5, 0.47], [0.58, 0.51]], mirror: true }, { tier: 0.82, pts: [[0.51, 0.53], [0.6, 0.57]], mirror: true }, // serratus
];
const TORSO_BACK = [
  { tier: 0.28, pts: [[0, 0.08], [0, 0.9]] }, // spine
  { tier: 0.38, pts: [[0.17, 0.78], [0.18, 0.64], [0.32, 0.57], [0.46, 0.66]], mirror: true }, // shoulder blade
  { tier: 0.55, pts: [[0.5, 0.56], [0.36, 0.38], [0.22, 0.24]], mirror: true }, // lats
  { tier: 0.62, pts: [[0.1, 0.18], [0.22, 0.1]], mirror: true }, // lower back
];
const LIMBS = {
  upperarm: [{ tier: 0.3, pts: [[0.16, 0], [0.32, 45], [0.48, 90], [0.32, 135], [0.18, 180]] }, { tier: 0.48, pts: [[0.5, 92], [0.86, 96]] }],
  lowerarm: [{ tier: 0.5, pts: [[0.05, 45], [0.4, 70]] }],
  thigh: [{ tier: 0.36, pts: [[0.6, -50], [0.82, -42], [0.92, -12]] }, { tier: 0.2, pts: [[0.93, -38], [0.95, 0], [0.93, 38]] }, { tier: 0.44, pts: [[0.16, 30], [0.5, 36], [0.82, 30]] }],
  calf: [{ tier: 0.4, pts: [[0.1, 180], [0.4, 178]] }],
};

// Distance to a polyline, signed by which side of it the point is on, and how far along the line the
// nearest point is (0 to 1). The stroke tapers out near both ends, which also hides the sign flip there.
function polyDist(px, py, pts) {
  let best = Infinity, sign = 1, at = 0, run = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) lens.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const raw = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0, t = Math.max(0, Math.min(1, raw));
    const d = Math.hypot(px - ax - dx * t, py - ay - dy * t);
    if (d < best) { best = d; sign = Math.sign(dx * (py - ay) - dy * (px - ax)) || 1; at = (run + t * lens[i - 1]) / total; }
    run += lens[i - 1];
  }
  return [best, sign, at];
}

// For each vertex: how far it is from the nearest anatomy line (in pen widths) and that line's tier.
function anatomy(data, pos, normals) {
  const N = data.N, B = data.bone, j = jointsOf(data, pos);
  const hip = j[B.pelvis].head[1], L = j[B.neck_01].head[1] - hip, sw = j[B.upperarm_l].head[0] - j[B.upperarm_r].head[0];
  const halfW = Math.abs(sw) / 2, pen = L; // distances are stored as fractions of hip-to-neck length
  const dist = new Float32Array(N).fill(9), signed = new Float32Array(N).fill(9), tier = new Float32Array(N), ends = new Float32Array(N);
  const keep = (v, d, sg, t, at) => { if (d < dist[v]) { dist[v] = d; signed[v] = d * sg; tier[v] = t; ends[v] = Math.min(at, 1 - at); } };
  const torso = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'].map((n) => B[n]));
  const torsoLine = (v, lines) => {
    // Work in mesh units on both axes, so a distance means the same thing in every direction.
    const x = Math.abs(pos[v * 3]), y = pos[v * 3 + 1] - hip, sx = pos[v * 3];
    for (const line of lines) {
      const pts = line.pts.map(([fx, fy]) => [fx * halfW, fy * L]);
      const [d, sg, at] = polyDist(line.mirror ? x : sx, y, pts);
      keep(v, d / L, sg * (line.mirror && sx < 0 ? -1 : 1), line.tier, at);
    }
  };
  const limbs = {};
  for (const [name, lines] of Object.entries(LIMBS)) for (const side of ['l', 'r']) {
    const b = B[`${name}_${side}`];
    if (b === undefined) continue;
    const h = j[b].head, t = j[b].tail, ax = [t[0] - h[0], t[1] - h[1], t[2] - h[2]], len = Math.hypot(...ax);
    for (let k = 0; k < 3; k++) ax[k] /= len;
    const sign = Math.sign(h[0]) || 1;
    // Outer side: up-and-out for arms (they hang out from the body), straight out for legs.
    const ref = name.includes('arm') ? [sign, 1, 0] : [sign, 0, 0];
    const flatten = (v) => { const d = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2]; const o = [v[0] - ax[0] * d, v[1] - ax[1] * d, v[2] - ax[2] * d]; const n = Math.hypot(...o); return o.map((x) => x / n); };
    limbs[b] = { h, ax, len, lines, fwd: flatten([0, 0, 1]), side: flatten(ref) };
  }
  for (let v = 0; v < N; v++) {
    const d = data.dominant[v], nz = normals[v * 3 + 2];
    if (torso.has(d)) { if (nz > 0.25) torsoLine(v, TORSO_FRONT); else if (nz < -0.25) torsoLine(v, TORSO_BACK); continue; }
    const limb = limbs[d];
    if (!limb) continue;
    const { h, ax, len, fwd, side } = limb;
    const r = [pos[v * 3] - h[0], pos[v * 3 + 1] - h[1], pos[v * 3 + 2] - h[2]];
    const along = r[0] * ax[0] + r[1] * ax[1] + r[2] * ax[2];
    const rad = [r[0] - ax[0] * along, r[1] - ax[1] * along, r[2] - ax[2] * along], radius = Math.hypot(...rad) || 1e-6;
    const ang = (Math.atan2((rad[0] * side[0] + rad[1] * side[1] + rad[2] * side[2]) / radius, (rad[0] * fwd[0] + rad[1] * fwd[1] + rad[2] * fwd[2]) / radius) * 180) / Math.PI;
    const deg = (Math.PI / 180) * radius;
    for (const line of limb.lines) {
      // Lay the line out flat around this vertex's angle, so the seam at 180 degrees is not a problem.
      const pts = line.pts.map(([t, a]) => { let da = a - ang; da -= 360 * Math.round(da / 360); return [t * len, (ang + da) * deg]; });
      const [dd, sg, at] = polyDist(along, ang * deg, pts);
      keep(v, dd / pen, sg, line.tier, at);
    }
  }
  return { dist, signed, tier, ends };
}

// How much anatomy shows at a body-fat percentage: 0 is soft all over, 1 is very lean.
export function definitionAt(sex, bodyFat) {
  if (bodyFat == null) return 0.15;
  const soft = sex === 'female' ? 34 : 25, lean = sex === 'female' ? 15 : 8;
  return Math.max(0, Math.min(1, (soft - bodyFat) / (soft - lean)));
}

/* ---------- the figure ---------- */

export class Figure {
  constructor(data, tone = '#d19c74') {
    this.data = data;
    const g = (this.geometry = new THREE.BufferGeometry());
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.base), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('cloth', new THREE.BufferAttribute(new Float32Array(data.N), 1));
    g.setAttribute('crease', new THREE.BufferAttribute(new Float32Array(data.N), 1));
    g.setAttribute('anat', new THREE.BufferAttribute(new Float32Array(data.N).fill(9), 1));
    g.setAttribute('anatSide', new THREE.BufferAttribute(new Float32Array(data.N).fill(9), 1));
    g.setAttribute('anatEnd', new THREE.BufferAttribute(new Float32Array(data.N), 1));
    g.setAttribute('tier', new THREE.BufferAttribute(new Float32Array(data.N), 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(data.skinIndex), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4, true));
    this.material = new THREE.MeshPhysicalMaterial({ color: tone, roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff2e6') });
    // Clothing is drawn per pixel from a smooth "how far inside the garment" value, so hems are clean
    // lines rather than following the mesh's polygons.
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float cloth;\nvarying float vCloth;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = cloth;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCloth;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat garment = smoothstep(-0.012, 0.012, vCloth);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.022, 0.021, 0.018), garment);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, garment);');
    };
    // The line-drawing style: flat fill, with ink wherever the surface turns away from the viewer. That draws
    // the outline and also the folds and curves inside it, so it reads like an anatomical illustration.
    this.lineColors = { fill: { value: new THREE.Color() }, ink: { value: new THREE.Color('#1b1a17') }, garment: { value: new THREE.Color('#55514b') }, light: { value: new THREE.Vector3(0, 1, 0) }, define: { value: 0.15 }, px: { value: Math.min(devicePixelRatio, 2.5) } };
    this.lineMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.lineMaterial.toneMapped = false;
    this.lineMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uDefine: this.lineColors.define, uFill: this.lineColors.fill, uInk: this.lineColors.ink, uGarment: this.lineColors.garment, uLight: this.lineColors.light, uPx: this.lineColors.px });
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float cloth;\nattribute float crease;\nattribute float anat;\nattribute float anatSide;\nattribute float anatEnd;\nattribute float tier;\nvarying float vCloth;\nvarying float vCrease;\nvarying float vAnat;\nvarying float vSide;\nvarying float vEnd;\nvarying float vTier;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = cloth;\nvCrease = crease;\nvAnat = anat;\nvSide = anatSide;\nvEnd = anatEnd;\nvTier = tier;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCloth;\nvarying float vCrease;\nvarying float vAnat;\nvarying float vSide;\nvarying float vEnd;\nvarying float vTier;\nuniform float uDefine;\nuniform vec3 uFill;\nuniform vec3 uInk;\nuniform vec3 uGarment;\nuniform vec3 uLight;\nuniform float uPx;')
        .replace('#include <opaque_fragment>', `
          // 1. Contour: wherever the surface turns edge-on, at a steady pen width.
          float facing = abs(dot(normal, normalize(vViewPosition)));
          float contour = 1.0 - smoothstep(1.2 * uPx, 2.2 * uPx, facing / max(fwidth(facing), 1e-4));
          contour = max(contour, 1.0 - smoothstep(0.1, 0.16, facing));
          // 2. Creases: the valleys between muscles and at folds, worked out on the mesh (see creases()).
          //    Stronger where the fold is deep, fading as it turns away so lines thin toward the silhouette.
          float crease = smoothstep(0.35, 0.95, vCrease) * smoothstep(0.15, 0.45, facing) * 0.85;
          // 3. Form: a soft tone on the side of each mass away from the light.
          float lit = dot(normal, normalize(uLight));
          float shade = 1.0 - smoothstep(-0.35, 0.05, lit);
          float skin = 1.0 - smoothstep(-0.01, 0.01, vCloth);
          float hem = 1.0 - smoothstep(0.0, 0.02, abs(vCloth));
          vec3 flatFill = mix(uGarment, uFill * (1.0 - 0.08 * shade), skin);
          // 4. Drawn anatomy: lines appear tier by tier as the body gets leaner, firming up as they arrive.
          float show = smoothstep(vTier - 0.02, vTier + 0.14, uDefine);
          //    The stroke is where the signed distance crosses zero, so it stays continuous between vertices.
          //    Away from any line (vAnat large) nothing is drawn, which also hides where two lines' regions meet.
          float stroke = 1.0 - smoothstep(0.3 * uPx, 0.85 * uPx, abs(vSide) / max(fwidth(vSide), 1e-6));
          float anatomy = stroke * smoothstep(0.0, 0.18, vEnd) * (1.0 - smoothstep(0.03, 0.05, vAnat)) * show * smoothstep(0.25, 0.5, facing) * 0.7;
          float inked = max(max(contour, hem * 0.85), max(crease, anatomy) * skin);
          outgoingLight = mix(flatFill, uInk, inked);
          #include <opaque_fragment>`);
    };
    this.setTone(tone);
    this.mesh = new THREE.SkinnedMesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.bones = data.meta.bones.map((b) => Object.assign(new THREE.Bone(), { name: b.name }));
    data.meta.bones.forEach((b, i) => (b.parent < 0 ? this.mesh : this.bones[b.parent]).add(this.bones[i]));
    this.skeleton = new THREE.Skeleton(this.bones);
    // A steady outer line for the drawing style: the same skin drawn slightly larger, back faces only.
    const hull = new THREE.MeshBasicMaterial({ color: '#1b1a17', side: THREE.BackSide });
    hull.onBeforeCompile = (shader) => { shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(objectNormal) * 0.035;'); };
    this.outline = new THREE.SkinnedMesh(g, hull);
    this.outline.frustumCulled = false; this.outline.visible = false;
    this.mesh.add(this.outline);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.rot = {}; this.pose = 'idle'; this.until = 0; this.morph = null; this.bound = false;
  }

  // Lay the skeleton out for a shape, then (re)attach the skin to it.
  rig(pos) {
    const joints = jointsOf(this.data, pos);
    this.bones.forEach((bone) => bone.rotation.set(0, 0, 0));
    this.data.meta.bones.forEach((b, i) => { const h = joints[i].head, p = b.parent < 0 ? [0, 0, 0] : joints[b.parent].head; this.bones[i].position.set(h[0] - p[0], h[1] - p[1], h[2] - p[2]); });
    this.group.updateMatrixWorld(true);
    // The skin is bound in world space, so the bind matrix and the bones' inverses must be taken at the same moment.
    if (this.bound) { this.mesh.bindMatrix.copy(this.mesh.matrixWorld); this.mesh.bindMatrixInverse.copy(this.mesh.matrixWorld).invert(); this.skeleton.calculateInverses(); }
    else { this.mesh.bind(this.skeleton); this.outline.bind(this.skeleton, this.mesh.bindMatrix); this.bound = true; return; }
    this.outline.bindMatrix.copy(this.mesh.bindMatrix); this.outline.bindMatrixInverse.copy(this.mesh.bindMatrixInverse);
  }

  // 'shaded' is the lit, solid figure; 'line' is the ink drawing.
  setStyle(style) { const line = style === 'line'; this.mesh.material = line ? this.lineMaterial : this.material; this.outline.visible = line; }

  // Work out, for every vertex, how far inside the shorts (and, for women, the top) it sits. Positive is inside.
  dress(pos) {
    const { data } = this, B = data.bone, c = this.geometry.attributes.cloth.array, j = jointsOf(data, pos), W = data.skinWeight, I = data.skinIndex;
    const hip = j[B.pelvis].head[1], knee = j[B.calf_l].head[1], top = j[B.neck_01].head[1], L = top - hip;
    const shortsTop = hip + L * 0.2, shortsBottom = hip - (hip - knee) * 0.42, armX = j[B.upperarm_l].head[0];
    const low = new Set([B.pelvis, B.spine_01, B.spine_02, B.thigh_l, B.thigh_r]), up = new Set([B.spine_01, B.spine_02, B.spine_03, B.clavicle_l, B.clavicle_r, B.neck_01]);
    const share = (v, set) => { let s = 0; for (let k = 0; k < 4; k++) if (set.has(I[v * 4 + k])) s += W[v * 4 + k]; return s / 255; };
    for (let v = 0; v < data.N; v++) {
      const x = Math.abs(pos[v * 3]), y = pos[v * 3 + 1];
      let inside = Math.min(y - shortsBottom, shortsTop - y, (share(v, low) - 0.5) * 0.6);
      if (data.female) inside = Math.max(inside, Math.min(y - (hip + L * 0.5), hip + L * 0.8 - y, (share(v, up) - 0.5) * 0.6, armX * 0.96 - x));
      c[v] = inside;
    }
    this.geometry.attributes.cloth.needsUpdate = true;
  }

  // How lean the drawing looks, 0 to 1 (see definitionAt). Eases rather than jumps.
  setDefinition(level) { this.defineGoal = level; if (this.lineColors.define.value === 0.15 && this.defineGoal !== undefined && !this.defineSet) { this.lineColors.define.value = level; this.defineSet = true; } }

  setTone(hex) { this.material.color.set(hex); this.lineColors.fill.value.set(hex).lerp(new THREE.Color('#ffffff'), 0.5); }

  setShape(shape, animate = false) {
    const from = this.shape;
    this.shape = shape;
    // Stand on the ground, one unit tall, whatever the shape.
    const size = shape.hi - shape.lo;
    this.mesh.scale.setScalar(1 / size); this.mesh.position.y = -shape.lo / size;
    if (animate && from) this.morph = { from: from.pos, to: shape.pos, t: 0 }; else this.apply(shape.pos);
    this.rig(shape.pos);
    this.dress(shape.pos);
  }

  apply(pos) {
    this.geometry.attributes.position.array.set(pos);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    const normals = this.geometry.attributes.normal.array;
    this.geometry.attributes.crease.array.set(creases(this.data, pos, normals));
    const { dist, signed, tier, ends } = anatomy(this.data, pos, normals);
    this.geometry.attributes.anat.array.set(dist); this.geometry.attributes.anatSide.array.set(signed); this.geometry.attributes.tier.array.set(tier); this.geometry.attributes.anatEnd.array.set(ends);
    for (const name of ['crease', 'anat', 'anatSide', 'anatEnd', 'tier']) this.geometry.attributes[name].needsUpdate = true;
  }

  play(pose, ms = 0) { this.pose = pose; this.until = ms ? performance.now() + ms : 0; }

  update(now, dt) {
    if (this.morph) {
      const m = this.morph; m.t = Math.min(1, m.t + dt / 0.7);
      const e = m.t * m.t * (3 - 2 * m.t), a = this.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i++) a[i] = m.from[i] + (m.to[i] - m.from[i]) * e;
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      if (m.t === 1) { this.morph = null; this.apply(m.to); }
    }
    if (this.defineGoal !== undefined) { const d = this.lineColors.define; d.value += (this.defineGoal - d.value) * (1 - Math.exp(-dt * 3)); }
    if (this.until && now > this.until) { this.pose = 'idle'; this.until = 0; }
    const t = now / 1000, goal = {};
    const set = (name, x = 0, y = 0, z = 0) => { goal[name] = [x, y, z]; };
    // Arms hang relaxed. Raising the left arm is +z, the right arm -z.
    set('upperarm_l', 0.05, 0, -0.62); set('upperarm_r', 0.05, 0, 0.62); set('lowerarm_l', -0.18, 0, -0.08); set('lowerarm_r', -0.18, 0, 0.08);
    set('spine_02', Math.sin(t * 1.6) * 0.012); set('head', Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.45) * 0.08, 0);
    if (this.pose === 'flex') { set('upperarm_l', 0, 0, 0.1); set('upperarm_r', 0, 0, -0.1); set('lowerarm_l', 0, 0, 1.9 + Math.sin(t * 5) * 0.08); set('lowerarm_r', 0, 0, -1.9 - Math.sin(t * 5) * 0.08); }
    const k = 1 - Math.exp(-dt * 11);
    for (const [name, r] of Object.entries(goal)) {
      const cur = (this.rot[name] ||= [0, 0, 0]);
      for (let a = 0; a < 3; a++) cur[a] += (r[a] - cur[a]) * k;
      this.bones[this.data.bone[name]].rotation.set(cur[0], cur[1], cur[2]);
    }
  }
}

export function lights(scene) {
  scene.add(new THREE.HemisphereLight('#fff6ea', '#8d8377', 1.15));
  const key = new THREE.DirectionalLight('#fff3e2', 2.4); key.position.set(2.2, 3.4, 3.2); scene.add(key);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.55); fill.position.set(-3, 1.2, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffffff', 1.5); rim.position.set(-1.6, 2.6, -3.4); scene.add(rim);
}

export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}
