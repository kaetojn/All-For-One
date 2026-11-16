// The companion: a small bear who lives on the page. Bears stand for strength, and this one is a
// cub, so it is still growing into it. It stands or sits on whatever element is marked data-mascot,
// and reacts to what happens: squats while something loads, pumps a paw when you tick an exercise,
// waves hello and jumps for joy when you finish.
//
// The bear is built here from simple shapes, so there is no model file to download.

import * as THREE from '/vendor/three.module.js';

const FUR = '#b98250', CREAM = '#f4e4c9', DARK = '#2a211c', BAND = '#5f8f79', BLUSH = '#e59f8c';
const ramp = new THREE.DataTexture(new Uint8Array([178, 178, 178, 255, 232, 232, 232, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });
const flat = (color) => new THREE.MeshBasicMaterial({ color });
const ink = new THREE.MeshBasicMaterial({ color: DARK, side: THREE.BackSide });
const ball = new THREE.SphereGeometry(1, 28, 20);

// A shape with an ink outline: the same shape again, slightly larger, showing only its inside.
function part(parent, geometry, material, [sx, sy, sz], [x, y, z], line = 0.016) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z);
  if (line) { const o = new THREE.Mesh(geometry, ink); o.scale.set(1 + line / sx, 1 + line / sy, 1 + line / sz); mesh.add(o); }
  parent.add(mesh);
  return mesh;
}
const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

function buildBear() {
  const root = new THREE.Group();
  const b = { root, body: pivot(root, 0, 0.42, 0) };
  part(b.body, ball, toon(FUR), [0.3, 0.33, 0.27], [0, 0, 0]);
  part(b.body, ball, toon(CREAM), [0.2, 0.23, 0.1], [0, -0.03, 0.185], 0);
  part(b.body, ball, toon(FUR), [0.07, 0.07, 0.07], [0, -0.2, -0.26]); // tail

  b.head = pivot(b.body, 0, 0.36, 0.02);
  part(b.head, ball, toon(FUR), [0.27, 0.245, 0.235], [0, 0.07, 0]);
  b.ears = [-1, 1].map((s) => { const ear = pivot(b.head, s * 0.2, 0.27, 0); part(ear, ball, toon(FUR), [0.095, 0.095, 0.06], [0, 0, 0]); part(ear, ball, toon(BLUSH), [0.05, 0.05, 0.03], [0, -0.005, 0.045], 0); return ear; });
  part(b.head, ball, toon(CREAM), [0.125, 0.095, 0.09], [0, -0.01, 0.185], 0);
  part(b.head, ball, flat(DARK), [0.042, 0.03, 0.03], [0, 0.03, 0.27], 0); // nose
  b.eyes = [-1, 1].map((s) => { const eye = part(b.head, ball, flat(DARK), [0.033, 0.04, 0.02], [s * 0.115, 0.115, 0.205], 0); part(eye, ball, flat('#ffffff'), [0.3, 0.26, 0.3], [0.3, 0.38, 0.8], 0); return eye; });
  [-1, 1].forEach((s) => part(b.head, ball, flat(BLUSH), [0.045, 0.028, 0.012], [s * 0.185, 0.03, 0.172], 0));
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 6, 14, Math.PI * 0.8), flat(DARK));
  smile.position.set(0, -0.012, 0.268); smile.rotation.z = Math.PI * 1.1; b.head.add(smile);
  // A sweatband: this bear trains.
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.03, 8, 40), toon(BAND));
  band.position.set(0, 0.185, -0.005); band.rotation.x = Math.PI / 2 - 0.14; band.scale.set(1.06, 0.98, 1); b.head.add(band);

  const limb = new THREE.CapsuleGeometry(1, 1, 6, 14);
  b.arms = [-1, 1].map((s) => {
    const shoulder = pivot(b.body, s * 0.265, 0.17, 0.02);
    part(shoulder, limb, toon(FUR), [0.072, 0.07, 0.072], [0, -0.1, 0]);
    const elbow = pivot(shoulder, 0, -0.19, 0);
    part(elbow, limb, toon(FUR), [0.07, 0.045, 0.07], [0, -0.07, 0]);
    part(elbow, ball, toon(FUR), [0.085, 0.08, 0.085], [0, -0.16, 0]);
    part(elbow, ball, toon(CREAM), [0.05, 0.045, 0.02], [0, -0.165, 0.072], 0);
    return { shoulder, elbow };
  });
  b.legs = [-1, 1].map((s) => {
    const hip = pivot(b.body, s * 0.15, -0.24, 0.02);
    part(hip, limb, toon(FUR), [0.09, 0.03, 0.09], [0, -0.06, 0]);
    part(hip, ball, toon(FUR), [0.105, 0.065, 0.15], [0, -0.14, 0.045]);
    part(hip, ball, toon(CREAM), [0.06, 0.02, 0.085], [0, -0.2, 0.05], 0);
    return hip;
  });
  return b;
}

