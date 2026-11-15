// The human figure used by the Body tab and the on-screen companion.
//
// Mesh, shape targets and skeleton come from the MakeHuman / MPFB2 project (CC0), packed by
// scripts/build-body.py. Rendering is three.js. This file does three jobs:
//   1. shapeFor(): morph the mesh until its tape measurements match the person's.
//   2. Figure: a skinned, lit three.js mesh that can change shape smoothly.
//   3. Poses: small procedural animations (idle, wave, cheer, squat, sit...).

import * as THREE from '/vendor/three.module.js';
export { THREE };

let loading;
export function loadBody() {
  loading ||= Promise.all([fetch('/body/body.json').then((r) => r.json()), fetch('/body/body.bin').then((r) => r.arrayBuffer())]).then(([meta, bin]) => {
    const types = { float32: Float32Array, uint16: Uint16Array, int16: Int16Array, uint8: Uint8Array };
    const get = (name) => { const l = meta.layout[name]; return new types[l.type](bin, l.offset, l.length); };
    const N = meta.vertices;
    const skinIndex = get('skinIndex'), skinWeight = get('skinWeight'), index = get('index');
    const dominant = new Uint8Array(N);
    for (let v = 0; v < N; v++) { let best = 0; for (let k = 1; k < 4; k++) if (skinWeight[v * 4 + k] > skinWeight[v * 4 + best]) best = k; dominant[v] = skinIndex[v * 4 + best]; }
    const bone = Object.fromEntries(meta.bones.map((b, i) => [b.name, i]));
    // Triangles grouped by the body part they mostly belong to, for taking measurements.
    const region = (names) => { const set = new Set(names.map((n) => bone[n])); const out = []; for (let t = 0; t < index.length; t += 3) if (set.has(dominant[index[t]]) && set.has(dominant[index[t + 1]]) && set.has(dominant[index[t + 2]])) out.push(t); return out; };
    const target = (name) => ({ i: get(`t:${name}:i`), d: get(`t:${name}:d`) });
    return {
      meta, N, index, skinIndex, skinWeight, dominant, bone, base: get('position'), target, k: 1 / meta.scale,
      regions: {
        torso: region(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']), lower: region(['pelvis', 'spine_01', 'thigh_l', 'thigh_r']),
        neck: region(['neck_01', 'head']), thigh: region(['thigh_l']), calf: region(['calf_l']), bicep: region(['upperarm_l']), forearm: region(['lowerarm_l']),
      },
    };
  });
  return loading;
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
    neck: ['neck', ...along('neck_01', 0.5)], thigh: ['thigh', ...along('thigh_l', 0.22)], calf: ['calf', ...along('calf_l', 0.3)],
    bicep: ['bicep', ...along('upperarm_l', 0.45)], forearm: ['forearm', ...along('lowerarm_l', 0.22)],
  };
}

export function measure(data, pos) {
  const out = {};
  for (const [site, [region, p, n]] of Object.entries(sites(data, pos))) out[site] = tape(data, pos, data.regions[region], p, n);
  return out;
}

/* ---------- shaping ---------- */

function add(data, pos, name, w) {
  if (!w) return;
  const { i, d } = data.target(name), k = data.k * w;
  for (let n = 0; n < i.length; n++) { const v = i[n] * 3; pos[v] += d[n * 3] * k; pos[v + 1] += d[n * 3 + 1] * k; pos[v + 2] += d[n * 3 + 2] * k; }
}
const addSigned = (data, pos, site, w) => add(data, pos, `${site}-${w >= 0 ? 'incr' : 'decr'}`, Math.abs(w));

