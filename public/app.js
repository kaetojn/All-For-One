import { drawSketch } from '/sketch.js';
import { pickFigure, figureLabel, figureStrip, mountFigure } from '/figures.js';
// All For One web app. No build step and no dependencies: this file is served as written.
// The server stores metric values; this file converts for display when the profile says imperial.
//
// Design rules this file follows:
//   - One anchor on the home screen (today's workout). Everything else opens on tap.
//   - Logging is confirm-not-type: values come pre-filled and one tap completes an exercise.
//   - Everything is available from day one.

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const state = {
  data: null, tab: 'today', view: 'tabs', history: null, targets: null, plan: null, authError: '',
  session: null, open: null, result: null, finish: { effort: null, feeling: null, symptoms: [] },
  body: null, bodyView: 'now', bodyShown: null, bodyStyle: 'shaded', figView: 'front', photos: null, food: null, mealResult: null, confirmRefresh: false, syncKey: null,
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
const SYMPTOMS = ['Knee', 'Lower back', 'Shoulder', 'Wrist', 'Dizzy', 'Chest pain', 'Short of breath'];
const RED_FLAGS = ['Dizzy', 'Chest pain', 'Short of breath']; // the same list the server uses for stop advice
const EFFORT = ['', 'Very easy', 'Easy', 'Easy', 'Comfortable', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'All out'];
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

// While a request is taking a moment, the companion does squats instead of showing a spinner.
let waiting = 0;
function wait(promise) {
  waiting += 1;
  const timer = setTimeout(() => mascot.busy(true), 250);
  return promise.finally(() => { clearTimeout(timer); waiting -= 1; if (!waiting) mascot.busy(false); });
}

async function api(method, path, body) {
  const res = await wait(fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

let toastTimer;
// A short message at the bottom of the screen. With `undo`, it carries an Undo button and stays longer.
function toast(message, undo) {
  $toast.textContent = message;
  if (undo) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Undo' });
    b.onclick = () => { $toast.classList.remove('show', 'has-undo'); Promise.resolve(undo()).then(load).then(() => toast('Undone.')).catch((e) => toast(e.message)); };
    $toast.append(b);
  }
  $toast.classList.toggle('has-undo', !!undo);
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show', 'has-undo'), undo ? 6000 : 2800);
}

// Destructive taps ask twice: the first tap turns the button into a plain statement of what will
// happen, and it resets on its own if the second tap never comes.
function armed(el, prompt) {
  if (el.dataset.armed) return true;
  el.dataset.armed = '1'; el.dataset.label = el.textContent; el.textContent = prompt; el.classList.add('armed');
  setTimeout(() => { if (el.isConnected && el.dataset.armed) { delete el.dataset.armed; el.textContent = el.dataset.label; el.classList.remove('armed'); } }, 4000);
  return false;
}

async function load() {
  state.data = await api('GET', '/api/state');
  const d = state.data;
  if (d.signed_in) {
    if (!d.profile.onboarded_at) state.view = 'intro';
    else if (state.view === 'intro') state.view = 'tabs';
    if (state.view === 'tabs' && state.tab === 'body') [state.history, state.body, state.photos] = await Promise.all([api('GET', '/api/history?days=90'), api('GET', '/api/body'), d.photo_storage ? api('GET', '/api/photos?kind=body') : []]);
    if (state.view === 'tabs' && state.tab === 'food') state.food = await api('GET', '/api/food');
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
    if (message) { toast(typeof message === 'function' ? message(out) : message); mascot.react('pump', 800); }
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- the companion ---------- */
// A bear cub (see mascot.js). It only turns up for moments worth marking: finishing a workout, a
// workout already done today, and streak milestones. It never sits on data. It is loaded after the
// first screen is drawn, so the app never waits for it. Until then these calls do nothing.

let mascot = { shape() {}, react() {}, busy() {}, wake() {} };
const MILESTONES = [3, 7, 14, 21, 30, 60, 100, 200, 365];
import('/mascot.js').then((m) => { mascot = m.mascot; mascot.shape(); }).catch(() => {});

// A spot for the companion to stand. `mood` picks how it behaves there: happy, cheer or sleepy.
const perch = (mood = 'happy', size = 64) => `<span class="perch" data-mascot data-mood="${mood}" data-size="${size}" style="width:${Math.round(size * 0.6)}px;height:${size}px"></span>`;

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
    <div><h1>All For One</h1><p class="muted">${claim ? 'Create your account to claim this app. Sign-up closes after that.' : 'Welcome back.'}</p></div>
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
      <div class="stack"><h2 class="label">Per workout</h2>${chips('minutes', [20, 30, 45, 60], (v) => `${v} min`)}</div>
      <div class="stack"><h2 class="label">Workouts a week</h2>${chips('days_per_week', [2, 3, 4, 5, 6], (v) => v)}</div>
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
    <div class="hello"><p>${['Five quick questions and you\'re in.', 'Got it.', 'No wrong answers here.', 'Nearly there.', 'Then I\'ll build your first week.'][s.step]}</p></div>
    ${steps[s.step]()}
  </div>`;
}

/* ---------- today ---------- */

function greeting(d) {
  const s = d.streak;
  const stop = d.workout.done_today && d.workout.done_today.advice && d.workout.done_today.advice.level === 'stop';
  if (stop) return ['rest', 'Workout saved. Rest before the next one.'];
  if (d.workout.done_today) return ['cheer', 'Workout done. Enjoy that.'];
  if (!s.checked_in_today && s.days === 0) return ['sleepy', 'A quick check-in gets things moving.'];
  if (s.days >= 3) return ['happy', `${s.days} days in a row. Keep it going.`];
  if (s.checked_in_today) return ['happy', 'Checked in today. Nice.'];
  return ['happy', 'Ready when you are.'];
}

function anchor(d) {
  const w = d.workout;
  if (w.active) {
    const done = w.active.items.filter((i) => i.done).length;
    return `<section class="card anchor"><h2 class="label">In progress</h2><p class="title">${esc(w.active.day_name)}</p>${segments(done, w.active.items.length)}
      <button class="go" data-action="resume">Continue · ${done} of ${w.active.items.length} done</button></section>`;
  }
  if (w.done_today) {
    return `<section class="card anchor done"><h2 class="label">Today</h2><p class="title">${esc(w.done_today.day_name)} done</p><p class="win">${esc(w.done_today.win)}</p>
      ${w.done_today.effort_meaning ? `<p class="muted small">Effort ${w.done_today.effort} of 10: ${esc(w.done_today.effort_meaning)}</p>` : ''}
      ${w.done_today.kcal ? `<p class="muted small">${w.done_today.kcal} kcal burned, from Apple Health.</p>` : ''}
      ${w.done_today.advice ? `<div class="${w.done_today.advice.level === 'stop' ? 'alert' : 'notice'}">${esc(w.done_today.advice.message)}</div>` : ''}
      ${w.next ? `<p class="muted small">Next up: ${esc(w.next.name)}</p>` : ''}</section>`;
  }
  if (!w.next) return `<section class="card anchor"><h2 class="label">Today</h2><p class="title">No plan yet</p><button class="go" data-action="rebuild">Build my plan</button></section>`;
  if (w.week.goal && w.week.done >= w.week.goal) {
    return `<section class="card anchor rest"><h2 class="label">Today</h2><p class="title">Rest day</p><p>You've done all ${w.week.goal} workouts this week. Recovery is part of the plan.</p>
      <button class="link fit" data-action="start">Do a bonus session: ${esc(w.next.name)}</button></section>`;
  }
  return `<section class="card anchor"><h2 class="label">Today's workout</h2><p class="title">${esc(w.next.name)}</p>
    <p class="muted">${w.next.exercises.length} exercises · about ${w.next.minutes} min</p>
    <button class="go" data-action="start">Start</button></section>`;
}

function todayScreen() {
  const d = state.data;
  const log = d.today_log || {};
  const t = d.target;
  const [mood, line] = greeting(d);
  const moment = mood !== 'rest' && (d.workout.done_today || (d.streak.checked_in_today && MILESTONES.includes(d.streak.days)));
  const checkSummary = log.target_met === true ? 'On target' : log.target_met === false ? 'Missed today' : log.calories != null ? `${log.calories} kcal` : 'Not logged';
  const pct = t && log.calories != null ? Math.min(100, Math.round((log.calories / t.calories) * 100)) : 0;
  const note = t && t.set_by === 'claude' && t.reason ? `<div class="note"><b>Coach's note</b><span>${esc(t.reason)}</span></div>` : '';
  return `<div class="hello"><div><h1>${d.streak.days ? `Day ${d.streak.days}` : 'Today'}</h1><p>${line}</p></div>${moment ? perch(mood === 'sleepy' ? 'happy' : mood, 64) : ''}</div>
    <div class="stack" style="gap:8px"><div class="row"><h2 class="label">This week</h2><span class="muted small fit">${d.workout.week.done}${d.workout.week.goal ? ` of ${d.workout.week.goal}` : ''} workouts</span></div>${segments(d.workout.week.done, d.workout.week.goal)}</div>
    ${anchor(d)}
    ${d.review.latest ? `<details class="card" data-keep="review" ${state.open === 'review' ? 'open' : ''}><summary>Coach review<span>${niceDate(d.review.latest.period_end)}</span></summary><div class="inside"><p style="white-space:pre-line">${esc(d.review.latest.summary)}</p><p class="muted small">Next review in ${d.review.days_until} days.</p></div></details>` : ''}
    <details class="card" data-keep="check" ${state.open === 'check' ? 'open' : ''}>
      <summary>Food check<span>${checkSummary}</span></summary>
      <div class="inside">
        ${t ? `<div class="stack" style="gap:6px"><div class="row"><b>${t.calories} kcal target</b><span class="muted small fit">${log.calories != null ? `${Math.max(0, t.calories - log.calories)} left` : ''}</span></div><div class="meter"><i style="width:${pct}%"></i></div></div>` : `<p class="muted small">${d.goal ? 'Your goal is set. Choose a calorie target in Plan.' : 'Set a goal in Plan to get a calorie target.'}</p>`}
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
    <button class="link danger-link" data-action="cancel-workout">Discard this workout</button>
  </div>`;
}

// One question at a time: effort first, then how you feel. Symptoms stay folded away until asked
// for, and warning signs are kept apart so picking one shows the stop message straight away.
function finishScreen() {
  const f = state.finish;
  const chip = (action, v, on) => `<button data-action="${action}" data-value="${v}" aria-pressed="${on}">${v}</button>`;
  const red = f.symptoms.filter((v) => RED_FLAGS.includes(v));
  const hurt = f.hurt || f.symptoms.length;
  return `<div class="shell bare fade">
    <div class="bar-top"><button class="link fit" data-action="resume">Back</button></div>
    <h1>How hard was that?</h1>
    <div class="scale">${Array.from({ length: 10 }, (_, i) => `<button data-action="effort" data-value="${i + 1}" aria-pressed="${f.effort === i + 1}">${i + 1}</button>`).join('')}</div>
    <p class="muted">${f.effort ? EFFORT[f.effort] : '1 is a stroll, 10 is everything you had.'}</p>
    ${f.effort ? `<fieldset class="group fade"><legend><h2>How do you feel?</h2></legend><div class="chips">${FEELINGS.map((v) => chip('feeling', v, f.feeling === v)).join('')}</div></fieldset>` : ''}
    ${hurt ? `<fieldset class="group"><legend><h2>Anything hurt?</h2></legend><div class="chips">${SYMPTOMS.filter((v) => !RED_FLAGS.includes(v)).map((v) => chip('symptom', v, f.symptoms.includes(v))).join('')}</div></fieldset>
      <fieldset class="group"><legend class="label">Warning signs</legend><div class="chips">${RED_FLAGS.map((v) => chip('symptom', v, f.symptoms.includes(v))).join('')}</div></fieldset>
      ${red.length ? `<div class="alert" role="alert">${esc(red.join(' and '))} during exercise should be checked by a doctor before you train again. If it is severe or does not pass, get medical help now.</div>` : ''}`
      : '<button class="link" data-action="hurt">Something hurt or felt off?</button>'}
    <button class="go" data-action="finish">Save</button>
    <button class="link" data-action="finish" data-skip="1">Skip</button>
  </div>`;
}

function celebrateScreen() {
  const r = state.result;
  // A stop message is not a moment to celebrate: no sparks, no bear, and the advice comes first.
  if (r.advice && r.advice.level === 'stop') {
    return `<div class="celebrate"><h1>Workout saved</h1><div class="alert" role="alert" style="text-align:left">${esc(r.advice.message)}</div>
      <div style="width:220px">${segments(r.week.done, r.week.goal)}</div>
      <button class="go" data-action="home" style="min-width:200px">Done</button></div>`;
  }
  const sparks = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return `<i style="--x:${Math.round(Math.cos(a) * (110 + (i % 3) * 30))}px;--y:${Math.round(Math.sin(a) * (110 + (i % 3) * 30))}px"></i>`; }).join('');
  return `<div class="celebrate"><div class="sparks" aria-hidden="true">${sparks}</div>
    ${perch('cheer', 150)}
    <h1>${esc(r.win)}</h1>
    <div style="width:220px">${segments(r.week.done, r.week.goal)}</div>
    ${r.effort_meaning ? `<p class="muted">${esc(r.effort_meaning)}</p>` : ''}
    ${r.advice ? `<div class="${r.advice.level === 'stop' ? 'alert' : 'notice'}" style="text-align:left">${esc(r.advice.message)}</div>` : ''}
    <button class="go" data-action="home" style="min-width:200px">Done</button>
  </div>`;
}

/* ---------- progress ---------- */

// Weight over time. `proj` adds a dashed line from today to where the current calorie target leads.
function chart(points, goal, proj) {
  if (points.length < 2 && !(points.length && proj)) return `<p class="muted small">Log weight on two or more days to see your trend.</p>`;
  const W = 320, H = 150, L = 34, R = 10, T = 12, B = 22;
  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.v);
  const end = proj ? Math.max(Date.parse(proj.date), xs[xs.length - 1]) : xs[xs.length - 1];
  let lo = Math.min(...ys, goal ?? Infinity, proj ? proj.v : Infinity), hi = Math.max(...ys, goal ?? -Infinity, proj ? proj.v : -Infinity);
  const pad = Math.max(0.5, (hi - lo) * 0.12); lo -= pad; hi += pad;
  const x = (t) => L + ((t - xs[0]) / (end - xs[0] || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = points[points.length - 1], lx = x(xs[xs.length - 1]);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight from ${niceDate(points[0].date)}: ${points[0].v} to ${last.v} ${wUnit()}${proj ? `, projected ${proj.v} by ${niceDate(proj.date)}` : ''}">
    <text x="0" y="${y(hi - pad) + 4}">${r1(hi - pad)}</text><text x="0" y="${y(lo + pad) + 4}">${r1(lo + pad)}</text>
    ${goal != null ? `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke-dasharray="3 5" style="stroke:var(--good)"/><text x="${L}" y="${y(goal) - 5}" style="fill:var(--good)">goal ${goal}</text>` : ''}
    ${points.length > 1 ? `<path class="area" d="${path}L${lx.toFixed(1)},${H - B}L${L},${H - B}Z"/><path class="line" d="${path}"/>` : ''}
    ${proj ? `<path d="M${lx.toFixed(1)},${y(last.v).toFixed(1)}L${x(Date.parse(proj.date)).toFixed(1)},${y(proj.v).toFixed(1)}" fill="none" stroke-dasharray="2 4" style="stroke:var(--accent);stroke-width:1.6"/><circle cx="${x(Date.parse(proj.date))}" cy="${y(proj.v)}" r="3" style="fill:var(--card);stroke:var(--accent);stroke-width:1.6"/>` : ''}
    <circle cx="${lx}" cy="${y(last.v)}" r="5.5"/>
    <text x="${L}" y="${H - 4}">${niceDate(points[0].date)}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${niceDate(new Date(end).toISOString().slice(0, 10))}</text>
  </svg>`;
}

// One line on where the plan leads.
function projectionLine(p, goalWeight) {
  if (!p) return '';
  const pace = p.weekly_change_kg ? `${p.weekly_change_kg > 0 ? 'gaining' : 'losing'} about ${Math.abs(wOut(p.weekly_change_kg))} ${wUnit()} a week` : 'holding steady';
  const land = p.weight_at_goal_date_kg != null ? ` That puts you near ${wOut(p.weight_at_goal_date_kg)} ${wUnit()} on ${niceDate(p.goal_date)}.` : '';
  const reach = goalWeight && p.reach_date ? ` You would reach ${wOut(goalWeight)} ${wUnit()} around ${niceDate(p.reach_date)}, ${p.reach_date.slice(0, 4)}.` : goalWeight && !p.reach_date ? ' At this intake you would not reach your goal weight.' : '';
  return `At ${p.calories} kcal a day you are ${pace}.${land}${reach}`;
}

function bodyScreen() {
  const d = state.data, h = state.history, b = state.body;
  if (!h || !b) return '<h1 class="page-title">Body</h1>';
  const view = state.bodyView === 'goal' ? 'goal' : 'now';
  const head = `<h1 class="page-title">Body</h1>${bodyCard(view)}`;
  const proj = d.projection;
  const goalW = d.suggested.target_weight_kg || null;

  // Goal: where you are heading, and the one thing you can change here, the goal shape.
  if (view === 'goal') {
    if (!b.goal) return `${head}<section class="card locked"><h2>No goal yet</h2><p class="muted">Set a target and a date, and your goal body appears here.</p><button class="primary" data-tab="plan">Set a goal</button></section>`;
    return `${head}
      <section class="card">
        <div class="split">
          <div class="stat"><b>${goalW ? `${wOut(goalW)} ${wUnit()}` : '–'}</b><span>Goal weight</span></div>
          <div class="stat"><b>${b.target_body_fat != null ? `${b.target_body_fat}%` : '–'}</b><span>Goal body fat</span></div>
        </div>
        <p class="muted small">Target date ${niceDate(b.goal_date)}, ${b.goal_date.slice(0, 4)}.</p>
        ${proj ? `<p class="small">${projectionLine(proj, goalW)}</p>` : ''}
      </section>
      ${goalSliders(b)}`;
  }

  // Now: today's numbers and everything you log.
  const points = h.weights.map((w) => ({ date: w.date, v: wOut(w.kg) }));
  const first = h.weights[0], last = h.weights[h.weights.length - 1];
  const change = first && last && first !== last ? r1(wOut(last.kg) - wOut(first.kg)) : null;
  const bf = d.latest.body_fat;
  const m = d.latest.measurements;
  const needs = d.profile.sex === 'female' ? 'neck, waist and hips' : 'neck and waist';
  const since = first ? niceDate(first.date) : '';
  const trend = change == null ? '' : change < 0 ? `Down ${-change} ${wUnit()} since ${since}.` : change > 0 ? `Up ${change} ${wUnit()} since ${since}.` : `Holding steady since ${since}.`;
  const sources = !bf ? `Add ${needs} below, or a progress photo, to get a body-fat figure.`
    : bf.tape != null && bf.photo != null ? `Average of your tape measurements (${bf.tape}%) and ${bf.photos_used} recent photo${bf.photos_used > 1 ? 's' : ''} (${bf.photo}%).`
      : bf.tape != null ? `From your tape measurements. Add progress photos to refine it.` : `From ${bf.photos_used} recent photo${bf.photos_used > 1 ? 's' : ''}. Add ${needs} to refine it.`;
  const projPoint = proj && proj.weight_at_goal_date_kg != null ? { date: proj.goal_date, v: wOut(proj.weight_at_goal_date_kg) } : null;
  return `${head}
    <section class="card">
      <div class="split">
        <div class="stat"><b>${last ? `${wOut(last.kg)} ${wUnit()}` : '–'}</b><span>Weight</span></div>
        <div class="stat"><b>${bf ? `${bf.pct}%` : '–'}</b><span>Body fat</span></div>
      </div>
      <p class="muted small">${sources}</p>
      ${chart(points, goalW ? wOut(goalW) : null, projPoint)}
      ${trend ? `<p class="win">${trend}</p>` : ''}
      ${proj ? `<p class="small">${projectionLine(proj, goalW)}</p>` : ''}
    </section>
    <details class="card" data-keep="measure" ${state.open === 'measure' ? 'open' : ''}>
      <summary>Tape measurements<span>${b.measured.length ? `${b.measured.length} of ${SITES.length} measured` : 'Not measured yet'}</span></summary>
      <div class="inside">
        <p class="muted small">These shape the 3D body, and ${needs} feed your body-fat figure. Fill in only what you measured today (${lUnit()}).</p>
        <form id="measure" class="split">
          ${SITES.map((s) => `<label>${cap(s)}<input name="${s}" inputmode="decimal" placeholder="${b.measured.includes(s) ? lOut(m[s]) : ''}"></label>`).join('')}
          <button class="primary" style="grid-column:1/-1">Save measurements</button>
        </form>
        ${h.body_fat.length > 1 ? `<h2 class="label">Tape body fat history</h2><div class="list">${h.body_fat.slice().reverse().map((p) => `<div><span>${niceDate(p.date)}</span><b>${p.pct}%</b></div>`).join('')}</div>` : ''}
      </div>
    </details>
    ${photosCard()}
    ${h.weights.length ? `<details class="card"><summary>Weight entries<span>${h.weights.length}</span></summary><div class="inside"><div class="list">${h.weights.slice().reverse().slice(0, 30).map((w) => `<div><span>${niceDate(w.date)}</span><span><b>${wOut(w.kg)} ${wUnit()}</b> <button class="link" data-action="del-weight" data-date="${w.date}" data-kg="${w.kg}" aria-label="Delete weight for ${niceDate(w.date)}">Delete</button></span></div>`).join('')}</div></div></details>` : ''}`;
}

/* ---------- plan ---------- */

function planScreen() {
  const d = state.data;
  const g = d.goal;
  const s = d.suggested;
  const areas = new Set(g ? g.target_areas : []);
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
  const goalForm = `<form id="goal" class="stack">
        <div class="split">
          <label>Target body fat (%)<input name="target_body_fat" inputmode="decimal" value="${g?.target_body_fat ?? ''}"></label>
          <label>Target weight (${wUnit()})<input name="target_weight" inputmode="decimal" value="${g?.target_weight_kg ? wOut(g.target_weight_kg) : ''}" placeholder="optional"></label>
        </div>
        <label>Reach it by<input name="target_date" type="date" value="${g?.target_date ?? ''}" min="${d.today}" required></label>
        <fieldset class="group"><legend class="label">Areas to define</legend><div class="chips" id="areas">${AREAS.map((a) => `<button type="button" data-action="area" data-area="${a}" aria-pressed="${areas.has(a)}">${cap(a === 'calf' ? 'calves' : a)}</button>`).join('')}</div></fieldset>
        <button class="primary">${g ? 'Update goal' : 'Set goal'}</button>
      </form>`;
  const historyList = hist.length ? `<h2 class="label">Target history</h2><div class="list">${hist.map((t) => `<div><span><b>${t.calories} kcal</b>${t.protein_g ? ` · ${t.protein_g} g protein` : ''}<br><span class="muted small">${niceDate(t.created_at.slice(0, 10))} · set by ${esc(t.set_by)}${t.reverted_at ? ' · undone' : ''}${t.reason ? `<br>${esc(t.reason)}` : ''}</span></span>${t === live ? '<button class="link fit" data-action="revert">Undo</button>' : ''}</div>`).join('')}</div>` : '';
  const goalLine = g ? [g.target_weight_kg ? `${wOut(g.target_weight_kg)} ${wUnit()}` : s.target_weight_kg ? `about ${wOut(s.target_weight_kg)} ${wUnit()}` : null, g.target_body_fat ? `${g.target_body_fat}% body fat` : null].filter(Boolean).join(' · ') : '';
  const t = d.target;
  // Once something is set it shows as one line; the controls open only when you want to change it.
  return `<h1 class="page-title">Plan</h1>
    ${g ? `<details class="card" data-keep="goal" ${state.open === 'goal' ? 'open' : ''}>
        <summary><span class="sumtext"><b>Goal</b><small>${goalLine} by ${niceDate(g.target_date)}, ${g.target_date.slice(0, 4)}</small></span><span>Edit</span></summary>
        <div class="inside">${goalForm}</div></details>`
      : `<h2 class="label">Goal</h2><section class="card">${goalForm}</section>`}
    ${t ? `<details class="card" data-keep="calories" ${state.open === 'calories' ? 'open' : ''}>
        <summary><span class="sumtext"><b>${t.calories.toLocaleString()} kcal a day</b><small>${t.protein_g ? `${t.protein_g} g protein · ` : ''}${d.projection && d.projection.weekly_change_kg ? `${d.projection.weekly_change_kg > 0 ? 'gaining' : 'losing'} about ${Math.abs(wOut(d.projection.weekly_change_kg))} ${wUnit()} a week` : 'holding steady'}</small></span><span>Change</span></summary>
        <div class="inside">${target}${historyList}</div></details>
      ${d.projection ? `<p class="muted small" style="padding:0 4px">${projectionLine(d.projection, s.target_weight_kg)}</p>` : ''}`
      : `<h2 class="label">Calories</h2><section class="card">${target}</section>`}`;
}

/* ---------- settings ---------- */

function settingsScreen() {
  const d = state.data;
  const p = d.profile;
  const url = `${location.origin}/mcp`;
  const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${Array.isArray(v) ? v[0] : v}</option>`).join('');
  return `<h1 class="page-title">More</h1>
    <section class="card">
      <h2 class="label">Training</h2>
      <form id="training" class="stack">
        <div class="split"><label>Main goal<select name="primary_goal">${opt(GOALS, p.primary_goal)}</select></label><label>Level<select name="fitness_level">${opt(LEVELS, p.fitness_level)}</select></label></div>
        <div class="split"><label>Minutes per workout<input name="minutes" inputmode="numeric" value="${p.minutes ?? ''}" required></label><label>Workouts a week<input name="days_per_week" inputmode="numeric" value="${p.days_per_week ?? ''}" required></label></div>
        <fieldset class="group"><legend class="label">Equipment you have</legend><div class="chips" id="kit">${Object.entries(KIT).map(([k, v]) => `<button type="button" data-action="area" data-kit="${k}" aria-pressed="${p.equipment.includes(k)}">${v}</button>`).join('')}</div></fieldset>
        <button class="primary">Save and rebuild plan</button>
        <p class="muted small">Saving replaces your current week of workouts with a new plan.</p>
      </form>
    </section>
    <section class="card">
      <h2 class="label">About you</h2>
      <form id="profile" class="stack">
        <label>Sex, used only for the body-fat and energy formulas<select name="sex" required><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
        <div class="split"><label>Birth year<input name="birth_year" inputmode="numeric" value="${p.birth_year ?? ''}" required></label><label>Height (${lUnit()})<input name="height" inputmode="decimal" value="${lOut(p.height_cm)}" required></label></div>
        <label>Day-to-day activity<select name="activity">${opt(ACTIVITY, p.activity)}</select></label>
        <div class="split"><label>Units<select name="units"><option value="metric" ${p.units === 'metric' ? 'selected' : ''}>kg and cm</option><option value="imperial" ${p.units === 'imperial' ? 'selected' : ''}>lb and inches</option></select></label>
          <label>Coach review<select name="review_cadence"><option value="weekly" ${p.review_cadence === 'weekly' ? 'selected' : ''}>Every week</option><option value="biweekly" ${p.review_cadence === 'biweekly' ? 'selected' : ''}>Every 2 weeks</option><option value="monthly" ${p.review_cadence === 'monthly' ? 'selected' : ''}>Every month</option></select></label></div>
        <button class="primary">Save</button>
      </form>
    </section>
    ${extraSettings()}
    <section class="card">
      <h2 class="label">Figure</h2>
      <p class="small">Your figure's pose follows your body fat. Build sets how much muscle it carries once you're lean.</p>
      <fieldset class="chips" aria-label="Build">${Object.entries(BUILDS).map(([k, v]) => `<button type="button" data-action="build" data-value="${k}" aria-pressed="${(p.build || 'muscular') === k}">${v}</button>`).join('')}</fieldset>
    </section>
    <section class="card">
      <h2 class="label">Connect Claude</h2>
      <p class="small">In Claude, add a custom connector with this address, then sign in with your All For One email and password when asked.</p>
      <code>${esc(url)}</code>
      <button data-action="copy" data-text="${esc(url)}">Copy address</button>
    </section>
    <section class="card"><p class="muted small">Signed in as ${esc(d.user.email)}. Exercise photos are from the public-domain Free Exercise DB.</p><button data-action="logout">Sign out</button></section>`;
}

/* ---------- body: the sketch, and progress photos ---------- */
// The body is shown as a drawn, faceless figure whose pose and definition follow body fat (sketch.js).
// The earlier 3D figure is kept but hidden; add ?3d to the address to see it.

const SHOW_3D = new URLSearchParams(location.search).has('3d');
const BUILDS = { lean: 'Lean', muscular: 'Muscular', bodybuilder: 'Bodybuilder' };

let viewer = null;

const goalSliders = (b) => `<section class="card"><div class="row"><h2 class="label">Adjust the goal shape</h2>${Object.keys(b.overrides).length ? '<button class="link fit" data-action="shape-reset">Reset</button>' : ''}</div>
    <p class="muted small">Projected from your target and the areas you chose. Fine-tune any part (${lUnit()}).</p>
    ${SITES.map((s) => `<label><span>${cap(s)} · <span data-out="${s}">${lOut(b.goal[s])}</span></span><input type="range" data-action="shape" data-site="${s}" min="${Math.round(b.current[s] * 0.65)}" max="${Math.round(b.current[s] * 1.2)}" step="0.5" value="${b.goal[s]}"></label>`).join('')}</section>`;

// The drawn figure: the nearest pre-drawn sketch for the body fat and build (figures.js).
// ?sketch shows the older generated drawing (sketch.js) instead.
const SHOW_SKETCH = new URLSearchParams(location.search).has('sketch');

function sketchCard(view) {
  const b = state.body;
  const goal = view === 'goal';
  const bf = goal ? b.target_body_fat : b.body_fat;
  const key = pickFigure(b.sex, bf, b.build);
  const art = SHOW_SKETCH
    ? `<div class="sketch fade">${drawSketch({ sex: b.sex, height_cm: b.height_cm, body_fat: bf, build: b.build, measurements: goal ? b.goal : b.current, tone: b.skin_tone, id: view })}</div>`
    : figureStrip({ sex: b.sex, key, view: state.figView, alt: `${goal ? 'Your goal' : 'You now'}: ${figureLabel(key).toLowerCase()}` });
  const guessed = SITES.filter((s) => !b.measured.includes(s)).length;
  const build = key.startsWith('D') || key.startsWith('E') ? `, ${BUILDS[b.build].toLowerCase()} build` : '';
  return `<div class="seg" role="group" aria-label="Which body to show"><button data-action="body-view" data-value="now" aria-pressed="${view === 'now'}">Now</button><button data-action="body-view" data-value="goal" aria-pressed="${goal}">Goal</button></div>
    <section class="card">
      ${art}
      <p class="muted small">${goal ? `Your goal at ${bf != null ? `${bf}%` : 'your target'} body fat${build}.` : `You now, at ${bf != null ? `${bf}%` : 'an estimated'} body fat${build}.`}${!goal && guessed ? ` ${guessed} of ${SITES.length} measurements are still estimates.` : ''} Swipe to turn. Build is in More.</p>
    </section>`;
}

// Now and Goal are separate views: each shows only what belongs to it.
function bodyCard(view) {
  if (!SHOW_3D) return sketchCard(view);
  const b = state.body;
  const guessed = SITES.filter((s) => !b.measured.includes(s)).length;
  return `<div class="seg" role="group" aria-label="Which body to show"><button data-action="body-view" data-value="now" aria-pressed="${view === 'now'}">Now</button><button data-action="body-view" data-value="goal" aria-pressed="${view === 'goal'}">Goal</button></div>
    <section class="card">
      <div class="stage"><canvas id="body3d" aria-label="3D model of your body. Drag to rotate, pinch to zoom."></canvas></div>
      <div class="row"><div class="seg" role="group" aria-label="Drawing style"><button data-action="body-style" data-value="shaded" aria-pressed="${state.bodyStyle === 'shaded'}">Shaded</button><button data-action="body-style" data-value="line" aria-pressed="${state.bodyStyle === 'line'}">Line</button></div>
      </div>
      ${view === 'now' && guessed ? `<p class="muted small">${guessed === SITES.length ? 'This shape is estimated from your height and weight.' : `${guessed} of ${SITES.length} measurements are still estimates.`} Add tape measurements below to make it yours.</p>` : ''}
    </section>`;
}

function mountViewer() {
  const canvas = document.getElementById('body3d');
  if (viewer) { viewer.destroy(); viewer = null; }
  if (!canvas || !state.body) return;
  const which = state.bodyView === 'goal' && state.body.goal ? 'goal' : 'now';
  const first = state.bodyShown || which; // start from what was on screen, then glide to the new shape
  import('/body3d.js').then(({ mountBody }) => mountBody(canvas, state.body, first, state.bodyStyle)).then((v) => {
    if (!canvas.isConnected) return v.destroy();
    viewer = v;
    if (first !== which) v.show(state.body, which);
    state.bodyShown = which;
  }).catch(() => canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: '3D is not available in this browser.' })));
}