const canvas = Object.assign(document.createElement('canvas'), { id: 'mascot' });
canvas.setAttribute('aria-hidden', 'true');
const FRAME = 1.5, CENTRE = 0.56, SEAT = 0.1; // camera sees 1.5 bear-heights; SEAT is the bear's underside when sitting
let bear = null, renderer, scene, camera, busy = false, target = null, shown = false, last = 0, turn = 0.3;
let pose = 'idle', until = 0;
// The bear only draws while it is on screen and something is happening. It breathes for a few
// seconds after it appears or reacts, then holds still and the loop stops, so an open app costs
// nothing. With reduced motion it is drawn once, in its resting pose, and never animates.
const SETTLE = 6000;
const still = matchMedia('(prefers-reduced-motion: reduce)');
let running = false, awakeUntil = 0;
function wake(ms = SETTLE) {
  if (!bear) return;
  awakeUntil = Math.max(awakeUntil, performance.now() + ms);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
addEventListener('resize', () => wake(0));
still.addEventListener?.('change', () => wake());
const cur = {};

function start() {
  if (bear) return;
  document.body.appendChild(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 3));
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a48c', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(1.5, 3, 3); scene.add(key);
  camera = new THREE.PerspectiveCamera(22, 1, 0.1, 20);
  bear = buildBear();
  scene.add(bear.root);
  mascot.react('wave', 2400);
}

// The pose that fits where the bear is and what is going on.
function resting() {
  const sitting = target && target.dataset.mascot === 'sit';
  const mood = (target && target.dataset.mood) || 'happy';
  if (busy) return sitting ? 'sitbusy' : 'squat';
  if (mood === 'cheer') return 'cheer';
  if (mood === 'sleepy') return sitting ? 'sitsleepy' : 'slump';
  return sitting ? 'sit' : 'idle';
}