// Morph the mesh for a person. `measurements` holds only sites actually measured (cm); the rest follow weight.
export function shapeFor(data, { sex, height_cm, weight_kg, measurements = {}, muscle = 0 }) {
  const s = sex === 'female' ? 'female' : 'male';
  const pos = new Float32Array(data.base);
  add(data, pos, s, 1);
  const bmi = weight_kg && height_cm ? weight_kg / (height_cm / 100) ** 2 : 23;
  const heavy = bmi >= 22 ? Math.min((bmi - 22) / 11, 1.25) : Math.max((bmi - 22) / 4.5, -1);
  add(data, pos, heavy >= 0 ? `${s}-heavy` : `${s}-light`, Math.abs(heavy));
  add(data, pos, muscle >= 0 ? `${s}-muscular` : `${s}-soft`, Math.abs(muscle));

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
  const order = ['hips', 'waist', 'belly', 'chest', 'thigh', 'calf', 'bicep', 'forearm', 'neck'].filter((x) => measurements[x]);
  for (let pass = 0; pass < 3; pass++) {
    for (const site of order) {
      const want = measurements[site], now = read(site), w0 = weights[site] || 0;
      if (Math.abs(want - now) < 0.2) continue;
      // Nudge the target to learn how much it moves the tape, then step to the wanted length.
      const probe = w0 + (want > now ? 0.4 : -0.4);
      setSite(site, probe);
      const slope = (read(site) - now) / (probe - w0);
      setSite(site, Math.abs(slope) > 0.05 ? Math.max(-1.6, Math.min(1.8, w0 + (want - now) / slope)) : w0);
    }
  }
  return { pos, cm, lo, hi, weights, fit: Object.fromEntries(order.map((x) => [x, Math.round(read(x) * 10) / 10])) };
}

/* ---------- the figure ---------- */

const CLOTH = new THREE.Color('#2a2824');
const TEE = new THREE.Color('#5f8f79'), SHOE = new THREE.Color('#f6f2ea'), HAIR = new THREE.Color('#2b211b'), INK = new THREE.Color('#1b1a17');
// The companion's cartoon proportions: a big head, big hands, shorter legs.
const TOON_SCALE = { head: 2.0, hand_l: 1.3, hand_r: 1.3, thigh_l: 0.8, thigh_r: 0.8, foot_l: 1.25, foot_r: 1.25 };

