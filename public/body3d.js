// The 3D body: a mannequin whose shape comes from tape measurements, drawn with plain WebGL.
// Each body part is a stack of elliptical rings; a ring's size is a measured circumference.
// Drag to rotate, pinch or scroll to zoom. No library, so nothing extra to download.

const SIDES = 28;
const TAU = Math.PI * 2;

// Ellipse half-width for a circumference c and a depth-to-width ratio q.
const half = (c, q) => c / (TAU * Math.sqrt((1 + q * q) / 2));

// rings: [y, circumference, depth ratio, centre x, centre z], all as fractions of height
function rings(m, female) {
  const s = (k) => m[k] / m.height;
  const hipW = half(s('hips'), 0.78);
  const shW = half(s('shoulders'), 0.46);
  const legX = hipW * 0.52;
  const armTop = shW - half(s('bicep'), 1) * 0.15;
  const torso = [
    [0.468, 0, 1, 0, 0], [0.475, s('hips') * 0.9, 0.76, 0, 0], [0.52, s('hips'), 0.78, 0, -0.004], [0.575, s('belly'), 0.84, 0, 0.004],
    [0.63, s('waist'), 0.8, 0, 0.002], [0.68, (s('waist') + s('chest')) / 2, 0.76, 0, 0.002], [0.73, s('chest'), female ? 0.8 : 0.72, 0, female ? 0.008 : 0.004],
    [0.775, s('shoulders') * 0.94, 0.5, 0, 0], [0.812, s('shoulders') * 0.9, 0.46, 0, 0], [0.832, s('shoulders') * 0.62, 0.6, 0, 0], [0.845, s('neck') * 1.35, 0.8, 0, 0], [0.87, s('neck'), 0.92, 0, 0.002], [0.885, s('neck') * 0.98, 0.95, 0, 0.004],
  ];
  const head = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; head.push([0.935 - Math.cos(a) * 0.066, Math.sin(a) * 0.335, 1.12, 0, 0.008]); }
  const leg = (side) => [
    [0.5, s('thigh') * 0.86, 0.95, side * legX * 0.9, 0], [0.455, s('thigh'), 0.98, side * legX, 0], [0.39, s('thigh') * 0.88, 1, side * legX, 0],
    [0.3, s('thigh') * 0.66, 1, side * legX * 0.98, 0], [0.275, s('calf') * 1.02, 1, side * legX * 0.97, 0], [0.215, s('calf'), 1.05, side * legX * 0.96, -0.004],
    [0.12, s('calf') * 0.7, 1, side * legX * 0.95, 0], [0.05, s('calf') * 0.58, 1, side * legX * 0.95, 0], [0.022, s('calf') * 0.74, 1.9, side * legX * 0.95, 0.028], [0, s('calf') * 0.66, 2.1, side * legX * 0.95, 0.034], [0, 0, 1, side * legX * 0.95, 0.034],
  ];
  const arm = (side) => {
    const x = (y) => side * (armTop + (0.8 - y) * 0.12);
    return [
      [0.815, 0, 1, x(0.815), 0], [0.805, s('bicep') * 0.95, 1, x(0.805), 0], [0.77, s('bicep') * 1.05, 1, x(0.77), 0], [0.7, s('bicep'), 0.98, x(0.7), 0],
      [0.625, s('forearm') * 0.94, 1, x(0.625), 0], [0.585, s('forearm'), 0.95, x(0.585), 0.004], [0.5, s('forearm') * 0.64, 0.8, x(0.5), 0.01],
      [0.47, s('forearm') * 0.68, 0.5, x(0.47), 0.012], [0.425, s('forearm') * 0.5, 0.45, x(0.425), 0.014], [0.418, 0, 1, x(0.418), 0.014],
    ];
  };
  return [torso, head, leg(-1), leg(1), arm(-1), arm(1)];
}

function build(m, female) {
  const pos = [], idx = [];
  for (const listed of rings(m, female)) {
    // Rings must run bottom to top so every surface faces outward and catches the light.
    const part = listed[0][0] > listed[listed.length - 1][0] ? [...listed].reverse() : listed;
    const base = pos.length / 3;
    for (const [y, c, q, cx, cz] of part) {
      const rx = half(c, q), rz = rx * q;
      for (let i = 0; i < SIDES; i++) { const a = (i / SIDES) * TAU; pos.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz); }
    }
    for (let r = 0; r < part.length - 1; r++) for (let i = 0; i < SIDES; i++) {
      const a = base + r * SIDES + i, b = base + r * SIDES + ((i + 1) % SIDES), c = a + SIDES, d = b + SIDES;
      idx.push(a, c, b, b, c, d);
    }
  }
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const k of [a, b, c]) { nor[k] += n[0]; nor[k + 1] += n[1]; nor[k + 2] += n[2]; }
  }
  return { pos: new Float32Array(pos), nor, idx: new Uint16Array(idx) };
}