// Every pose is a set of joint angles and offsets; the bear eases from wherever it is toward them.
function aim(name, t) {
  const sit = name.startsWith('sit');
  const g = { lift: 0, squash: 0, lean: 0, headX: Math.sin(t * 0.8) * 0.04, headY: Math.sin(t * 0.5) * 0.12, headZ: 0, armLz: -0.28, armRz: 0.28, armLx: 0, armRx: 0, elbL: -0.15, elbR: -0.15, legL: 0, legR: 0, ear: Math.max(0, Math.sin(t * 0.9) - 0.96) * 6, blink: Math.sin(t * 0.7) > 0.992 ? 1 : 0 };
  g.squash = Math.sin(t * 2) * 0.012; // breathing
  if (sit) { g.legL = -1.42 + Math.sin(t * 2.4) * 0.16; g.legR = -1.42 - Math.sin(t * 2.4) * 0.16; g.armLx = 0.25; g.armRx = 0.25; }
  if (name === 'sitbusy') { g.legL = -1.2 + Math.sin(t * 11) * 0.4; g.legR = -1.2 - Math.sin(t * 11) * 0.4; g.headZ = Math.sin(t * 5.5) * 0.1; }
  if (name === 'sitsleepy' || name === 'slump') { g.headX = 0.42; g.headY = 0; g.lean = 0.08; g.blink = 1; g.armLz = -0.1; g.armRz = 0.1; g.squash = -0.03 + Math.sin(t * 1.2) * 0.02; }
  if (name === 'wave') { g.armRz = -2.35 + Math.sin(t * 10) * 0.32; g.elbR = 0; g.headZ = -0.14; g.headY = 0; }
  if (name === 'cheer') { const hop = Math.abs(Math.sin(t * 6.5)); g.lift = hop * 0.13; g.squash = (1 - hop) * -0.08; g.armLz = 2.5 + hop * 0.2; g.armRz = -2.5 - hop * 0.2; g.elbL = g.elbR = 0; g.headX = -0.2; g.headY = 0; g.legL = hop * 0.25; g.legR = -hop * 0.25; g.ear = hop; }
  if (name === 'squat') { const q = (1 - Math.cos(t * 5.5)) / 2; g.lift = -q * 0.07; g.squash = -q * 0.13; g.armLx = g.armRx = -1.45 * q; g.armLz = -0.28 + 0.2 * q; g.armRz = 0.28 - 0.2 * q; g.headY = 0; }
  if (name === 'pump') { const j = Math.abs(Math.sin(t * 13)); g.armRx = -0.9; g.armRz = -0.5; g.elbR = -1.75 + j * 0.25; g.lift = j * 0.035; g.headZ = -0.1; g.headY = -0.15; }
  return g;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  target = document.querySelector('[data-mascot]');
  if (!target || document.hidden) { if (shown && !target) { canvas.style.opacity = 0; shown = false; } running = false; return; }
  const calm = still.matches;
  const more = !calm && (now < awakeUntil || (until && now < until) || busy);
  if (more) requestAnimationFrame(frame); else running = false;
  const box = target.getBoundingClientRect();
  const sitting = target.dataset.mascot === 'sit';
  const size = Number(target.dataset.size) || 64; // bear height in CSS pixels
  const w = Math.round(size * FRAME * 1.1), h = Math.round(size * FRAME);
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  // Where a given height on the bear lands in the canvas, in pixels from its top.
  const at = (height) => h * (0.5 - (height - CENTRE) / FRAME);
  // Standing: feet on the bottom edge of the marked box, centred. Sitting: seat on its edge, legs over the front.
  const x = Math.max(0, Math.min(document.documentElement.clientWidth - w, sitting ? box.right - w / 2 - size * 0.3 : box.left + box.width / 2 - w / 2));
  const y = box.bottom - at(sitting ? SEAT : 0);
  // The canvas sits in the page, not over it, so it scrolls with the content and needs no redraw.
  canvas.style.transform = `translate(${Math.round(x + scrollX)}px, ${Math.round(y + scrollY)}px)`;
  if (!shown) { canvas.style.opacity = 1; shown = true; }

  if (until && now > until) until = 0;
  if (!until || calm) pose = resting();
  const g = aim(pose, calm ? 0 : now / 1000), k = calm ? 1 : 1 - Math.exp(-dt * 12);
  for (const key in g) cur[key] = (cur[key] ?? g[key]) + (g[key] - (cur[key] ?? g[key])) * k;
  const b = bear;
  b.root.position.y = cur.lift + (sitting ? 0 : 0.0);
  b.body.scale.set(1 - cur.squash * 0.6, 1 + cur.squash, 1 - cur.squash * 0.6);
  b.body.rotation.x = cur.lean;
  b.head.rotation.set(cur.headX, cur.headY, cur.headZ);
  b.arms[0].shoulder.rotation.set(cur.armRx, 0, cur.armRz); b.arms[1].shoulder.rotation.set(cur.armLx, 0, cur.armLz);
  b.arms[0].elbow.rotation.x = cur.elbR; b.arms[1].elbow.rotation.x = cur.elbL;
  b.legs[0].rotation.x = cur.legR; b.legs[1].rotation.x = cur.legL;
  b.ears.forEach((ear, i) => { ear.rotation.z = (i ? -1 : 1) * cur.ear * 0.35; });
  b.eyes.forEach((eye) => { eye.scale.y = 0.04 * (1 - cur.blink * 0.85); });
  turn += ((sitting ? -0.42 : 0.25) - turn) * Math.min(1, dt * 4);
  if (calm) turn = sitting ? -0.42 : 0.25;
  b.root.rotation.y = turn + (calm ? 0 : Math.sin(now / 2600) * 0.1);
  const view = FRAME / (2 * Math.tan((camera.fov * Math.PI) / 360)); // distance at which the frame fills the height
  camera.position.set(0, CENTRE + 0.06, view); camera.lookAt(0, CENTRE, 0);
  renderer.render(scene, camera);
}

export const mascot = {
  shape() { start(); wake(); },
  // Call after the page is redrawn, so the bear finds its new spot (or hides).
  wake() { wake(); },
  react(name, ms = 900) { if (bear) { pose = name; until = performance.now() + ms; wake(ms + SETTLE); } },
  busy(on) { busy = on; if (on) wake(); },
};
