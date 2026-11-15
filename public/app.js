// All For One web app. No build step and no dependencies: this file is served as written.
// The server stores metric values; this file converts for display when the profile says imperial.
//
// Design rules this file follows:
//   - One anchor on the home screen (today's workout). Everything else opens on tap.
//   - Logging is confirm-not-type: values come pre-filled and one tap completes an exercise.
//   - Extra screens unlock as the habit forms (see `unlocks` from the server).

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const state = {
  data: null, tab: 'today', view: 'tabs', history: null, targets: null, plan: null, authError: '',
  session: null, open: null, result: null, finish: { effort: null, feeling: null },
  intro: { step: 0, units: 'metric', equipment: [] },
};

const SITES = ['neck', 'shoulders', 'chest', 'waist', 'belly', 'hips', 'bicep', 'forearm', 'thigh', 'calf'];
const AREAS = ['abs', 'waist', 'chest', 'shoulders', 'back', 'arms', 'glutes', 'legs', 'calf'];
const ACTIVITY = {
  sedentary: 'Mostly sitting, little exercise', light: '1 to 3 workouts a week', moderate: '3 to 5 workouts a week',
  active: '6 to 7 workouts a week', very_active: 'Physical job plus training',
};
const GOALS = { fat_loss: ['Lose fat', 'Lean out while keeping muscle'], strength: ['Get stronger', 'Heavier lifts, fewer reps'], consistency: ['Be consistent', 'Build the habit first'], general_health: ['General health', 'Feel better, move more'] };
const LEVELS = { beginner: ['New to this', 'Little or no training lately'], intermediate: ['Some experience', 'I know the basic movements'], advanced: ['Experienced', 'I train regularly'] };
const KIT = { dumbbell: 'Dumbbells', barbell: 'Barbell', kettlebells: 'Kettlebells', bands: 'Bands', cable: 'Cables', machine: 'Machines', other: 'Pull-up or dip bars', 'e-z curl bar': 'EZ bar', 'exercise ball': 'Exercise ball', 'medicine ball': 'Medicine ball', 'foam roll': 'Foam roller' };
const FEELINGS = ['Strong', 'Good', 'Tired', 'Sore', 'Drained'];
const EFFORT = ['', 'Very easy', 'Easy', 'Easy', 'Comfortable', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'All out'];
const UNLOCK_AT = { trends: 3, body: 7, fine_tuning: 14 };
const LB = 2.20462;
const IN = 2.54;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const imperial = () => (state.data?.profile?.onboarded_at ? state.data.profile.units : state.intro.units) === 'imperial';
const r1 = (n) => Math.round(n * 10) / 10;
const wUnit = () => (imperial() ? 'lb' : 'kg');
const lUnit = () => (imperial() ? 'in' : 'cm');
const wOut = (kg) => (kg == null ? '' : r1(imperial() ? kg * LB : kg));
const wIn = (v) => (v === '' || v == null ? null : imperial() ? Number(v) / LB : Number(v));
const lOut = (cm) => (cm == null ? '' : r1(imperial() ? cm / IN : cm));
const lIn = (v) => (v === '' || v == null ? null : imperial() ? Number(v) * IN : Number(v));
const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

let toastTimer;
function toast(message) {
  $toast.textContent = message;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2800);
}

async function load() {
  state.data = await api('GET', '/api/state');
  const d = state.data;
  if (d.signed_in) {
    if (!d.profile.onboarded_at) state.view = 'intro';
    else if (state.view === 'intro') state.view = 'tabs';
    if (state.view === 'tabs' && state.tab === 'progress') state.history = await api('GET', '/api/history?days=90');
    if (state.view === 'tabs' && state.tab === 'plan') [state.targets, state.plan] = await Promise.all([api('GET', '/api/targets'), api('GET', '/api/plan').then((r) => r.plan)]);
    if (state.view === 'workout') state.session = d.workout.active;
  }
  render();
}

