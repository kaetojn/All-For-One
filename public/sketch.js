// The body sketch: a faceless figure in the style of an anatomy drawing, built from numbers.
//
//   drawSketch({ sex, height_cm, body_fat, build, measurements, tone }) -> SVG markup
//
// Width comes from tape measurements (circumferences, cm). Body fat chooses the pose and how much
// muscle definition is drawn: high body fat is passed out on the floor or slouching with the belly out;
// low body fat stands tall and flexes. Build (lean, muscular, bodybuilder) sizes the muscles and picks
// a bodybuilder's pose when lean. Nothing here identifies a person: no face, no hair, neutral by default.

const NEUTRAL = '#f3efe8';
const INK = '#2e2c28';
const SHORTS = '#3a3833';
const MUSCLE = { lean: 0.9, muscular: 1.0, bodybuilder: 1.2 };

// Front-view width from a circumference, for a cross-section that is `q` times as deep as it is wide.
const width = (c, q) => (2 * c) / (Math.PI * (1 + q));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// How strongly a feature shows: 0 above `start` body fat, 1 at `full` or below.
const fade = (bf, start, full) => clamp01((start - bf) / (start - full));
const fmt = (n) => (Math.round(n * 10) / 10).toString();

// A smooth curve through points (Catmull-Rom as cubic Béziers).
function curve(pts, closed = false) {
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${fmt(p[1][0])},${fmt(p[1][1])}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [a, b, c, e] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    d += `C${fmt(b[0] + (c[0] - a[0]) / 6)},${fmt(b[1] + (c[1] - a[1]) / 6)} ${fmt(c[0] - (e[0] - b[0]) / 6)},${fmt(c[1] - (e[1] - b[1]) / 6)} ${fmt(c[0])},${fmt(c[1])}`;
  }
  return closed ? `${d}Z` : d;
}

// The pose for a body-fat level and build. Arm and leg angles are degrees from straight down, positive
// away from the body. Each arm is [upper arm, forearm, hand]; each leg is [thigh, shin].
export function poseFor(bf, sex, build) {
  const s = sex === 'female' ? 8 : 0;
  if (bf >= 32 + s) return { name: 'passed out', lie: true, slump: 0.4, head: 16, arms: [[72, 98, 'open'], [66, 90, 'open']], legs: [[14, 9], [11, 7]] };
  if (bf >= 27 + s) return { name: 'slouching', slump: 1, head: 10, arms: [[9, 5, 'open'], [8, 4, 'open']], legs: [[4, 0], [5, 1]] };
  if (bf >= 21 + s) return { name: 'standing', slump: 0.25, head: 3, arms: [[12, 6, 'open'], [9, 4, 'open']], legs: [[2, 0], [9, -3]] };
  if (bf >= 16 + s) return { name: 'hands on hips', slump: 0, head: -3, arms: [[38, -38, 'open'], [38, -38, 'open']], legs: [[7, 2], [7, 2]] };
  if (bf >= 12 + s) {
    if (build === 'bodybuilder') return { name: 'lat spread', lats: 1, slump: 0, head: -4, arms: [[30, -52, 'fist'], [30, -52, 'fist']], legs: [[8, 3], [8, 3]] };
    return { name: 'one-arm flex', slump: 0, head: -5, arms: [[98, 186, 'fist'], [38, -38, 'open']], legs: [[7, 2], [8, 2]], pop: [0] };
  }
  return { name: 'double biceps', slump: 0, head: -6, arms: [[96, 188, 'fist'], [96, 188, 'fist']], legs: [[9, 3], [9, 3]], pop: [0, 1], lats: build === 'bodybuilder' ? 0.6 : 0 };
}

