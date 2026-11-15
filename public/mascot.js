// The companion: a small copy of your own figure that lives on the page. It stands or sits on
// whatever element is marked data-mascot, and reacts to what happens: it squats while something
// loads, pumps a fist when you tick an exercise, waves hello and cheers when you finish.

import { THREE, loadBody, shapeFor, Figure, lights, makeRenderer } from '/figure.js';
import { shapeInputs } from '/body3d.js';

const canvas = Object.assign(document.createElement('canvas'), { id: 'mascot' });
canvas.setAttribute('aria-hidden', 'true');
let figure = null, renderer, scene, camera, mood = 'idle', busy = false, target = null, shown = false, last = 0, turn = 0.35;

async function start(model) {
  const data = await loadBody();
  if (!figure) {
    document.body.appendChild(canvas);
    renderer = makeRenderer(canvas);
    scene = new THREE.Scene();
    lights(scene);
    camera = new THREE.PerspectiveCamera(22, 1, 0.1, 20);
    figure = new Figure(data, model.skin_tone, model.sex === 'female', 'toon');
    scene.add(figure.group);
    requestAnimationFrame(frame);
    figure.play('wave', 2200);
  }
  figure.female = model.sex === 'female';
  figure.tone.set(model.skin_tone);
  figure.setShape(shapeFor(data, shapeInputs(model, 'now')));
}

// The pose that fits where the companion is and what is going on.
function resting() {
  const sitting = target && target.dataset.mascot === 'sit';
  if (busy) return sitting ? 'sitbusy' : 'squat';
  if (mood === 'cheer') return 'cheer';
  if (mood === 'sleepy') return 'slump';
  return sitting ? 'sit' : 'idle';
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  target = document.querySelector('[data-mascot]');
  if (!target || !figure.shape) { if (shown) { canvas.style.opacity = 0; shown = false; } return; }
  const box = target.getBoundingClientRect();
  const sitting = target.dataset.mascot === 'sit';
  const size = Number(target.dataset.size) || 64; // figure height in CSS pixels
  const FRAME = 1.5, CENTRE = 0.6; // the camera sees 1.5 figure-heights, centred a little above the waist
  const w = Math.round(size * FRAME * 1.05), h = Math.round(size * FRAME);
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  // Where a given height on the figure lands in the canvas, in pixels from its top.
  const at = (height) => h * (0.5 - (height - CENTRE) / FRAME);
  // Standing: feet on the bottom edge of the marked box, centred. Sitting: seat on its edge, legs over the front.
  const x = sitting ? box.right - w / 2 - size * 0.32 : box.left + box.width / 2 - w / 2;
  const y = sitting ? box.bottom - at(figure.seat) : box.bottom - at(0);
  canvas.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (!shown) { canvas.style.opacity = 1; shown = true; }
  mood = target.dataset.mood || 'idle';
  if (!figure.until) figure.pose = resting();
  figure.after = resting();
  turn += ((sitting ? -0.5 : 0.3) - turn) * Math.min(1, dt * 4);
  figure.group.rotation.y = turn + Math.sin(now / 2600) * 0.12;
  const view = FRAME / (2 * Math.tan((camera.fov * Math.PI) / 360)); // distance at which the frame fills the height
  camera.position.set(0, CENTRE, view); camera.lookAt(0, CENTRE, 0);
  figure.update(now, dt);
  renderer.render(scene, camera);
}

export const mascot = {
  shape(model) { if (model) start(model).catch(() => {}); },
  react(pose, ms = 900) { if (figure) figure.play(pose, ms, resting()); },
  busy(on) { busy = on; },
};