// Run a save, then reload and say what happened. Errors show as a toast instead of failing silently.
async function save(work, message) {
  try {
    const out = await work();
    await load();
    if (message) toast(typeof message === 'function' ? message(out) : message);
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- Ember, the mascot ---------- */
// An original character: a small flame that grows with your streak and dozes when it hasn't been fed today.

const EMBER_SIZE = { spark: 60, ember: 76, flame: 90, blaze: 102, bonfire: 114, beacon: 124 };

function ember(stage = 'ember', mood = 'happy', size) {
  const px = size || EMBER_SIZE[stage] || 76;
  const big = ['blaze', 'bonfire', 'beacon'].includes(stage);
  const bright = ['bonfire', 'beacon'].includes(stage);
  const eyes = mood === 'sleepy'
    ? '<path d="M43 97q5 4 10 0M67 97q5 4 10 0" fill="none" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/>'
    : mood === 'cheer'
      ? '<path d="M43 99q5-8 10 0M67 99q5-8 10 0" fill="none" stroke="#3a2418" stroke-width="2.8" stroke-linecap="round"/>'
      : '<ellipse cx="48" cy="96" rx="4" ry="5.4" fill="#3a2418"/><ellipse cx="72" cy="96" rx="4" ry="5.4" fill="#3a2418"/><circle cx="49.4" cy="94" r="1.4" fill="#fff"/><circle cx="73.4" cy="94" r="1.4" fill="#fff"/>';
  const mouth = mood === 'cheer'
    ? '<path d="M53 106q7 10 14 0z" fill="#3a2418"/>'
    : mood === 'sleepy'
      ? '<path d="M56 109h8" stroke="#3a2418" stroke-width="2.4" stroke-linecap="round"/>'
      : '<path d="M53 107q7 7 14 0" fill="none" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/>';
  return `<svg class="ember ${stage} ${mood}" width="${px}" height="${Math.round(px * 1.17)}" viewBox="0 0 120 140" role="img" aria-label="Ember, your flame">
    <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9c45c"/><stop offset=".55" stop-color="#f58a3c"/><stop offset="1" stop-color="#e9552f"/></linearGradient></defs>
    ${stage === 'beacon' ? '<circle cx="60" cy="88" r="56" fill="#f7b34c" opacity=".16"/>' : ''}
    ${big ? '<g class="side"><path d="M24 78c-10 10-12 28-2 40 2-14 8-20 2-40z" fill="#f7b34c"/><path d="M96 78c10 10 12 28 2 40-2-14-8-20-2-40z" fill="#f7b34c"/></g>' : ''}
    <path class="body" d="M60 8c10 26 40 44 40 80 0 26-18 44-40 44S20 114 20 88c0-22 14-32 22-48 4 12 10 14 12 4 2-12 2-24 6-36z" fill="url(#eg)"/>
    <path class="core" d="M60 62c8 14 20 22 20 38 0 14-9 24-20 24s-20-10-20-24c0-14 12-22 20-38z" fill="#fde2a2"/>
    ${eyes}${mouth}
    <circle cx="39" cy="105" r="4.2" fill="#f0623a" opacity=".35"/><circle cx="81" cy="105" r="4.2" fill="#f0623a" opacity=".35"/>
    ${bright ? '<g fill="#f7b34c"><circle class="twinkle" cx="14" cy="40" r="3"/><circle class="twinkle" cx="106" cy="30" r="2.4" style="animation-delay:.6s"/><circle class="twinkle" cx="98" cy="62" r="2" style="animation-delay:1.1s"/></g>' : ''}
  </svg>`;
}

const segments = (done, goal) => {
  const total = Math.max(goal || 0, done, 1);
  return `<div class="segments" role="img" aria-label="${done} of ${goal || total} done">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? (i >= (goal || total) ? 'extra' : 'on') : ''}"></i>`).join('')}</div>`;
};

const demo = (id, thumb) => `<div class="demo${thumb ? ' thumb' : ''}"><img src="/exercises/${id}/0.webp" alt="" loading="lazy"><img src="/exercises/${id}/1.webp" alt="" loading="lazy"></div>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const dose = (x) => `${x.sets} × ${x.reps}${x.weight_kg ? ` · ${wOut(x.weight_kg)} ${wUnit()}` : ''}`;

/* ---------- sign-in and first run ---------- */

function authScreen() {
  const claim = state.data.can_sign_up;
  return `<div class="auth-page"><main class="auth-card fade">
    <div class="row"><div class="fit">${ember('flame', 'happy', 64)}</div><div><h1>All For One</h1><p class="muted">${claim ? 'Create your account to claim this app. Sign-up closes after that.' : 'Welcome back.'}</p></div></div>
    ${state.authError ? `<p class="error">${esc(state.authError)}</p>` : ''}
    <form id="auth" data-mode="${claim ? 'signup' : 'login'}">
      <label>Email<input name="email" type="email" autocomplete="username" required></label>
      <label>Password${claim ? ' (10 characters or more)' : ''}<input name="password" type="password" autocomplete="${claim ? 'new-password' : 'current-password'}" minlength="${claim ? 10 : 1}" required></label>
      <button class="primary">${claim ? 'Create account' : 'Sign in'}</button>
    </form>
  </main></div>`;
}

function introScreen() {
  const s = state.intro;
  const pick = (key, map) => `<div class="options">${Object.entries(map).map(([k, [title, sub]]) => `<button data-action="intro-pick" data-key="${key}" data-value="${k}" aria-pressed="${s[key] === k}">${title}<small>${sub}</small></button>`).join('')}</div>`;
  const chips = (key, list, label) => `<div class="chips">${list.map((v) => `<button data-action="intro-set" data-key="${key}" data-value="${v}" aria-pressed="${s[key] === v}">${label(v)}</button>`).join('')}</div>`;
  const steps = [
    () => `<h1>What matters most right now?</h1>${pick('primary_goal', GOALS)}`,
    () => `<h1>Where are you starting from?</h1>${pick('fitness_level', LEVELS)}`,
    () => `<h1>How much time do you have?</h1>
      <div class="stack"><h3>Per workout</h3>${chips('minutes', [20, 30, 45, 60], (v) => `${v} min`)}</div>
      <div class="stack"><h3>Workouts a week</h3>${chips('days_per_week', [2, 3, 4, 5, 6], (v) => v)}</div>
      <button class="go" data-action="intro-next" ${s.minutes && s.days_per_week ? '' : 'disabled'}>Next</button>`,
    () => `<h1>What can you train with?</h1><p class="muted">Pick everything you have. Bodyweight is always included.</p>
      <div class="chips">${Object.entries(KIT).map(([k, v]) => `<button data-action="intro-kit" data-value="${k}" aria-pressed="${s.equipment.includes(k)}">${v}</button>`).join('')}</div>
      <button class="go" data-action="intro-next">${s.equipment.length ? 'Next' : 'Just bodyweight'}</button>`,
    () => `<h1>Last thing: a few numbers</h1><p class="muted">These set your calorie and body-fat maths. Nothing else uses them.</p>
      <form id="intro" class="stack">
        <div class="choice"><button type="button" data-action="intro-units" data-value="metric" aria-pressed="${s.units === 'metric'}">kg and cm</button><button type="button" data-action="intro-units" data-value="imperial" aria-pressed="${s.units === 'imperial'}">lb and inches</button></div>
        <label>Sex, for the formulas<select name="sex" required><option value="" selected disabled>Choose</option><option value="male">Male</option><option value="female">Female</option></select></label>
        <div class="split"><label>Birth year<input name="birth_year" inputmode="numeric" required placeholder="1990"></label><label>Height (${lUnit()})<input name="height" inputmode="decimal" required></label></div>
        <label>Weight today (${wUnit()})<input name="weight" inputmode="decimal" required></label>
        <button class="go">Build my plan</button>
      </form>`,
  ];
  return `<div class="shell bare fade">
    <div class="bar-top">${s.step ? '<button class="link fit" data-action="intro-back">Back</button>' : ''}${segments(s.step + 1, steps.length)}</div>
    <div class="hello">${ember('ember', 'happy', 56)}<p>${['Hi, I\'m Ember. Five quick questions and you\'re in.', 'Got it.', 'No wrong answers here.', 'Nearly there.', 'Then I\'ll build your first week.'][s.step]}</p></div>
    ${steps[s.step]()}
  </div>`;
}

/* ---------- today ---------- */

function greeting(d) {
  const s = d.streak;
  if (d.workout.done_today) return ['cheer', 'Workout done. I\'m glowing.'];
  if (!s.checked_in_today && s.days === 0) return ['sleepy', 'Wake me up with a check-in.'];
  if (s.days >= 3) return ['happy', `${s.days} days in a row. Keep me lit.`];
  if (s.checked_in_today) return ['happy', 'Checked in today. Nice.'];
  return ['happy', 'Ready when you are.'];
}

function anchor(d) {
  const w = d.workout;
  if (w.active) {
    const done = w.active.items.filter((i) => i.done).length;
    return `<section class="card anchor"><h3>In progress</h3><p class="title">${esc(w.active.day_name)}</p>${segments(done, w.active.items.length)}
      <button class="go" data-action="resume">Continue · ${done} of ${w.active.items.length} done</button></section>`;
  }
  if (w.done_today) {
    return `<section class="card anchor done"><h3>Today</h3><p class="title">${esc(w.done_today.day_name)} done</p><p class="win">${esc(w.done_today.win)}</p>
      ${w.done_today.effort_meaning ? `<p class="muted small">Effort ${w.done_today.effort} of 10: ${esc(w.done_today.effort_meaning)}</p>` : ''}
      ${w.next ? `<p class="muted small">Next up: ${esc(w.next.name)}</p>` : ''}</section>`;
  }
  if (!w.next) return `<section class="card anchor"><h3>Today</h3><p class="title">No plan yet</p><button class="go" data-action="rebuild">Build my plan</button></section>`;
  if (w.week.goal && w.week.done >= w.week.goal) {
    return `<section class="card anchor rest"><h3>Today</h3><p class="title">Rest day</p><p>You've done all ${w.week.goal} workouts this week. Recovery is part of the plan.</p>
      <button class="link fit" data-action="start">Do a bonus session: ${esc(w.next.name)}</button></section>`;
  }
  return `<section class="card anchor"><h3>Today's workout</h3><p class="title">${esc(w.next.name)}</p>
    <p class="muted">${w.next.exercises.length} exercises · about ${w.next.minutes} min</p>
    <button class="go" data-action="start">Start</button></section>`;
}

function todayScreen() {
  const d = state.data;
  const log = d.today_log || {};
  const t = d.target;
  const [mood, line] = greeting(d);
  const checkSummary = log.target_met === true ? 'On target' : log.target_met === false ? 'Missed today' : log.calories != null ? `${log.calories} kcal` : 'Not logged';
  const pct = t && log.calories != null ? Math.min(100, Math.round((log.calories / t.calories) * 100)) : 0;
  const note = t && t.set_by === 'claude' && t.reason ? `<div class="note"><b>Coach's note</b><span>${esc(t.reason)}</span></div>` : '';
  return `<div class="hello">${ember(d.streak.stage, mood)}<div><h1>${d.streak.days ? `Day ${d.streak.days}` : 'Today'}</h1><p>${line}</p></div></div>
    <div class="stack" style="gap:8px"><div class="row"><h3>This week</h3><span class="muted small fit">${d.workout.week.done}${d.workout.week.goal ? ` of ${d.workout.week.goal}` : ''} workouts</span></div>${segments(d.workout.week.done, d.workout.week.goal)}</div>
    ${anchor(d)}
    <details class="card" data-keep="check" ${state.open === 'check' ? 'open' : ''}>
      <summary>Food check<span>${checkSummary}</span></summary>
      <div class="inside">
        ${t ? `<div class="stack" style="gap:6px"><div class="row"><b>${t.calories} kcal target</b><span class="muted small fit">${log.calories != null ? `${Math.max(0, t.calories - log.calories)} left` : ''}</span></div><div class="meter"><i style="width:${pct}%"></i></div></div>` : '<p class="muted small">Set a goal in Plan to get a calorie target.</p>'}
        ${note}
        <div class="choice">
          <button data-action="met" data-value="1" aria-pressed="${log.target_met === true}">On target</button>
          <button data-action="met" data-value="0" aria-pressed="${log.target_met === false}">Missed it</button>
        </div>
        <form id="day" class="split">
          <label>Calories<input name="calories" inputmode="numeric" value="${log.calories ?? ''}" placeholder="optional"></label>
          <label>Protein (g)<input name="protein_g" inputmode="numeric" value="${log.protein_g ?? ''}" placeholder="optional"></label>
          <button style="grid-column:1/-1">Save numbers</button>
        </form>
      </div>
    </details>
    <details class="card" data-keep="weight" ${state.open === 'weight' ? 'open' : ''}>
      <summary>Weight<span>${d.latest.weight ? `${wOut(d.latest.weight.kg)} ${wUnit()} · ${niceDate(d.latest.weight.date)}` : 'Not logged'}</span></summary>
      <div class="inside"><form id="weight" class="row">
        <label>Today (${wUnit()})<input name="weight" inputmode="decimal" required value="${d.latest.weight && d.latest.weight.date !== d.today ? wOut(d.latest.weight.kg) : ''}" placeholder="${d.latest.weight ? wOut(d.latest.weight.kg) : ''}"></label>
        <button class="primary fit" style="align-self:end">Log</button>
      </form><p class="muted small">Same as last time? Just tap Log.</p></div>
    </details>`;
}

/* ---------- workout ---------- */

function stepper(label, field, value, position) {
  return `<div class="stepper"><span>${label}</span><div><button data-action="step" data-field="${field}" data-dir="-1" data-pos="${position}" aria-label="Less ${label}">−</button><b>${value}</b><button data-action="step" data-field="${field}" data-dir="1" data-pos="${position}" aria-label="More ${label}">+</button></div></div>`;
}

function workoutScreen() {
  const s = state.session;
  const done = s.items.filter((i) => i.done).length;
  return `<div class="shell bare">
    <div class="bar-top"><button class="link fit" data-action="leave">Back</button>${segments(done, s.items.length)}<span class="muted small fit">${done}/${s.items.length}</span></div>
    <h1>${esc(s.day_name)}</h1>
    <p class="muted small" style="margin-top:-8px">Tap the circle when an exercise is done. Tap its name to see how.</p>
    ${s.items.map((x) => `<div class="exercise ${x.done ? 'done' : ''}">
      ${demo(x.exercise_id, true)}
      <button class="what" data-action="open" data-pos="${x.position}" aria-expanded="${state.open === x.position}"><b>${esc(x.name)}</b><span>${dose(x)}</span></button>
      <button class="tick" data-action="tick" data-pos="${x.position}" aria-pressed="${x.done}" aria-label="${x.done ? 'Undo' : 'Mark done'}: ${esc(x.name)}">${CHECK}</button>
      ${state.open === x.position ? `<div class="more fade">
        ${demo(x.exercise_id)}
        <div class="steppers">${stepper('Sets', 'sets', x.sets, x.position)}${stepper('Reps', 'reps', x.reps, x.position)}${stepper(wUnit(), 'weight', x.weight_kg ? wOut(x.weight_kg) : '–', x.position)}</div>
        <ol class="steps">${x.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      </div>` : ''}
    </div>`).join('')}
    <button class="go sticky" data-action="to-finish">${done === s.items.length ? 'Finish workout' : done ? `Finish with ${done} of ${s.items.length}` : 'Finish'}</button>
    <button class="link" data-action="cancel-workout">Discard this workout</button>
  </div>`;
}

function finishScreen() {
  const f = state.finish;
  return `<div class="shell bare fade">
    <div class="bar-top"><button class="link fit" data-action="resume">Back</button></div>
    <h1>How hard was that?</h1>
    <div class="scale">${Array.from({ length: 10 }, (_, i) => `<button data-action="effort" data-value="${i + 1}" aria-pressed="${f.effort === i + 1}">${i + 1}</button>`).join('')}</div>
    <p class="muted">${f.effort ? EFFORT[f.effort] : '1 is a stroll, 10 is everything you had.'}</p>
    <h2>How do you feel?</h2>
    <div class="chips">${FEELINGS.map((v) => `<button data-action="feeling" data-value="${v}" aria-pressed="${f.feeling === v}">${v}</button>`).join('')}</div>
    <button class="go" data-action="finish">Save</button>
    <button class="link" data-action="finish" data-skip="1">Skip</button>
  </div>`;
}

function celebrateScreen() {
  const r = state.result;
  const sparks = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return `<i style="--x:${Math.round(Math.cos(a) * (110 + (i % 3) * 30))}px;--y:${Math.round(Math.sin(a) * (110 + (i % 3) * 30))}px"></i>`; }).join('');
  return `<div class="celebrate"><div class="sparks" aria-hidden="true">${sparks}</div>
    ${ember(state.data.streak.stage, 'cheer', 132)}
    <h1>${esc(r.win)}</h1>
    <div style="width:220px">${segments(r.week.done, r.week.goal)}</div>
    ${r.effort_meaning ? `<p class="muted">${esc(r.effort_meaning)}</p>` : ''}
    <button class="go" data-action="home" style="min-width:200px">Done</button>
  </div>`;
}