// Shrink a photo in the browser before upload: faster, and it drops location data stored in the file.
async function shrink(file, max = 1280) {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * k), height: Math.round(bitmap.height * k) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
}

async function uploadPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  toast('Uploading…');
  const blob = await shrink(file);
  const res = await wait(fetch(`/api/photos?kind=${input.dataset.kind}${input.dataset.pose ? `&pose=${input.dataset.pose}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed.');
  if (input.dataset.kind === 'meal') state.mealResult = data;
  await load();
  toast(data.estimate ? 'Read and deleted. Result saved.' : 'Saved privately until your coach reads it, then deleted.');
}

const estimateLine = (p) => {
  const e = p.estimate;
  if (!e) return 'Awaiting review';
  if (e.unclear) return 'Could not read this photo';
  return p.kind === 'body' ? `About ${e.body_fat_low}–${e.body_fat_high}% body fat` : `${e.name} · about ${e.kcal} kcal`;
};

// Photo check-ins: only the analysis is kept, never a gallery of photos.
function photosCard() {
  const d = state.data;
  if (!d.photo_storage) return '';
  const list = state.photos || [];
  return `<details class="card" data-keep="photos" ${state.open === 'photos' ? 'open' : ''}><summary>Photo check-ins<span>${list.length || 'None yet'}</span></summary>
    <div class="inside">
      <p class="muted small">Same spot, same light, same pose each time. Each photo is read for a rough body-fat range, then deleted; only the result is kept. ${d.photo_ai ? 'Results appear straight away.' : 'Your coach reads them at the next review; until then the photo is held privately.'}</p>
      <div class="row">${['front', 'side', 'back'].map((pose) => `<label class="file">${cap(pose)}<input type="file" accept="image/*" data-upload data-kind="body" data-pose="${pose}"></label>`).join('')}</div>
      ${list.length ? `<div class="list">${list.map((p) => `<div><span><b>${esc(estimateLine(p))}</b><br><span class="muted small">${niceDate(p.date)} · ${p.pose}${p.estimate && p.estimate.notes ? ` · ${esc(p.estimate.notes)}` : ''}</span></span><button class="link fit" data-action="del-photo" data-id="${p.id}" data-confirm>Remove</button></div>`).join('')}</div>` : ''}
    </div></details>`;
}

/* ---------- food: meal plan, shopping list, prices ---------- */

const CHAINS = ['Loblaws', 'Real Canadian Superstore', 'No Frills', 'Metro', 'Food Basics', 'Sobeys', 'FreshCo', 'Walmart', 'Costco'];
const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'no dairy', 'no gluten', 'no red meat', 'no pork', 'halal', 'kosher', 'low fat', 'low sodium', 'low sugar'];
const money = (n) => (n == null ? '' : `$${Number(n).toFixed(2)}`);