function toonRamp() {
  const steps = new Uint8Array([205, 205, 205, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(steps, 4, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  return tex;
}

export class Figure {
  // style 'real' is the anatomical figure on the Body tab; 'toon' is the cartoon companion.
  constructor(data, tone = '#d19c74', female = false, style = 'real') {
    this.data = data; this.female = female; this.tone = new THREE.Color(tone); this.toon = style === 'toon';
    const g = (this.geometry = new THREE.BufferGeometry());
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.base), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(data.N * 3), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(data.skinIndex), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4));
    this.material = this.toon ? new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })
      : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff2e6') });
    this.mesh = new THREE.SkinnedMesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.bones = data.meta.bones.map((b) => Object.assign(new THREE.Bone(), { name: b.name }));
    data.meta.bones.forEach((b, i) => (b.parent < 0 ? this.mesh : this.bones[b.parent]).add(this.bones[i]));
    this.skeleton = new THREE.Skeleton(this.bones);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    if (this.toon) {
      // An ink outline: the same skin drawn again slightly larger, back faces only.
      const line = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
      line.onBeforeCompile = (shader) => { shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(objectNormal) * 0.05;'); };
      this.outline = new THREE.SkinnedMesh(g, line);
      this.outline.frustumCulled = false;
      this.mesh.add(this.outline);
      // A friendlier face and hair, carried by the head bone.
      const head = this.bones[data.bone.head];
      const eye = () => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: INK })); const glint = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); glint.position.set(0.35, 0.4, 0.75); e.add(glint); head.add(e); return e; };
      this.eyes = [eye(), eye()];
      this.hair = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshToonMaterial({ color: HAIR, gradientMap: toonRamp() }));
      head.add(this.hair);
      this.smile = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 6, 14, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color: INK }));
      head.add(this.smile);
    }
    this.rot = {}; this.goal = {}; this.lift = 0; this.liftGoal = 0;
    this.pose = 'idle'; this.until = 0; this.after = 'idle'; this.morph = null; this.bound = false;
  }

  // Lay the skeleton out for a shape, then (re)attach the skin to it.
  rig(pos) {
    const joints = jointsOf(this.data, pos);
    this.joints = joints;
    this.bones.forEach((bone) => { bone.rotation.set(0, 0, 0); bone.scale.setScalar(1); });
    this.data.meta.bones.forEach((b, i) => { const h = joints[i].head, p = b.parent < 0 ? [0, 0, 0] : joints[b.parent].head; this.bones[i].position.set(h[0] - p[0], h[1] - p[1], h[2] - p[2]); });
    this.restY = this.bones[this.data.bone.Root].position.y;
    this.group.updateMatrixWorld(true);
    // The skin is bound in world space, so the bind matrix and the bones' inverses must be taken at the same moment.
    if (this.bound) { this.mesh.bindMatrix.copy(this.mesh.matrixWorld); this.mesh.bindMatrixInverse.copy(this.mesh.matrixWorld).invert(); this.skeleton.calculateInverses(); }
    else { this.mesh.bind(this.skeleton); this.bound = true; }
    this.drop = 0;
    if (this.toon) this.cartoon(pos, joints);
    this.limb = { thigh: Math.hypot(...joints[this.data.bone.thigh_l].head.map((x, k) => x - joints[this.data.bone.calf_l].head[k])), calf: Math.hypot(...joints[this.data.bone.calf_l].head.map((x, k) => x - joints[this.data.bone.foot_l].head[k])) };
  }

  // Apply the cartoon proportions and place the face. Done after binding, so the skin stretches to follow.
  cartoon(pos, joints) {
    const { data } = this, B = data.bone;
    if (this.outline.skeleton !== this.skeleton) this.outline.bind(this.skeleton, this.mesh.bindMatrix);
    else { this.outline.bindMatrix.copy(this.mesh.bindMatrix); this.outline.bindMatrixInverse.copy(this.mesh.bindMatrixInverse); }
    for (const [name, k] of Object.entries(TOON_SCALE)) this.bones[B[name]].scale.setScalar(k);
    // Shorter legs lift the feet off the ground, so lower the whole figure by the same amount.
    this.drop = (joints[B.thigh_l].head[1] - this.shape.lo) * (1 - TOON_SCALE.thigh_l);
    const h = joints[B.head].head, local = (p) => [p[0] - h[0], p[1] - h[1], p[2] - h[2]];
    const centres = data.meta.eyes.map((list) => { const o = [0, 0, 0]; for (const v of list) { o[0] += pos[v * 3]; o[1] += pos[v * 3 + 1]; o[2] += pos[v * 3 + 2]; } return o.map((x) => x / list.length); });
    const gap = Math.abs(centres[0][0] - centres[1][0]);
    this.eyes.forEach((e, i) => { const c = local(centres[i]); e.position.set(c[0] * 1.12, c[1] - gap * 0.08, c[2] + gap * 0.3); e.scale.set(gap * 0.22, gap * 0.3, gap * 0.12); });
    // Skull size from the head's own vertices.
    let top = -Infinity, back = Infinity, front = -Infinity, wide = 0, lips = -Infinity;
    const mouthY = centres[0][1] - gap * 1.02;
    for (let v = 0; v < data.N; v++) if (data.dominant[v] === B.head) { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; if (y > top) top = y; if (Math.abs(y - mouthY) < gap * 0.25 && Math.abs(x) < gap * 0.3 && z > lips) lips = z; if (y > centres[0][1]) { if (z < back) back = z; if (z > front) front = z; if (Math.abs(x) > wide) wide = Math.abs(x); } }
    const eyeY = centres[0][1], mid = local([0, eyeY + (top - eyeY) * 0.34, (front + back) / 2 - gap * 0.12]);
    this.hair.position.set(mid[0], mid[1], mid[2]);
    this.hair.scale.set(wide * 1.1, (top - eyeY) * 0.78, ((front - back) / 2) * 1.1);
    this.hair.rotation.x = -0.5;
    const m = local([0, mouthY + gap * 0.22, lips + gap * 0.03]);
    this.smile.position.set(m[0], m[1], m[2]); this.smile.scale.setScalar(gap * 0.34); this.smile.rotation.set(0, 0, Math.PI * 1.15);
  }

  // How high the underside of the thighs is when seated, as a share of standing height. Used to sit on things.
  get seat() { const B = this.data.bone, s = this.shape; return (this.joints[B.thigh_l].head[1] - s.lo - 0.75 - this.drop) / (s.hi - s.lo); }

  paint(shape) {
    const { data } = this, pos = shape.pos, B = data.bone, c = this.geometry.attributes.color.array;
    const j = jointsOf(data, pos);
    const hip = j[B.pelvis].head[1], knee = j[B.calf_l].head[1], top = j[B.neck_01].head[1], L = top - hip;
    const shortsTop = hip + L * 0.2, shortsBottom = hip - (hip - knee) * 0.42;
    const low = new Set([B.pelvis, B.spine_01, B.thigh_l, B.thigh_r]), up = new Set([B.spine_02, B.spine_03, B.clavicle_l, B.clavicle_r]);
    const tee = new Set([B.spine_02, B.spine_03, B.clavicle_l, B.clavicle_r, B.spine_01]), sleeve = new Set([B.upperarm_l, B.upperarm_r]), shoe = new Set([B.foot_l, B.foot_r, B.ball_l, B.ball_r]);
    const elbow = j[B.lowerarm_l].head, shoulder = j[B.upperarm_l].head, eyeSet = this.toon ? new Set(data.meta.eyes.flat()) : null;
    for (let v = 0; v < data.N; v++) {
      const y = pos[v * 3 + 1], d = data.dominant[v];
      if (this.toon) {
        // The companion wears a tee, shorts and trainers.
        const reach = (Math.abs(pos[v * 3]) - shoulder[0]) / (elbow[0] - shoulder[0]);
        const col = shoe.has(d) ? SHOE : low.has(d) && y < shortsTop && y > shortsBottom ? CLOTH : (tee.has(d) && y >= shortsTop && y < top - L * 0.02) || (sleeve.has(d) && reach < 0.5) ? TEE : this.tone;
        c[v * 3] = col.r; c[v * 3 + 1] = col.g; c[v * 3 + 2] = col.b;
        continue;
      }
      // Clothing is painted on, fading over a short band so the hem follows the body smoothly.
      const band = (lo, hi) => Math.max(0, Math.min(1, (y - lo) / 0.22)) * Math.max(0, Math.min(1, (hi - y) / 0.22));
      let cloth = low.has(d) ? band(shortsBottom, shortsTop) : 0;
      if (this.female && up.has(d) && Math.abs(pos[v * 3]) < j[B.upperarm_l].head[0] * 0.98) cloth = Math.max(cloth, band(hip + L * 0.52, hip + L * 0.8));
      c[v * 3] = this.tone.r + (CLOTH.r - this.tone.r) * cloth; c[v * 3 + 1] = this.tone.g + (CLOTH.g - this.tone.g) * cloth; c[v * 3 + 2] = this.tone.b + (CLOTH.b - this.tone.b) * cloth;
    }
    this.geometry.attributes.color.needsUpdate = true;
  }

  setTone(hex) { this.tone.set(hex); if (this.shape) this.paint(this.shape); }

  setShape(shape, animate = false) {
    const from = this.shape;
    this.shape = shape;
    // Stand on the ground, one unit tall, whatever the shape.
    const size = shape.hi - shape.lo;
    this.mesh.scale.setScalar(1 / size); this.mesh.position.y = -shape.lo / size;
    if (animate && from) this.morph = { from: from.pos, to: shape.pos, t: 0 }; else this.apply(shape.pos);
    this.rig(shape.pos);
    this.mesh.position.y -= this.drop / size;
    this.paint(shape);
  }

  apply(pos) {
    this.geometry.attributes.position.array.set(pos);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  play(pose, ms = 0, after = 'idle') { this.pose = pose; this.until = ms ? performance.now() + ms : 0; this.after = after; }

  update(now, dt) {
    if (this.morph) {
      const m = this.morph; m.t = Math.min(1, m.t + dt / 0.7);
      const e = m.t * m.t * (3 - 2 * m.t), a = this.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i++) a[i] = m.from[i] + (m.to[i] - m.from[i]) * e;
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      if (m.t === 1) this.morph = null;
    }
    if (this.until && now > this.until) { this.pose = this.after; this.until = 0; }
    const t = now / 1000, g = (this.goal = {});
    let lift = 0;
    const set = (name, x = 0, y = 0, z = 0) => { g[name] = [x, y, z]; };
    const breath = Math.sin(t * 1.6) * 0.012;
    // Arms hang relaxed by default. Raising the left arm is +z, the right arm -z.
    set('upperarm_l', 0.05, 0, -0.62); set('upperarm_r', 0.05, 0, 0.62); set('lowerarm_l', -0.18, 0, -0.08); set('lowerarm_r', -0.18, 0, 0.08);
    set('spine_02', breath, 0, 0); set('head', Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.45) * 0.08, 0); set('spine_01', 0, 0, Math.sin(t * 0.5) * 0.012);
    const P = this.pose;
    if (P === 'wave') { set('upperarm_r', 0, 0, -1.25); set('lowerarm_r', 0, 0, -0.75 + Math.sin(t * 9) * 0.38); set('head', 0, -0.12, -0.08); }
    else if (P === 'cheer') { const b = Math.abs(Math.sin(t * 6.5)); set('upperarm_l', 0, 0, 1.25 + b * 0.25); set('upperarm_r', 0, 0, -1.25 - b * 0.25); set('lowerarm_l', 0, 0, 0.35); set('lowerarm_r', 0, 0, -0.35); set('head', -0.18, 0, 0); set('thigh_l', -b * 0.12); set('thigh_r', -b * 0.12); set('calf_l', b * 0.24); set('calf_r', b * 0.24); lift = b * 0.9; }
    else if (P === 'squat') { const q = (1 - Math.cos(t * 5)) / 2, a = q * 1.25; set('thigh_l', -a, 0, 0.06); set('thigh_r', -a, 0, -0.06); set('calf_l', a * 1.85); set('calf_r', a * 1.85); set('spine_01', a * 0.32); set('upperarm_l', -1.35 * q, 0, -0.62 + 0.5 * q); set('upperarm_r', -1.35 * q, 0, 0.62 - 0.5 * q); lift = -(this.limb.thigh * (1 - Math.cos(a)) + this.limb.calf * (1 - Math.cos(a * 0.85))); }
    else if (P === 'pump') { const b = Math.sin(t * 14) * 0.12; set('upperarm_r', -0.5, 0, -0.55); set('lowerarm_r', -1.7 + b, 0, -0.5); set('head', 0, -0.1, 0); lift = Math.abs(b) * 1.2; }
    else if (P === 'sit') { const k = Math.sin(t * 2.2) * 0.22; set('thigh_l', -1.5, 0, 0.1); set('thigh_r', -1.5, 0, -0.1); set('calf_l', 1.45 + k); set('calf_r', 1.45 - k); set('upperarm_l', 0.25, 0, -0.5); set('upperarm_r', 0.25, 0, 0.5); set('spine_01', 0.06); }
    else if (P === 'sitbusy') { const k = Math.sin(t * 9) * 0.5; set('thigh_l', -1.5, 0, 0.1); set('thigh_r', -1.5, 0, -0.1); set('calf_l', 1.2 + k); set('calf_r', 1.2 - k); set('upperarm_l', 0.25, 0, -0.5); set('upperarm_r', 0.25, 0, 0.5); }
    else if (P === 'slump') { set('spine_02', 0.22); set('spine_01', 0.12); set('head', 0.38, 0, 0); set('upperarm_l', 0.1, 0, -0.72); set('upperarm_r', 0.1, 0, 0.72); }
    else if (P === 'flex') { set('upperarm_l', 0, 0, 0.1); set('upperarm_r', 0, 0, -0.1); set('lowerarm_l', 0, 0, 1.9 + Math.sin(t * 5) * 0.08); set('lowerarm_r', 0, 0, -1.9 - Math.sin(t * 5) * 0.08); }
    const k = 1 - Math.exp(-dt * 11);
    for (const [name, r] of Object.entries(g)) {
      const cur = (this.rot[name] ||= [0, 0, 0]);
      for (let a = 0; a < 3; a++) cur[a] += (r[a] - cur[a]) * k;
      this.bones[this.data.bone[name]].rotation.set(cur[0], cur[1], cur[2]);
    }
    this.lift += (lift - this.lift) * k;
    this.bones[this.data.bone.Root].position.y = this.restY + this.lift;
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