/* ---------- progress ---------- */

function locked(key, title, text) {
  const have = state.data.streak.active_days;
  const need = UNLOCK_AT[key];
  return `<section class="card locked">${ember('spark', 'sleepy', 56)}<h2>${title}</h2><p class="muted">${text}</p>
    <div style="width:100%;max-width:220px">${segments(Math.min(have, need), need)}</div>
    <p class="muted small">${have} of ${need} check-in days. Any workout, food check or weigh-in counts.</p></section>`;
}

function chart(points, goal) {
  if (points.length < 2) return `<p class="muted small">Log weight on two or more days to see your trend.</p>`;
  const W = 320, H = 150, L = 34, R = 10, T = 12, B = 22;
  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.v);
  let lo = Math.min(...ys, goal ?? Infinity), hi = Math.max(...ys, goal ?? -Infinity);
  const pad = Math.max(0.5, (hi - lo) * 0.12); lo -= pad; hi += pad;
  const x = (t) => L + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight from ${niceDate(points[0].date)} to ${niceDate(last.date)}: ${points[0].v} to ${last.v} ${wUnit()}">
    <text x="0" y="${y(hi - pad) + 4}">${r1(hi - pad)}</text><text x="0" y="${y(lo + pad) + 4}">${r1(lo + pad)}</text>
    ${goal != null ? `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke-dasharray="3 5" style="stroke:var(--good)"/><text x="${W - R}" y="${y(goal) - 5}" text-anchor="end" style="fill:var(--good)">goal ${goal}</text>` : ''}
    <path class="area" d="${path}L${x(xs[xs.length - 1]).toFixed(1)},${H - B}L${L},${H - B}Z"/><path class="line" d="${path}"/><circle cx="${x(xs[xs.length - 1])}" cy="${y(last.v)}" r="5.5"/>
    <text x="${L}" y="${H - 4}">${niceDate(points[0].date)}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${niceDate(last.date)}</text>
  </svg>`;
}

function progressScreen() {
  const d = state.data;
  const h = state.history;
  const head = `<h1 style="padding:4px 2px">Progress</h1>`;
  if (!d.unlocks.trends) return head + locked('trends', 'Trends unlock soon', 'Build a little history first, then your weight trend appears here.');
  if (!h) return head;
  const points = h.weights.map((w) => ({ date: w.date, v: wOut(w.kg) }));
  const goalW = d.suggested.target_weight_kg ? wOut(d.suggested.target_weight_kg) : null;
  const first = h.weights[0], last = h.weights[h.weights.length - 1];
  const change = first && last && first !== last ? r1(wOut(last.kg) - wOut(first.kg)) : null;
  const bf = d.latest.body_fat;
  const m = d.latest.measurements;
  const needs = d.profile.sex === 'female' ? 'neck, waist and hips' : 'neck and waist';
  const trend = change == null ? '' : change < 0 ? `Down ${-change} ${wUnit()} in 90 days.` : change > 0 ? `Up ${change} ${wUnit()} in 90 days.` : 'Holding steady.';
  return `${head}
    <section class="card">
      <div class="split">
        <div class="stat"><b>${last ? `${wOut(last.kg)} ${wUnit()}` : '–'}</b><span>Weight</span></div>
        <div class="stat"><b>${bf ? `${bf.pct}%` : '–'}</b><span>Body fat${bf ? ` · ${niceDate(bf.date)}` : ''}</span></div>
      </div>
      ${chart(points, goalW)}
      ${trend ? `<p class="win">${trend}</p>` : ''}
    </section>
    ${d.unlocks.body ? `<details class="card" data-keep="measure" ${state.open === 'measure' ? 'open' : ''}>
      <summary>Tape measurements<span>${bf ? `${bf.pct}% body fat` : 'Add neck and waist'}</span></summary>
      <div class="inside">
        <p class="muted small">Body fat comes from ${needs} plus your height. Fill in only what you measured today (${lUnit()}).</p>
        <form id="measure" class="split">
          ${SITES.map((s) => `<label>${cap(s)}<input name="${s}" inputmode="decimal" placeholder="${lOut(m[s]) || ''}"></label>`).join('')}
          <button class="primary" style="grid-column:1/-1">Save measurements</button>
        </form>
        ${h.body_fat.length > 1 ? `<h3>Body fat history</h3><div class="list">${h.body_fat.slice().reverse().map((p) => `<div><span>${niceDate(p.date)}</span><b>${p.pct}%</b></div>`).join('')}</div>` : ''}
      </div>
    </details>` : locked('body', 'Body measurements come next', 'Tape measurements and your body-fat number open up after a week of check-ins.')}
    ${h.weights.length ? `<details class="card"><summary>Weight entries<span>${h.weights.length}</span></summary><div class="inside"><div class="list">${h.weights.slice().reverse().slice(0, 30).map((w) => `<div><span>${niceDate(w.date)}</span><span><b>${wOut(w.kg)} ${wUnit()}</b> <button class="link" data-action="del-weight" data-date="${w.date}" aria-label="Delete weight for ${niceDate(w.date)}">Delete</button></span></div>`).join('')}</div></div></details>` : ''}`;
}

/* ---------- plan ---------- */

function planScreen() {
  const d = state.data;
  const g = d.goal;
  const s = d.suggested;
  const p = state.plan;
  const areas = new Set(g ? g.target_areas : []);
  const nextIndex = d.workout.next ? d.workout.next.day_index : -1;

  const days = p ? p.days.map((day, i) => `<details class="card" data-keep="day${i}" ${state.open === `day${i}` ? 'open' : ''}>
      <summary>${esc(day.name)}<span>${i === nextIndex ? 'Next · ' : ''}${day.exercises.length} exercises · ${day.minutes} min</span></summary>
      <div class="inside">${day.exercises.map((x) => `<div class="row"><div class="fit" style="width:64px">${demo(x.exercise_id, true)}</div><div><b>${esc(x.name)}</b><br><span class="muted small">${dose(x)} · ${esc(x.equipment)}</span></div></div>`).join('')}
        ${i !== nextIndex ? `<button data-action="start" data-day="${i}">Do this one today</button>` : ''}</div>
    </details>`).join('') : '';

  let target = '';
  if (!s.ready) target = `<p class="muted">Still needed: ${esc(s.missing.join(', '))}.</p>`;
  else if (!g) target = `<p class="muted">You maintain your weight at about ${s.maintenance} kcal a day. Set a goal above to get a target.</p>`;
  else {
    const weekly = s.weekly_change_kg ? `${s.weekly_change_kg > 0 ? '+' : ''}${wOut(s.weekly_change_kg)} ${wUnit()} a week` : 'holding steady';
    target = `<div class="split"><div class="stat"><b>${s.calories}</b><span>kcal a day · ${weekly}</span></div><div class="stat"><b>${s.maintenance}</b><span>kcal to maintain</span></div></div>
      ${s.target_weight_kg ? `<p class="muted small">Goal weight about ${wOut(s.target_weight_kg)} ${wUnit()}. Protein ${s.protein_g} g a day.</p>` : ''}
      ${s.missing ? `<p class="muted small">Still needed: ${esc(s.missing.join(', '))}.</p>` : ''}
      ${s.warnings.length ? `<div class="notice"><b>This pace is aggressive</b>${s.warnings.map((w) => `<span>${esc(w.message)}</span>`).join('')}${s.safer ? `<span>A safer plan is ${s.safer.calories} kcal a day, reaching the goal around ${niceDate(s.safer.target_date)} ${s.safer.target_date.slice(0, 4)}.</span>` : ''}</div>` : ''}
      <div class="row">${s.safer
        ? `<button class="primary" data-action="use-target" data-calories="${s.safer.calories}" data-reason="Safer pace than the timeline asks for">Use ${s.safer.calories}</button><button data-action="use-target" data-calories="${s.calories}" data-reason="Matches the goal timeline, set despite the pace warning">Use ${s.calories} anyway</button>`
        : `<button class="primary" data-action="use-target" data-calories="${s.calories}" data-reason="Matches the goal timeline">${d.target && d.target.calories === s.calories ? 'In use' : `Use ${s.calories} kcal`}</button>`}</div>
      ${d.unlocks.fine_tuning ? `<form id="custom-target" class="row"><label>Or set your own (kcal)<input name="calories" inputmode="numeric" required></label><button class="fit" style="align-self:end">Set</button></form>` : ''}`;
  }
  const hist = state.targets || [];
  const live = hist.find((x) => !x.reverted_at);
  return `<h1 style="padding:4px 2px">Plan</h1>
    ${p && p.set_by === 'claude' && p.reason ? `<div class="note"><b>Coach's note</b><span>${esc(p.reason)}</span></div>` : ''}
    <h3>Your week</h3>
    ${days || '<p class="muted">No plan yet.</p>'}
    <button class="link" data-action="rebuild">${p ? 'Rebuild the plan from my profile' : 'Build my plan'}</button>
    <h3>Goal</h3>
    <section class="card">
      <form id="goal" class="stack">
        <div class="split">
          <label>Target body fat (%)<input name="target_body_fat" inputmode="decimal" value="${g?.target_body_fat ?? ''}"></label>
          <label>Target weight (${wUnit()})<input name="target_weight" inputmode="decimal" value="${g?.target_weight_kg ? wOut(g.target_weight_kg) : ''}" placeholder="optional"></label>
        </div>
        <label>Reach it by<input name="target_date" type="date" value="${g?.target_date ?? ''}" min="${d.today}" required></label>
        <div class="stack" style="gap:8px"><span class="small muted" style="font-weight:600;font-size:.8rem">Areas to define</span><div class="chips" id="areas">${AREAS.map((a) => `<button type="button" data-action="area" data-area="${a}" aria-pressed="${areas.has(a)}">${cap(a === 'calf' ? 'calves' : a)}</button>`).join('')}</div></div>
        <button class="primary">${g ? 'Update goal' : 'Set goal'}</button>
      </form>
    </section>
    <h3>Calories</h3>
    <section class="card">${target}</section>
    ${hist.length ? `<details class="card"><summary>Target history<span>${hist.length}</span></summary><div class="inside"><div class="list">${hist.map((t) => `<div><span><b>${t.calories} kcal</b>${t.protein_g ? ` · ${t.protein_g} g protein` : ''}<br><span class="muted small">${niceDate(t.created_at.slice(0, 10))} · set by ${esc(t.set_by)}${t.reverted_at ? ' · undone' : ''}${t.reason ? `<br>${esc(t.reason)}` : ''}</span></span>${t === live ? '<button class="link fit" data-action="revert">Undo</button>' : ''}</div>`).join('')}</div></div></details>` : ''}`;
}

/* ---------- settings ---------- */

function settingsScreen() {
  const d = state.data;
  const p = d.profile;
  const url = `${location.origin}/mcp`;
  const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${Array.isArray(v) ? v[0] : v}</option>`).join('');
  return `<h1 style="padding:4px 2px">More</h1>
    <section class="card">
      <h3>Training</h3>
      <form id="training" class="stack">
        <div class="split"><label>Main goal<select name="primary_goal">${opt(GOALS, p.primary_goal)}</select></label><label>Level<select name="fitness_level">${opt(LEVELS, p.fitness_level)}</select></label></div>
        <div class="split"><label>Minutes per workout<input name="minutes" inputmode="numeric" value="${p.minutes ?? ''}" required></label><label>Workouts a week<input name="days_per_week" inputmode="numeric" value="${p.days_per_week ?? ''}" required></label></div>
        <div class="stack" style="gap:8px"><span class="small muted" style="font-weight:600;font-size:.8rem">Equipment you have</span><div class="chips" id="kit">${Object.entries(KIT).map(([k, v]) => `<button type="button" data-action="area" data-kit="${k}" aria-pressed="${p.equipment.includes(k)}">${v}</button>`).join('')}</div></div>
        <button class="primary">Save and rebuild plan</button>
      </form>
    </section>
    <section class="card">
      <h3>About you</h3>
      <form id="profile" class="stack">
        <label>Sex, used only for the body-fat and energy formulas<select name="sex" required><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
        <div class="split"><label>Birth year<input name="birth_year" inputmode="numeric" value="${p.birth_year ?? ''}" required></label><label>Height (${lUnit()})<input name="height" inputmode="decimal" value="${lOut(p.height_cm)}" required></label></div>
        <label>Day-to-day activity<select name="activity">${opt(ACTIVITY, p.activity)}</select></label>
        <div class="split"><label>Units<select name="units"><option value="metric" ${p.units === 'metric' ? 'selected' : ''}>kg and cm</option><option value="imperial" ${p.units === 'imperial' ? 'selected' : ''}>lb and inches</option></select></label>
          <label>Coach review<select name="review_cadence"><option value="weekly" ${p.review_cadence === 'weekly' ? 'selected' : ''}>Every week</option><option value="biweekly" ${p.review_cadence === 'biweekly' ? 'selected' : ''}>Every 2 weeks</option><option value="monthly" ${p.review_cadence === 'monthly' ? 'selected' : ''}>Every month</option></select></label></div>
        <button class="primary">Save</button>
      </form>
    </section>
    <section class="card">
      <label class="switch">Show everything now<input type="checkbox" data-action="show-all" ${p.show_all ? 'checked' : ''}></label>
      <p class="muted small">Trends, body measurements and fine-tuning normally open up after 3, 7 and 14 check-in days. Turn this on to skip the wait.</p>
    </section>
    <section class="card">
      <h3>Connect Claude</h3>
      <p class="small">In Claude, add a custom connector with this address, then sign in with your All For One email and password when asked.</p>
      <code>${esc(url)}</code>
      <button data-action="copy" data-text="${esc(url)}">Copy address</button>
    </section>
    <section class="card"><p class="muted small">Signed in as ${esc(d.user.email)}. Exercise photos are from the public-domain Free Exercise DB.</p><button data-action="logout">Sign out</button></section>`;
}