function foodScreen() {
  const d = state.data;
  const p = d.profile;
  const f = state.food;
  if (!f) return '<h1 class="page-title">Food</h1>';
  const plan = f.plan;
  const mr = state.mealResult;
  const setup = `<details class="card" data-keep="foodsetup" ${state.open === 'foodsetup' || !p.store ? 'open' : ''}><summary>Shopping setup<span>${p.store ? `${esc(p.store)}${p.weekly_budget ? ` · ${money(p.weekly_budget)} a week` : ''}` : 'Not set'}</span></summary>
    <div class="inside"><form id="food" class="stack">
      <label>Where you shop<select name="store"><option value="">Choose</option>${CHAINS.map((c) => `<option ${p.store === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <div class="split"><label>Weekly budget ($)<input name="weekly_budget" inputmode="decimal" value="${p.weekly_budget ?? ''}"></label><label>People to feed<input name="household" inputmode="numeric" value="${p.household ?? 1}"></label></div>
      <label>Postal code, for local flyers<input name="postal" value="${esc(p.postal ?? '')}" autocomplete="postal-code"></label>
      <fieldset class="group"><legend class="label">Dietary needs</legend><div class="chips" id="diet">${DIETS.map((x) => `<button type="button" data-action="area" data-diet="${x}" aria-pressed="${p.diet.includes(x)}">${cap(x)}</button>`).join('')}</div></fieldset>
      <button class="primary">Save</button>
    </form></div></details>`;
  const meals = plan ? plan.days.map((day, i) => `<details class="card" data-keep="meal${i}" ${state.open === `meal${i}` ? 'open' : ''}><summary>${esc(day.day)}<span>${Math.round(day.meals.reduce((s, m) => s + (m.kcal || 0), 0))} kcal</span></summary>
      <div class="inside"><div>${day.meals.map((m) => `<div class="meal"><div><small>${m.slot}</small>${esc(m.name)}${m.ingredients.length ? `<br><span class="muted small">${esc(m.ingredients.join(', '))}</span>` : ''}</div><span class="muted small fit">${m.kcal ? `${Math.round(m.kcal)} kcal` : ''}${m.protein_g ? `<br>${Math.round(m.protein_g)} g protein` : ''}</span></div>`).join('')}</div></div></details>`).join('')
    : `<section class="card locked"><h2>No meal plan yet</h2><p class="muted">Your coach writes this each week from your targets, store prices and budget. Once Claude is connected, ask it to plan your meals for the week.</p></section>`;
  const spent = plan ? plan.shopping.filter((s) => s.bought).reduce((s, x) => s + (x.est_price || 0), 0) : 0;
  const shopping = plan && plan.shopping.length ? `<section class="card"><div class="row"><h2 class="label">Shopping list</h2><span class="muted small fit">${money(plan.est_cost)}${p.weekly_budget ? ` of ${money(p.weekly_budget)}` : ''}</span></div>
      ${p.weekly_budget ? `<div class="meter"><i style="width:${Math.min(100, Math.round((plan.est_cost / p.weekly_budget) * 100))}%"></i></div>` : ''}
      ${p.weekly_budget && plan.est_cost > p.weekly_budget ? `<div class="notice">This list is about ${money(plan.est_cost - p.weekly_budget)} over your budget.</div>` : ''}
      <div class="list">${plan.shopping.map((s, i) => `<label><span class="row" style="gap:12px"><input type="checkbox" class="fit" data-action="bought" data-index="${i}" ${s.bought ? 'checked' : ''}><span class="${s.bought ? 'bought' : ''}">${esc(s.item)}${s.qty ? ` <span class="muted small">${esc(s.qty)}</span>` : ''}</span></span><span class="muted small">${money(s.est_price)}</span></label>`).join('')}</div>
      <p class="muted small">Prices are estimates. ${spent ? `${money(spent)} ticked off so far.` : ''}</p></section>` : '';
  const pr = f.prices;
  const prices = `<section class="card"><h2 class="label">Store prices</h2>
      <p class="small">${pr.store ? (pr.items ? `${pr.items} prices on file for ${esc(pr.store)}, last checked ${niceDate(pr.newest)}.` : `No prices on file for ${esc(pr.store)} yet.`) : 'Choose your store in Shopping setup below first.'}</p>
      ${pr.refresh_requested ? '<p class="muted small">Refresh requested. Your coach will look up current prices at the next review, or sooner if you ask.</p>'
        : state.confirmRefresh ? '<div class="row"><button class="primary" data-action="refresh-go">Yes, look up live prices</button><button data-action="refresh-no">Cancel</button></div><p class="muted small">This asks Claude to search current flyers and prices for your store. It can take a while and uses your Claude plan.</p>'
        : `<button data-action="refresh-ask" ${pr.store ? '' : 'disabled'}>Refresh prices</button>`}
    </section>`;
  const snap = d.photo_storage ? `<section class="card"><h2 class="label">Snap a meal</h2>
      ${mr ? (mr.estimate && !mr.estimate.unclear ? `<div class="note"><b>${esc(mr.estimate.name)}</b><span>About ${mr.estimate.kcal} kcal, ${mr.estimate.protein_g} g protein. Confidence: ${esc(mr.estimate.confidence || 'low')}.</span></div><div class="row"><button class="primary" data-action="add-meal" data-kcal="${mr.estimate.kcal}" data-protein="${mr.estimate.protein_g}">Add to today</button><button data-action="clear-meal">Dismiss</button></div>` : `<p class="muted small">${mr.estimate ? 'That photo could not be read as a meal.' : 'Saved. Instant estimates need the API key; until then your coach reviews meal photos.'}</p>`) : '<p class="muted small">Take a photo and get a rough calorie estimate you can add to today.</p>'}
      <label class="file">Take or choose a photo<input type="file" accept="image/*" capture="environment" data-upload data-kind="meal"></label></section>` : '';
  return `<h1 class="page-title">Food</h1>${plan && plan.reason ? `<div class="note"><b>Coach's note</b><span>${esc(plan.reason)}</span></div>` : ''}${snap}<h2 class="label">This week</h2>${meals}${shopping}${prices}${setup}`;
}

/* ---------- reminders, Apple Health, health notes ---------- */

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function enableReminders(times) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error(standalone() ? 'This device does not support reminders.' : 'Add the app to your Home Screen first, then open it from there.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are turned off for this app. Allow them in Settings, then try again.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { key } = await api('GET', '/api/push/key');
  const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }));
  await api('POST', '/api/push/subscribe', { endpoint: sub.endpoint });
  await api('PUT', '/api/profile', { nudge_times: times });
}

function extraSettings() {
  const p = state.data.profile;
  const on = p.nudge_times.length > 0;
  const origin = location.origin;
  return `<section class="card">
      <h2 class="label">Reminders</h2>
      <p class="small">At most two a day, and only when there is something to do: a workout waiting, or a food check not yet logged.</p>
      <form id="nudges" class="stack">
        <div class="split"><label>Workout nudge<input type="time" name="t1" value="${p.nudge_times[0] || '17:30'}" required></label><label>Evening check<input type="time" name="t2" value="${p.nudge_times[1] || '21:00'}" required></label></div>
        <div class="row"><button class="primary">${on ? 'Update times' : 'Turn on reminders'}</button>${on ? '<button type="button" data-action="nudges-off">Turn off</button>' : ''}</div>
      </form>
      ${standalone() ? '' : '<p class="muted small">On iPhone, reminders only work when the app is opened from your Home Screen.</p>'}
    </section>
    <details class="card" data-keep="health" ${state.open === 'health' ? 'open' : ''}><summary>Apple Health<span>${state.syncKey ? 'Key created' : 'Set up sync'}</span></summary>
      <div class="inside">
        <p class="small">An iPhone Shortcut sends your daily active calories, steps, workout calories and weight to the app.</p>
        ${state.syncKey ? `<p class="small"><b>Your sync key.</b> Copy it now; it is shown once.</p><code>${esc(state.syncKey)}</code>` : '<button data-action="sync-key">Create a sync key</button><p class="muted small">Creating a new key stops the old one working.</p>'}
        <ol class="steps">
          <li>In the Shortcuts app, create a shortcut. Add Health actions to find today's Active Energy, Steps, Workouts and latest Weight, and total each one.</li>
          <li>Add "Get Contents of URL" with the address below, method POST.</li>
          <li>Add a header named Authorization with the value "Bearer " followed by your sync key.</li>
          <li>Set the request body to JSON with any of: active_kcal, steps, workout_kcal, workout_minutes, weight_kg (or weight_lb).</li>
          <li>Under Automation, run it every evening.</li>
        </ol>
        <code>${esc(origin)}/api/health/ingest</code>
      </div></details>
    <section class="card">
      <h2 class="label">Health notes</h2>
      <p class="small">Conditions and injuries your coach should plan around. This is not medical advice, and nothing here is shared outside your account.</p>
      ${p.conditions.length ? `<div class="chips">${p.conditions.map((c, i) => `<button data-action="del-condition" data-index="${i}" aria-label="Remove ${esc(c)}">${esc(c)} ×</button>`).join('')}</div>` : ''}
      <form id="condition" class="row"><label>Add one<input name="condition" placeholder="e.g. left knee injury, high cholesterol" required maxlength="80"></label><button class="fit" style="align-self:end">Add</button></form>
    </section>`;
}

const TABS = { today: ['Today', todayScreen], body: ['Body', bodyScreen], plan: ['Plan', planScreen], food: ['Food', foodScreen], settings: ['More', settingsScreen] };

function render() {
  draw();
  mascot.wake();
}

function draw() {
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
  mountViewer();
  mountFigure($app, (v) => { state.figView = v; });
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
  mascot.wake(); // the page below has moved
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
    if (!armed(e.submitter || form.querySelector('button.primary'), 'Tap again to save and rebuild')) return;
    const equipment = [...form.querySelectorAll('#kit [aria-pressed="true"]')].map((b) => b.dataset.kit);
    save(async () => {
      await api('PUT', '/api/profile', { primary_goal: v.primary_goal, fitness_level: v.fitness_level, minutes: Number(v.minutes), days_per_week: Number(v.days_per_week), equipment });
      await api('POST', '/api/plan/regenerate', {});
    }, 'Saved. Your plan is rebuilt.');
  } else if (form.id === 'food') {
    const diet = [...form.querySelectorAll('#diet [aria-pressed="true"]')].map((b) => b.dataset.diet);
    state.open = null;
    save(() => api('PUT', '/api/profile', { store: v.store, postal: v.postal, weekly_budget: numOrNull(v.weekly_budget), household: Number(v.household) || 1, diet }), 'Saved.');
  } else if (form.id === 'nudges') {
    save(() => enableReminders([v.t1, v.t2]), 'Reminders are on.');
  } else if (form.id === 'condition') {
    save(() => api('PUT', '/api/profile', { conditions: [...state.data.profile.conditions, v.condition] }), 'Noted. Your coach will plan around it.');
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
    state.finish = { effort: null, feeling: null, symptoms: [], hurt: false };
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
      mascot.react('pump', 900);
      const left = state.session.items.filter((i) => !i.done).length;
      toast(left ? `${left} to go.` : 'That\'s all of them.');
    }
    return render();
  }
  if (a === 'to-finish') return go('finish');
  if (a === 'effort') { state.finish.effort = Number(el.dataset.value); return render(); }
  if (a === 'symptom') { const v = el.dataset.value; const l = state.finish.symptoms; state.finish.symptoms = l.includes(v) ? l.filter((x) => x !== v) : [...l, v]; return render(); }
  if (a === 'hurt') { state.finish.hurt = true; return render(); }
  if (a === 'feeling') { state.finish.feeling = state.finish.feeling === el.dataset.value ? null : el.dataset.value; return render(); }
  if (a === 'finish') {
    const f = el.dataset.skip ? {} : { effort: state.finish.effort, feeling: state.finish.feeling, symptoms: state.finish.symptoms };
    state.result = await api('POST', `/api/workout/${state.session.id}/finish`, f);
    state.session = null;
    state.data = await api('GET', '/api/state');
    return go('celebrate');
  }
  if (a === 'cancel-workout') { if (!armed(el, 'Tap again to discard. Progress is lost.')) return; await api('POST', `/api/workout/${state.session.id}/cancel`, {}); state.session = null; state.view = 'tabs'; return load(); }

  // Body, photos, food, reminders
  if (a === 'body-view') { state.bodyView = el.dataset.value; state.open = null; return render(); }
  if (a === 'body-style') { state.bodyStyle = el.dataset.value; if (viewer) viewer.style(state.bodyStyle); el.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === el)); return; }
  if (a === 'build') return save(() => api('PUT', '/api/profile', { build: el.dataset.value }), 'Build updated.');
  if (a === 'shape-reset') { state.body = await api('PUT', '/api/body', { overrides: {} }); return render(); }
  if (a === 'del-photo') return armed(el, 'Tap again to remove') && save(() => api('DELETE', `/api/photo/${el.dataset.id}`), 'Result removed.');
  if (a === 'bought') { state.food.plan = await api('POST', '/api/food/bought', { index: Number(el.dataset.index) }); return render(); }
  if (a === 'refresh-ask') { state.confirmRefresh = true; return render(); }
  if (a === 'refresh-no') { state.confirmRefresh = false; return render(); }
  if (a === 'refresh-go') { state.confirmRefresh = false; return save(() => api('POST', '/api/food/refresh', {}), 'Refresh requested.'); }
  if (a === 'add-meal') {
    const log = state.data.today_log || {};
    state.mealResult = null;
    return save(() => api('POST', '/api/day', { calories: (log.calories || 0) + Number(el.dataset.kcal), protein_g: (log.protein_g || 0) + Number(el.dataset.protein || 0) }), 'Added to today.');
  }
  if (a === 'clear-meal') { state.mealResult = null; return render(); }
  if (a === 'nudges-off') return save(() => api('PUT', '/api/profile', { nudge_times: [] }), 'Reminders are off.');
  if (a === 'sync-key') { state.syncKey = (await api('POST', '/api/sync-key', {})).key; state.open = 'health'; return render(); }
  if (a === 'del-condition') {
    const before = state.data.profile.conditions;
    await save(() => api('PUT', '/api/profile', { conditions: before.filter((_, i) => i !== Number(el.dataset.index)) }));
    return toast('Removed.', () => api('PUT', '/api/profile', { conditions: before }));
  }

  // Everything else
  if (a === 'met') return save(() => api('POST', '/api/day', { target_met: el.dataset.value === '1' }), el.dataset.value === '1' ? streakLine('On target.') : 'Logged. Tomorrow is a fresh start.');
  if (a === 'area') return el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true');
  if (a === 'use-target') return save(() => api('POST', '/api/target', { calories: Number(el.dataset.calories), protein_g: state.data.suggested.protein_g, reason: el.dataset.reason }), 'Target set.');
  if (a === 'revert') return save(() => api('POST', '/api/target/revert', {}), 'Change undone.');
  if (a === 'rebuild') return (!('confirm' in el.dataset) || armed(el, 'Tap again to replace this week\'s plan')) && save(() => api('POST', '/api/plan/regenerate', {}), 'Plan rebuilt.');
  if (a === 'del-weight') {
    const { date, kg } = el.dataset;
    await save(() => api('DELETE', `/api/weight/${date}`));
    return toast('Entry deleted.', () => api('POST', '/api/weight', { kg: Number(kg), date }));
  }
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
  if (el && el.type !== 'range') act(el).catch((err) => toast(err.message));
});

// Goal-shape sliders: the model follows the thumb; the change is saved when it is released.
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.action !== 'shape') return;
  state.body.goal = { ...state.body.goal, [el.dataset.site]: Number(el.value) };
  document.querySelector(`[data-out="${el.dataset.site}"]`).textContent = lOut(Number(el.value));
  state.body.overrides = { ...state.body.overrides, [el.dataset.site]: Number(el.value) };
  state.bodyView = 'goal';
  state.bodyShown = 'goal';
  if (viewer) viewer.show(state.body, 'goal', false);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'shape') {
    api('PUT', '/api/body', { overrides: state.body.overrides }).then((b) => { state.body = b; }).catch((err) => toast(err.message));
  } else if ('upload' in el.dataset) {
    uploadPhoto(el).catch((err) => toast(err.message));
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

load().catch(() => { $app.innerHTML = '<div class="auth-page"><main class="auth-card"><h1>All For One</h1><p class="error">The app could not reach its server. Check your connection and reload.</p></main></div>'; });