export function drawSketch({ sex = 'male', height_cm = 175, body_fat = 22, build = 'muscular', measurements: m = {}, tone = null, id = 'f' }) {
  const female = sex === 'female';
  const bf = body_fat ?? (female ? 30 : 22);
  const mf = MUSCLE[build] || 1;
  const H = 520, k = H / height_cm, top = 46, cx = 160; // svg units per cm; head top; centre line
  const Y = (f) => top + f * H; // a height on the body, as a fraction of standing height
  const pose = poseFor(bf, sex, build);
  const fill = tone || NEUTRAL;

  // Widths in svg units, from circumferences. Muscles scale with build; fat areas do not.
  const W = {
    neck: width(m.neck || 38, 0.95) * k,
    shoulders: (m.shoulders || 112) * 0.385 * k * (female ? 0.96 : 1),
    chest: width(m.chest || 98, female ? 0.8 : 0.68) * k,
    waist: width(m.waist || 86, 0.78) * k,
    belly: width(m.belly || m.waist || 88, 0.85) * k,
    hips: width(m.hips || 98, 0.72) * k,
    bicep: width(m.bicep || 32, 0.92) * k * mf,
    forearm: width(m.forearm || 28, 0.85) * k * mf,
    thigh: width(m.thigh || 56, 0.9) * k * Math.sqrt(mf),
    calf: width(m.calf || 37, 0.92) * k * Math.sqrt(mf),
  };
  if (pose.lats) W.chest *= 1 + 0.08 * pose.lats;
  const belly = clamp01((bf - (female ? 28 : 20)) / 14); // how much the belly sags over the waistband
  const slump = pose.slump || 0;

  // ---- skeleton
  const shY = Y(0.19 + 0.012 * slump), shX = W.shoulders / 2 - W.bicep * 0.3 - slump * 2;
  const hipY = Y(0.492), hipX = W.hips * 0.24;
  const L = { upper: 0.182 * H, fore: 0.148 * H, thigh: 0.235 * H, shin: 0.232 * H };
  const dir = (deg, side) => [Math.sin((deg * Math.PI) / 180) * side, Math.cos((deg * Math.PI) / 180)];
  const add = (p, d, len) => [p[0] + d[0] * len, p[1] + d[1] * len];
  const sides = [1, -1]; // screen right, screen left
  const arms = sides.map((s, i) => {
    const [a1, a2, hand] = pose.arms[i];
    const sh = [cx + shX * s, shY], d1 = dir(a1, s), el = add(sh, d1, L.upper), d2 = dir(a2, s), wr = add(el, d2, L.fore);
    return { s, sh, el, wr, d1, d2, hand, flex: a2 - a1 > 60 };
  });
  const legs = sides.map((s, i) => {
    const [a1, a2] = pose.legs[i];
    const hp = [cx + hipX * s, hipY], d1 = dir(a1, s), kn = add(hp, d1, L.thigh), d2 = dir(a2, s), an = add(kn, d2, L.shin);
    return { s, hp, kn, an, d1, d2 };
  });

  // ---- drawing helpers. Parts are drawn back to front: each is filled, then inked, so it covers what is behind it.
  const out = [];
  const stroke = (d, w, o, extra = '') => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-opacity="${fmt(o)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const sketchy = (d, w = 1.5) => stroke(d, w, 0.9) + stroke(d, w * 0.45, 0.28, ' transform="translate(.7,-.5)"');
  const part = (shape, color = fill) => { out.push(`<path d="${shape.fill}" fill="${color}"/>`, ...shape.lines.map((d) => sketchy(d))); };
  const solid = (d, color = fill, w = 1.5) => out.push(`<path d="${d}" fill="${color}"/>`, sketchy(d, w));
  const line = (d, o, w = 1.15) => { if (o > 0.02) out.push(stroke(d, w, 0.85 * Math.min(1, o))); };
  const faint = (d) => out.push(stroke(d, 0.9, 0.42));

  const normal = (d) => [-d[1], d[0]];
  // A limb segment through three widths on each side (at the start, the muscle belly, the end).
  function limb(a, b, wl, wr, at = 0.32) {
    const d = [(b[0] - a[0]), (b[1] - a[1])], len = Math.hypot(...d), u = [d[0] / len, d[1] / len], n = normal(u);
    const P = (t, w) => [a[0] + d[0] * t + n[0] * w, a[1] + d[1] * t + n[1] * w];
    const lft = [P(-0.03, wl[0]), P(at, wl[1]), P(1.03, wl[2])], rgt = [P(-0.03, -wr[0]), P(at, -wr[1]), P(1.03, -wr[2])];
    return { fill: curve([...lft, ...[...rgt].reverse()], true), lines: [curve(lft), curve(rgt)] };
  }
  const bendSide = (d1, d2) => Math.sign(d1[0] * d2[1] - d1[1] * d2[0]) || 1;
  const nk = W.neck / 2, cw = W.calf / 2, tw = W.thigh / 2;

  // ---- 1. legs, shin behind thigh, with feet
  for (const g of legs) {
    const innerIsLeft = g.s > 0; // for the right leg, the left of its downward direction faces the other leg
    const sh = (inner) => (inner ? [cw * 0.62, cw * 1.05, cw * 0.42] : [cw * 0.62, cw * 0.95, cw * 0.4]);
    const th = (inner) => (inner ? [tw * 0.92, tw * 0.9, tw * 0.55] : [tw * 1.06, tw * 1.03, tw * 0.6]);
    const fw = cw * 0.55, f = [g.an[0] + g.s * 3, g.an[1] - 2];
    solid(curve([[f[0] - fw * 0.9, f[1] - 6], [f[0] - fw * 1.1 + g.s * 3, f[1] + 12], [f[0] + g.s * 6, f[1] + 20], [f[0] + fw * 1.25 + g.s * 4, f[1] + 13], [f[0] + fw * 0.9, f[1] - 6]], true));
    faint(`M${fmt(f[0] - fw * 0.5 + g.s * 4)},${fmt(f[1] + 14)}q${fmt(fw * 0.8)},4 ${fmt(fw * 1.5)},0`);
    part(limb(g.kn, g.an, sh(!innerIsLeft ? false : true), sh(innerIsLeft ? false : true), 0.27));
    part(limb(g.hp, g.kn, th(innerIsLeft), th(!innerIsLeft), 0.25));
    const kc = add(g.kn, g.d1, -3);
    faint(curve([[kc[0] - 6, kc[1] + 1], [kc[0], kc[1] + 7], [kc[0] + 6, kc[1] + 1]]));
    const q = fade(bf, 20, 10);
    const at = (t, off) => { const p = add(g.hp, g.d1, L.thigh * t); return [p[0] + g.s * off * tw, p[1]]; };
    line(curve([at(0.6, -0.72), at(0.8, -0.62), at(0.92, -0.2)]), q);
    line(curve([at(0.4, 0.55), at(0.64, 0.42), at(0.86, 0.36)]), q * 0.7);
    const c = (t, off) => { const p = add(g.kn, g.d2, L.shin * t); return [p[0] + g.s * off * cw, p[1]]; };
    line(curve([c(0.1, -0.5), c(0.3, -0.6), c(0.5, -0.3)]), q * 0.6);
  }

  // ---- 2. neck, then torso over its base
  const neckTop = Y(0.105 + 0.02 * slump), neckBase = Y(0.165 + 0.01 * slump);
  out.push(`<path d="M${fmt(cx - nk)},${fmt(neckTop)}L${fmt(cx - nk * 1.05)},${fmt(neckBase)}L${fmt(cx + nk * 1.05)},${fmt(neckBase)}L${fmt(cx + nk)},${fmt(neckTop)}Z" fill="${fill}"/>`);
  out.push(sketchy(`M${fmt(cx - nk)},${fmt(neckTop)}L${fmt(cx - nk * 1.05)},${fmt(neckBase)}M${fmt(cx + nk)},${fmt(neckTop)}L${fmt(cx + nk * 1.05)},${fmt(neckBase)}`, 1.4));
  const half = (s) => {
    const x = (w) => cx + (w / 2) * s;
    const lat = lerp(W.chest, W.waist, 0.45) * (1 + 0.07 * (pose.lats || 0));
    return [
      [x(W.neck * 0.98), Y(0.158 + 0.01 * slump)],
      [x(lerp(W.neck, W.shoulders, 0.55)), Y(0.171 + 0.012 * slump)],
      [x(W.shoulders * 0.92 - slump * 4), Y(0.19 + 0.012 * slump)],
      [x(W.chest * 0.99), Y(0.25)],
      [x(W.chest * (1 + 0.03 * belly)), Y(0.285 + 0.01 * belly)],
      [x(lat), Y(0.335)],
      [x(W.waist), Y(0.385)],
      [x(Math.max(W.waist, W.belly) * (1 + 0.1 * belly)), Y(0.415 + 0.01 * belly)],
      [x(Math.max(W.hips, W.belly * (1 + 0.04 * belly))), Y(0.45)],
      [x(W.hips), Y(0.468)],
      [x(W.hips * 0.97), Y(0.5)],
    ];
  };
  const R = half(1), Lf = half(-1);
  out.push(`<path d="${curve([...R, [cx, Y(0.505)], ...[...Lf].reverse()], true)}" fill="${fill}"/>`, sketchy(curve(R)), sketchy(curve(Lf)));

  // ---- 3. torso detail: chest, collarbones, abs, the belly
  const T = (fx, fy) => [cx + fx * W.chest, Y(fy)];
  if (!female) {
    if (bf > 26) for (const s of sides) line(curve([T(s * 0.05, 0.27), T(s * 0.22, 0.302), T(s * 0.42, 0.29)]), 0.7);
    else for (const s of sides) line(curve([T(s * 0.03, 0.262), T(s * 0.2, 0.287), T(s * 0.4, 0.265), T(s * 0.47, 0.238)]), 0.5 + 0.5 * fade(bf, 26, 16));
    line(`M${fmt(cx)},${fmt(Y(0.205))}L${fmt(cx)},${fmt(Y(0.255))}`, fade(bf, 20, 12) * 0.6);
  }
  for (const s of sides) line(curve([[cx + s * nk * 0.55, Y(0.172)], [cx + s * W.shoulders * 0.2, Y(0.179)], [cx + s * W.shoulders * 0.36, Y(0.182)]]), fade(bf, 24, 14) * 0.75);
  for (const s of sides) line(curve([[cx + s * nk * 0.8, neckTop + 4], [cx + s * nk * 0.35, Y(0.15)], [cx + s * nk * 0.15, Y(0.165)]]), fade(bf, 20, 11) * 0.6);
  const absStart = female ? 23 : 18, absFull = female ? 15 : 9, abs = fade(bf, absStart, absFull), aw = W.waist * 0.17;
  line(curve([[cx, Y(0.3)], [cx + 1, Y(0.37)], [cx, Y(0.43)]]), abs);
  [[0.318, 0], [0.352, 0.15], [0.388, 0.35]].forEach(([y, t]) => { const a2 = fade(bf, absStart - t * 8, absFull - t * 3); for (const s of sides) line(curve([[cx, Y(y)], [cx + s * aw * 0.55, Y(y - 0.003)], [cx + s * aw, Y(y + 0.002)]]), a2 * 0.85); });
  for (const s of sides) line(curve([[cx + s * aw * 1.05, Y(0.3)], [cx + s * aw * 1.2, Y(0.36)], [cx + s * aw * 1.05, Y(0.425)]]), abs * 0.8);
  for (const s of sides) line(curve([[cx + s * W.waist * 0.4, Y(0.412)], [cx + s * W.waist * 0.25, Y(0.44)], [cx + s * W.waist * 0.13, Y(0.465)]]), abs * 0.75);
  const serr = fade(bf, 12, 8);
  for (const s of sides) for (const y of [0.29, 0.31, 0.33]) line(`M${fmt(cx + s * W.chest * 0.38)},${fmt(Y(y))}l${fmt(s * 7)},4`, serr * 0.7);
  line(curve([[cx - 3, Y(0.408)], [cx, Y(0.414 + 0.006 * belly)], [cx + 3, Y(0.408)]]), 0.8);
  const band = Y(0.452 + 0.02 * belly);
  if (belly > 0) {
    line(curve([[cx - W.belly * 0.42, band - 4], [cx, band + 6 * belly], [cx + W.belly * 0.42, band - 4]]), 0.4 + 0.5 * belly);
    if (belly > 0.4) for (const s of sides) line(curve([[cx + s * W.belly * 0.36, Y(0.41)], [cx + s * W.belly * 0.46, Y(0.43)], [cx + s * W.belly * 0.41, Y(0.446)]]), belly * 0.6);
  }

  // ---- 4. shorts, and a sports top for women
  {
    const [r, l] = legs, hemAt = (g) => add(g.hp, g.d1, L.thigh * 0.36);
    const edge = (g, side, o) => { const p = hemAt(g); return [p[0] + side * tw * o, p[1]]; };
    const ww = Math.max(W.waist, W.belly) / 2;
    solid(curve([[cx + ww, band], [cx + W.hips / 2 * 1.02, Y(0.475)], edge(r, 1, 1.06), edge(r, 1, -0.95), [cx, Y(0.53)], edge(l, -1, -0.95), edge(l, -1, 1.06), [cx - W.hips / 2 * 1.02, Y(0.475)], [cx - ww, band], [cx, band + 3 * (1 - belly)]], true), SHORTS, 1.3);
    out.push(stroke(curve([[cx - ww * 0.95, band + 6], [cx, band + 9 - 3 * belly], [cx + ww * 0.95, band + 6]]), 0.8, 0.35).replace(INK, '#8a857b'));
  }
  if (female) {
    const bw = W.chest / 2;
    solid(curve([[cx - bw * 0.96, Y(0.24)], [cx - bw * 0.5, Y(0.212)], [cx, Y(0.232)], [cx + bw * 0.5, Y(0.212)], [cx + bw * 0.96, Y(0.24)], [cx + bw * 1.0, Y(0.298)], [cx, Y(0.306)], [cx - bw * 1.0, Y(0.298)]], true), SHORTS, 1.3);
  }

  // ---- 5. arms, each forearm then upper arm, with hands
  arms.forEach((a, i) => {
    const bw = W.bicep / 2, fw = W.forearm / 2, bend = bendSide(a.d1, a.d2), peak = a.flex ? 1.42 : 1.04;
    const cap = a.flex || a.hand === 'fist' ? 1.4 : 1.08; // a raised arm shows the round of the shoulder
    const upperL = [bw * cap, bw * (bend > 0 ? peak : 0.98), fw * 0.84], upperR = [bw * cap, bw * (bend < 0 ? peak : 0.98), fw * 0.84];
    // Hand first when it tucks behind the forearm (hand on hip), otherwise after.
    const h = add(a.wr, a.d2, 2);
    const drawHand = () => {
      if (a.hand === 'fist') {
        const r = fw * 0.98, c = add(h, a.d2, r * 0.65);
        solid(curve([[c[0] - r, c[1] + r * 0.1], [c[0] - r * 0.2, c[1] - r * 1.02], [c[0] + r, c[1] - r * 0.1], [c[0] + r * 0.3, c[1] + r]], true));
        faint(curve([[c[0] - r * 0.6, c[1] - r * 0.2], [c[0], c[1] - r * 0.45], [c[0] + r * 0.6, c[1] - r * 0.2]]));
        return;
      }
      const u = a.d2, n2 = normal(u), w = fw * 0.7, len = 0.088 * H;
      const P = (t, off) => [h[0] + u[0] * len * t + n2[0] * off, h[1] + u[1] * len * t + n2[1] * off];
      const thumbSide = bendSide([0, 1], u) * -a.s || -a.s;
      solid(curve([P(0, w), P(0.45, w * 1.05), P(0.82, w * 0.72), P(1, 0), P(0.82, -w * 0.7), P(0.45, -w * 1.02), P(0.03, -w)], true));
      faint(curve([P(0.48, w * 0.32), P(0.86, w * 0.28)])); faint(curve([P(0.48, -w * 0.3), P(0.86, -w * 0.24)]));
      out.push(sketchy(curve([P(0.1, w * thumbSide), P(0.33, w * 1.55 * thumbSide), P(0.52, w * 1.25 * thumbSide)]), 1.3));
    };
    const onHip = a.d2[1] > 0 && Math.sign(a.d2[0]) === -a.s;
    if (onHip) drawHand();
    part(limb(a.el, a.wr, [fw * 0.92, fw * 1.04, fw * 0.6], [fw * 0.92, fw, fw * 0.58], 0.24));
    if (!onHip) drawHand();
    part(limb(a.sh, a.el, upperL, upperR, a.flex ? 0.52 : 0.42));
    // Deltoid edge, and the bicep line on a flexed arm.
    const n = normal(a.d1), dl = add(a.sh, a.d1, L.upper * 0.4);
    line(curve([add(a.sh, n, bw * 1.25 * -a.s), [dl[0] - n[0] * bw * 0.2 * a.s, dl[1] - n[1] * bw * 0.2 * a.s], add(dl, n, bw * 0.9 * a.s)]), fade(bf, 24, 13) * 0.7);
    if (pose.pop && pose.pop.includes(i)) {
      const p = add(a.sh, a.d1, L.upper * 0.5), sgn = bend > 0 ? 1 : -1;
      for (const [dx, len] of [[-12, 9], [0, 12], [12, 9]]) {
        const base = [p[0] + n[0] * sgn * bw * 2.3 + a.d1[0] * dx, p[1] + n[1] * sgn * bw * 2.3 + a.d1[1] * dx];
        out.push(stroke(`M${fmt(base[0])},${fmt(base[1])}l${fmt(n[0] * sgn * len)},${fmt(n[1] * sgn * len)}`, 1.6, 0.9, ' class="pop"'));
      }
    }
  });

  // ---- 6. head: an egg with construction lines, no face
  const tilt = pose.head || 0, headY = Y(0.068 + 0.022 * slump), hx = 0.05 * H, hy = 0.066 * H;
  const head = curve([[0, -hy], [hx * 0.92, -hy * 0.62], [hx, 0], [hx * 0.72, hy * 0.62], [0, hy], [-hx * 0.72, hy * 0.62], [-hx, 0], [-hx * 0.92, -hy * 0.62]], true);
  const cross = `${curve([[hx * 0.12, -hy * 0.96], [hx * 0.26, 0], [hx * 0.1, hy * 0.96]])}${curve([[-hx * 0.98, hy * 0.05], [0, hy * 0.2], [hx * 0.98, hy * 0.05]])}`;
  out.push(`<g transform="translate(${fmt(cx)},${fmt(headY)}) rotate(${tilt})"><path d="${head}" fill="${fill}"/>${sketchy(head)}${stroke(cross, 0.9, 0.4)}</g>`);

  // ---- assemble
  const drawn = `<g filter="url(#${id}-pencil)">${out.join('')}</g>`;
  const ground = Y(1.0) + 20;
  let figure, shadow;
  if (pose.lie) {
    // Flat on the floor: the whole figure turned on its side and scaled to fit the frame.
    const sc = 0.6, mid = Y(0.5);
    figure = `<g transform="translate(160,${fmt(ground - 34)}) rotate(-90) scale(${sc}) translate(${fmt(-cx)},${fmt(-mid)})">${drawn}</g>
      <g class="zzz" font-family="Georgia,serif" fill="${INK}"><text x="196" y="${fmt(ground - 120)}" font-size="16">z</text><text x="212" y="${fmt(ground - 142)}" font-size="21">z</text><text x="232" y="${fmt(ground - 168)}" font-size="27">Z</text></g>`;
    shadow = `<ellipse cx="160" cy="${fmt(ground - 4)}" rx="150" ry="7" fill="${INK}" opacity=".08"/>`;
  } else {
    const drop = pose.name === 'slouching' ? `<path class="drop" d="M${fmt(cx + hx * 1.3)},${fmt(headY - hy * 0.35)}q-4,8 0,11q4,-3 0,-11z" fill="#9fb6c7" stroke="${INK}" stroke-width=".8"/>` : '';
    figure = `<g class="sway" style="transform-origin:${fmt(cx)}px ${fmt(ground)}px">${drawn}${drop}</g>`;
    shadow = `<ellipse cx="${cx}" cy="${fmt(ground)}" rx="80" ry="7" fill="${INK}" opacity=".08"/>`;
  }
  return `<svg viewBox="0 0 320 640" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sketch of a figure, ${pose.name}">
    <defs><filter id="${id}-pencil" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter></defs>
    ${shadow}${figure}
  </svg>`;
}