const TABS = { today: ['Today', todayScreen], progress: ['Progress', progressScreen], plan: ['Plan', planScreen], settings: ['More', settingsScreen] };

function render() {
  const d = state.data;
  if (!d) { $app.innerHTML = ''; return; }
  if (!d.signed_in) { $app.innerHTML = authScreen(); return; }
  if (state.view === 'intro') { $app.innerHTML = introScreen(); return; }
  if (state.view === 'workout' && state.session) { $app.innerHTML = workoutScreen(); return; }
  if (state.view === 'finish' && state.session) { $app.innerHTML = finishScreen(); return; }
  if (state.view === 'celebrate' && state.result) { $app.innerHTML = celebrateScreen(); return; }
  state.view = 'tabs';
  $app.innerHTML = `<div class="shell">${TABS[state.tab][1]()}</div>
    <nav class="tabs" aria-label="Sections">${Object.entries(TABS).map(([k, [label]]) => `<button data-tab="${k}" ${state.tab === k ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
}

/* ---------- events ---------- */

const values = (form) => Object.fromEntries(new FormData(form));
const numOrNull = (v) => (v === '' ? null : Number(v));
const streakLine = (base) => () => { const n = state.data.streak.days; return n > 1 ? `${base} ${n} days in a row.` : base; };

// Remember which quiet row is open, so it stays open when the screen redraws after a save.
document.addEventListener('toggle', (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.keep) return;
  if (el.open) state.open = el.dataset.keep;
  else if (state.open === el.dataset.keep) state.open = null;
}, true);

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const v = values(form);
  if (form.id === 'auth') {
    api('POST', form.dataset.mode === 'signup' ? '/api/signup' : '/api/login', v)
      .then(() => { state.authError = ''; return load(); })
      .catch((err) => { state.authError = err.message; render(); });
  } else if (form.id === 'intro') {
    const s = state.intro;
    save(() => api('POST', '/api/onboarding', { primary_goal: s.primary_goal, fitness_level: s.fitness_level, minutes: s.minutes, days_per_week: s.days_per_week, equipment: s.equipment, units: s.units, sex: v.sex, birth_year: Number(v.birth_year), height_cm: lIn(v.height), weight_kg: wIn(v.weight) }), 'Your first week is ready.');
  } else if (form.id === 'day') {
    save(() => api('POST', '/api/day', { calories: numOrNull(v.calories), protein_g: numOrNull(v.protein_g) }), streakLine('Logged.'));
  } else if (form.id === 'weight') {
    save(() => api('POST', '/api/weight', { kg: wIn(v.weight) }), streakLine('Weight logged.'));
  } else if (form.id === 'measure') {
    const out = {};
    for (const s of SITES) if (v[s] !== '') out[s] = lIn(v[s]);
    save(() => api('POST', '/api/measurements', { values: out }), 'Measurements saved.');
  } else if (form.id === 'goal') {
    const target_areas = [...form.querySelectorAll('#areas [aria-pressed="true"]')].map((b) => b.dataset.area);
    save(() => api('PUT', '/api/goal', { target_body_fat: numOrNull(v.target_body_fat), target_weight_kg: wIn(v.target_weight), target_date: v.target_date, target_areas }), 'Goal saved.');
  } else if (form.id === 'custom-target') {
    save(() => api('POST', '/api/target', { calories: Number(v.calories), protein_g: state.data.suggested.protein_g, reason: 'Set by hand' }), 'Target set.');
  } else if (form.id === 'training') {
    const equipment = [...form.querySelectorAll('#kit [aria-pressed="true"]')].map((b) => b.dataset.kit);
    save(async () => {
      await api('PUT', '/api/profile', { primary_goal: v.primary_goal, fitness_level: v.fitness_level, minutes: Number(v.minutes), days_per_week: Number(v.days_per_week), equipment });
      await api('POST', '/api/plan/regenerate', {});
    }, 'Saved. Your plan is rebuilt.');
  } else if (form.id === 'profile') {
    // Height is typed in the units shown on screen, which are the ones saved before this change.
    save(() => api('PUT', '/api/profile', { sex: v.sex, birth_year: Number(v.birth_year), height_cm: lIn(v.height), activity: v.activity, units: v.units, review_cadence: v.review_cadence }), 'Saved.');
  }
});