const VS = `attribute vec3 p; attribute vec3 n; uniform mat4 mvp; uniform mat4 rot; varying vec3 vn;
void main() { vn = (rot * vec4(normalize(n), 0.0)).xyz; gl_Position = mvp * vec4(p, 1.0); }`;
const FS = `precision mediump float; varying vec3 vn; uniform vec3 tone;
void main() { vec3 n = normalize(vn); float key = max(dot(n, normalize(vec3(0.45, 0.6, 0.75))), 0.0); float fill = max(dot(n, normalize(vec3(-0.6, 0.2, 0.5))), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.5); vec3 c = tone * (0.42 + 0.5 * key + 0.16 * fill) + vec3(0.12) * rim; gl_FragColor = vec4(c, 1.0); }`;

const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const rotY = (t) => new Float32Array([Math.cos(t), 0, -Math.sin(t), 0, 0, 1, 0, 0, Math.sin(t), 0, Math.cos(t), 0, 0, 0, 0, 1]);
const rotX = (t) => new Float32Array([1, 0, 0, 0, 0, Math.cos(t), Math.sin(t), 0, 0, -Math.sin(t), Math.cos(t), 0, 0, 0, 0, 1]);
const move = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const persp = (fov, aspect, near, far) => { const f = 1 / Math.tan(fov / 2); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]); };
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export function mountBody(canvas, start) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!gl) return null;
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
  const buffers = { pos: gl.createBuffer(), nor: gl.createBuffer(), idx: gl.createBuffer() };
  const loc = { p: gl.getAttribLocation(prog, 'p'), n: gl.getAttribLocation(prog, 'n'), mvp: gl.getUniformLocation(prog, 'mvp'), rot: gl.getUniformLocation(prog, 'rot'), tone: gl.getUniformLocation(prog, 'tone') };
  gl.enable(gl.DEPTH_TEST);

  let shape = { ...start.measurements, height: start.height }, from = shape, to = shape, t0 = 0;
  let tone = rgb(start.tone), female = start.female, count = 0;
  let yaw = 0.5, pitch = 0.08, dist = 2.35, touched = false, alive = true;

  function upload(m) {
    const mesh = build(m, female);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.nor); gl.bufferData(gl.ARRAY_BUFFER, mesh.nor, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc.n); gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.DYNAMIC_DRAW);
    count = mesh.idx.length;
  }
  upload(shape);

  function frame(now) {
    if (!alive || !canvas.isConnected) return;
    if (from !== to) {
      const k = Math.min(1, (now - t0) / 600), e = k * k * (3 - 2 * k);
      shape = Object.fromEntries(Object.keys(to).map((key) => [key, from[key] + (to[key] - from[key]) * e]));
      upload(shape);
      if (k === 1) from = to;
    }
    if (!touched) yaw += 0.004;
    const w = canvas.clientWidth * devicePixelRatio, h = canvas.clientHeight * devicePixelRatio;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const rot = mul(rotX(pitch), rotY(yaw));
    gl.uniformMatrix4fv(loc.mvp, false, mul(persp(0.5, w / h, 0.1, 20), mul(move(0, 0, -dist), mul(rot, move(0, -0.5, 0)))));
    gl.uniformMatrix4fv(loc.rot, false, rot); gl.uniform3fv(loc.tone, tone);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e); touched = true; });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) { yaw += (e.clientX - prev.clientX) * 0.01; pitch = Math.max(-0.5, Math.min(0.6, pitch + (e.clientY - prev.clientY) * 0.006)); }
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch) dist = Math.max(0.9, Math.min(3.4, dist * (pinch / d))); pinch = d; }
  });
  const up = (e) => { pointers.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); touched = true; dist = Math.max(0.9, Math.min(3.4, dist * (1 + e.deltaY * 0.0012))); }, { passive: false });

  return {
    morph(measurements) { from = shape; to = { ...measurements, height: start.height }; t0 = performance.now(); },
    tone(hex) { tone = rgb(hex); },
    destroy() { alive = false; },
  };
}
