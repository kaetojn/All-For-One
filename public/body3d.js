// The Body tab's viewer: the figure on a turntable. Drag sideways to turn, drag up and down to
// look higher or lower, pinch or scroll to zoom in on detail.

import { THREE, loadBody, shapeFor, Figure, lights, makeRenderer } from '/figure.js';

// The inputs for a shape: tape measurements where they exist, body weight for everything else.
export function shapeInputs(model, which) {
  const goal = which === 'goal' && model.goal;
  const known = new Set([...model.measured, ...(goal ? Object.keys(model.overrides) : [])]);
  const from = goal ? model.goal : model.current;
  return {
    height_cm: model.height_cm, weight_kg: goal ? model.target_weight_kg || model.weight_kg : model.weight_kg,
    measurements: Object.fromEntries([...known].filter((s) => from[s]).map((s) => [s, from[s]])),
    muscle: goal ? Math.min(0.15 + 0.08 * model.areas.length, 0.45) : 0,
  };
}

export async function mountBody(canvas, model, which, style = 'shaded') {
  const data = await loadBody(model.sex);
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  lights(scene);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  const figure = new Figure(data, model.skin_tone);
  figure.setShape(shapeFor(data, shapeInputs(model, which)));
  figure.setStyle(style);
  scene.add(figure.group);

  let yaw = 0.45, look = 0.47, dist = 2.75, touched = false, alive = true, last = performance.now();
  function frame(now) {
    if (!alive || !canvas.isConnected) { renderer.dispose(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (!touched) yaw += dt * 0.25;
    figure.group.rotation.y = yaw;
    camera.position.set(0, look + 0.08, dist); camera.lookAt(0, look, 0);
    figure.update(now, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const pointers = new Map();
  let pinch = 0;
  const zoom = (k) => { dist = Math.max(0.75, Math.min(3.2, dist * k)); };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e); touched = true; });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) { yaw += (e.clientX - prev.clientX) * 0.012; look = Math.max(0.08, Math.min(0.95, look + (e.clientY - prev.clientY) * 0.0016 * dist)); }
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch) zoom(pinch / d); pinch = d; }
  });
  const up = (e) => { pointers.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); touched = true; zoom(1 + e.deltaY * 0.0012); }, { passive: false });

  return {
    show(nextModel, nextWhich, animate = true) { const shape = shapeFor(data, shapeInputs(nextModel, nextWhich)); figure.setShape(shape, animate); if (nextWhich === 'goal') figure.play('flex', 1600); return shape; },
    tone(hex) { figure.setTone(hex); },
    style(next) { figure.setStyle(next); },
    destroy() { alive = false; },
  };
}