const go = (view) => { state.view = view; state.open = null; render(); window.scrollTo(0, 0); };

async function act(el) {
  const a = el.dataset.action;
  const s = state.intro;
  // First-run questions
  if (a === 'intro-pick') { s[el.dataset.key] = el.dataset.value; s.step += 1; return render(); }
  if (a === 'intro-set') { s[el.dataset.key] = Number(el.dataset.value); return render(); }
  if (a === 'intro-kit') { const k = el.dataset.value; s.equipment = s.equipment.includes(k) ? s.equipment.filter((x) => x !== k) : [...s.equipment, k]; return render(); }
  if (a === 'intro-units') { s.units = el.dataset.value; return render(); }
  if (a === 'intro-next') { s.step += 1; return render(); }
  if (a === 'intro-back') { s.step -= 1; return render(); }

  // Workout
  if (a === 'start') {
    state.session = await api('POST', '/api/workout/start', el.dataset.day ? { day_index: Number(el.dataset.day) } : {});
    state.finish = { effort: null, feeling: null };
    return go('workout');
  }
  if (a === 'resume') { state.session = state.session || state.data.workout.active; return go('workout'); }
  if (a === 'leave' || a === 'home') { state.view = 'tabs'; state.tab = 'today'; state.open = null; state.result = null; return load(); }
  if (a === 'open') { const pos = Number(el.dataset.pos); state.open = state.open === pos ? null : pos; return render(); }
  if (a === 'tick' || a === 'step') {
    const pos = Number(el.dataset.pos);
    const item = state.session.items.find((i) => i.position === pos);
    const body = { position: pos };
    if (a === 'tick') {
      body.done = !item.done;
      item.done = body.done;
    } else if (el.dataset.field === 'weight') {
      const step = imperial() ? 5 / LB : 2.5;
      body.weight_kg = Math.max(0, Math.round(((item.weight_kg || 0) + Number(el.dataset.dir) * step) * 100) / 100) || null;
      item.weight_kg = body.weight_kg;
    } else {
      body[el.dataset.field] = Math.max(1, item[el.dataset.field] + Number(el.dataset.dir));
      item[el.dataset.field] = body[el.dataset.field];
    }
    render(); // show the tap at once; the save follows
    state.session = await api('POST', `/api/workout/${state.session.id}/item`, body);
    if (a === 'tick' && body.done) {
      const left = state.session.items.filter((i) => !i.done).length;
      toast(left ? `${left} to go.` : 'That\'s all of them.');
    }
    return render();
  }
  if (a === 'to-finish') return go('finish');
  if (a === 'effort') { state.finish.effort = Number(el.dataset.value); return render(); }
  if (a === 'feeling') { state.finish.feeling = state.finish.feeling === el.dataset.value ? null : el.dataset.value; return render(); }
  if (a === 'finish') {
    const f = el.dataset.skip ? {} : { effort: state.finish.effort, feeling: state.finish.feeling };
    state.result = await api('POST', `/api/workout/${state.session.id}/finish`, f);
    state.session = null;
    state.data = await api('GET', '/api/state');
    return go('celebrate');
  }
  if (a === 'cancel-workout') { await api('POST', `/api/workout/${state.session.id}/cancel`, {}); state.session = null; state.view = 'tabs'; return load(); }

  // Everything else
  if (a === 'met') return save(() => api('POST', '/api/day', { target_met: el.dataset.value === '1' }), el.dataset.value === '1' ? streakLine('On target.') : 'Logged. Tomorrow is a fresh start.');
  if (a === 'area') return el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true');
  if (a === 'use-target') return save(() => api('POST', '/api/target', { calories: Number(el.dataset.calories), protein_g: state.data.suggested.protein_g, reason: el.dataset.reason }), 'Target set.');
  if (a === 'revert') return save(() => api('POST', '/api/target/revert', {}), 'Change undone.');
  if (a === 'rebuild') return save(() => api('POST', '/api/plan/regenerate', {}), 'Plan rebuilt.');
  if (a === 'del-weight') return save(() => api('DELETE', `/api/weight/${el.dataset.date}`), 'Entry deleted.');
  if (a === 'show-all') return save(() => api('PUT', '/api/profile', { show_all: el.checked }), el.checked ? 'Everything is open.' : 'Back to unlocking as you go.');
  if (a === 'copy') return navigator.clipboard.writeText(el.dataset.text).then(() => toast('Copied.'), () => toast('Copy failed. Select the address and copy it by hand.'));
  if (a === 'logout') { await api('POST', '/api/logout', {}); state.view = 'tabs'; return load(); }
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    state.open = null;
    render();
    window.scrollTo(0, 0);
    load().catch((err) => toast(err.message));
    return;
  }
  const el = e.target.closest('[data-action]');
  if (el) act(el).catch((err) => toast(err.message));
});

load().catch(() => { $app.innerHTML = '<div class="auth-page"><main class="auth-card"><h1>All For One</h1><p class="error">The app could not reach its server. Check your connection and reload.</p></main></div>'; });
