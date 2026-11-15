// All For One web app. No build step and no dependencies: this file is served as written.
// The server stores metric values; this file converts for display when the profile says imperial.

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const state = { data: null, tab: 'today', history: null, targets: null, authError: '' };

const SITES = ['neck', 'shoulders', 'chest', 'waist', 'belly', 'hips', 'bicep', 'forearm', 'thigh', 'calf'];
const AREAS = ['abs', 'waist', 'chest', 'shoulders', 'back', 'arms', 'glutes', 'legs', 'calf'];
const ACTIVITY = {
  sedentary: 'Mostly sitting, little exercise',
  light: '1 to 3 workouts a week',
  moderate: '3 to 5 workouts a week',
  active: '6 to 7 workouts a week',
  very_active: 'Physical job plus training',
};
const LB = 2.20462;
const IN = 2.54;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const imperial = () => state.data?.profile?.units === 'imperial';
const r1 = (n) => Math.round(n * 10) / 10;
const wUnit = () => (imperial() ? 'lb' : 'kg');
const lUnit = () => (imperial() ? 'in' : 'cm');
const wOut = (kg) => (kg == null ? '' : r1(imperial() ? kg * LB : kg));
const wIn = (v) => (v === '' || v == null ? null : imperial() ? Number(v) / LB : Number(v));
const lOut = (cm) => (cm == null ? '' : r1(imperial() ? cm / IN : cm));
const lIn = (v) => (v === '' || v == null ? null : imperial() ? Number(v) * IN : Number(v));
const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const longDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

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
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

async function load() {
  state.data = await api('GET', '/api/state');
  if (state.data.signed_in) {
    if (state.tab === 'progress') state.history = await api('GET', '/api/history?days=90');
    if (state.tab === 'plan') state.targets = await api('GET', '/api/targets');
  }
  render();
}

// Run a save, then reload and say what happened. Errors show as a toast instead of failing silently.
async function save(work, message) {
  try {
    await work();
    await load();
    if (message) toast(message);
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- screens ---------- */

function authScreen() {
  const claim = state.data.can_sign_up;
  return `<div class="auth-page"><main class="auth-card">
    <h1>All For One</h1>
    <p class="muted">${claim ? 'Nobody owns this app yet. Create your account to claim it; sign-up closes after that.' : 'Sign in to your tracker.'}</p>
    ${state.authError ? `<p class="error">${esc(state.authError)}</p>` : ''}
    <form id="auth" data-mode="${claim ? 'signup' : 'login'}">
      <label>Email<input name="email" type="email" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="${claim ? 'new-password' : 'current-password'}" minlength="${claim ? 10 : 1}" required></label>
      ${claim ? '<p class="muted small">At least 10 characters.</p>' : ''}
      <button class="primary">${claim ? 'Create account' : 'Sign in'}</button>
    </form>
  </main></div>`;
}

function profileComplete() {
  const p = state.data.profile;
  return p.sex && p.birth_year && p.height_cm;
}

function todayScreen() {
  const d = state.data;
  const log = d.today_log || {};
  const t = d.target;
  const s = d.suggested;
  const eaten = log.calories;
  const pct = t && eaten != null ? Math.min(100, Math.round((eaten / t.calories) * 100)) : 0;

  let hero;
  if (t) {
    hero = `<section class="card hero">
      <h2>Daily target</h2>
      <p class="big">${t.calories}<small>kcal</small></p>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="muted small">${eaten != null ? `${eaten} eaten, ${Math.max(0, t.calories - eaten)} left` : 'Nothing logged yet today'}${t.protein_g ? ` · protein ${log.protein_g ?? 0} of ${t.protein_g} g` : ''}</p>
    </section>`;
  } else if (!profileComplete()) {
    hero = `<section class="card hero"><h2>Start here</h2><p>Add your sex, birth year and height so the app can work out your energy needs.</p><button class="primary" data-tab="settings">Finish profile</button></section>`;
  } else if (!d.latest.weight) {
    hero = `<section class="card hero"><h2>Next step</h2><p>Log your weight below. It is the last thing needed to work out a calorie target.</p></section>`;
  } else if (!d.goal) {
    hero = `<section class="card hero"><h2>Next step</h2><p>Set a goal and a date. Maintenance for you is about ${s.maintenance} kcal a day.</p><button class="primary" data-tab="plan">Set a goal</button></section>`;
  } else {
    hero = `<section class="card hero"><h2>Next step</h2><p>Your goal is set. Choose a calorie target to start tracking against it.</p><button class="primary" data-tab="plan">Choose target</button></section>`;
  }

  const note = t && t.set_by === 'claude' && t.reason
    ? `<section class="card"><h2>Coach's note · ${niceDate(t.created_at.slice(0, 10))}</h2><p>${esc(t.reason)}</p><button class="link fit" data-action="revert">Undo this change</button></section>`
    : '';

  return `<header class="head"><h1>Today</h1><span class="muted small">${longDate(d.today)}</span></header>
    ${hero}${note}
    <section class="card">
      <h2>Daily check</h2>
      <div class="choice">
        <button data-action="met" data-value="1" aria-pressed="${log.target_met === true}">On target</button>
        <button data-action="met" data-value="0" aria-pressed="${log.target_met === false}">Missed it</button>
      </div>
      <form id="day" class="split">
        <label>Calories eaten<input name="calories" inputmode="numeric" value="${log.calories ?? ''}" placeholder="optional"></label>
        <label>Protein (g)<input name="protein_g" inputmode="numeric" value="${log.protein_g ?? ''}" placeholder="optional"></label>
        <label style="grid-column:1/-1">Note<input name="note" value="${esc(log.note ?? '')}" placeholder="How did today go?"></label>
        <button class="primary" style="grid-column:1/-1">Save</button>
      </form>
      <p class="muted small">${d.last_7_days.target_met} of the last 7 days on target.</p>
    </section>
    <section class="card">
      <h2>Weight</h2>
      <form id="weight" class="row">
        <label>Today (${wUnit()})<input name="weight" inputmode="decimal" required placeholder="${d.latest.weight ? wOut(d.latest.weight.kg) : ''}"></label>
        <button class="primary fit" style="align-self:end">Log</button>
      </form>
      ${d.latest.weight ? `<p class="muted small">Last: ${wOut(d.latest.weight.kg)} ${wUnit()} on ${niceDate(d.latest.weight.date)}</p>` : ''}
    </section>`;
}

function chart(points, goal) {
  if (points.length < 2) return `<p class="muted small">Log weight on two or more days to see a trend.</p>`;
  const W = 320, H = 150, L = 34, R = 8, T = 10, B = 22;
  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.v);
  let lo = Math.min(...ys, goal ?? Infinity), hi = Math.max(...ys, goal ?? -Infinity);
  const pad = Math.max(0.5, (hi - lo) * 0.1); lo -= pad; hi += pad;
  const x = (t) => L + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight from ${niceDate(points[0].date)} to ${niceDate(last.date)}: ${points[0].v} to ${last.v} ${wUnit()}">
    <line x1="${L}" x2="${W - R}" y1="${y(hi - pad)}" y2="${y(hi - pad)}"/><line x1="${L}" x2="${W - R}" y1="${y(lo + pad)}" y2="${y(lo + pad)}"/>
    <text x="0" y="${y(hi - pad) + 4}">${r1(hi - pad)}</text><text x="0" y="${y(lo + pad) + 4}">${r1(lo + pad)}</text>
    ${goal != null ? `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke-dasharray="4 4" style="stroke:var(--good)"/><text x="${W - R}" y="${y(goal) - 4}" text-anchor="end">goal ${goal}</text>` : ''}
    <path class="line" d="${path}"/><circle cx="${x(xs[xs.length - 1])}" cy="${y(last.v)}" r="4"/>
    <text x="${L}" y="${H - 4}">${niceDate(points[0].date)}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${niceDate(last.date)}</text>
  </svg>`;
}

function progressScreen() {
  const d = state.data;
  const h = state.history;
  if (!h) return `<header class="head"><h1>Progress</h1></header><p class="muted">Loading…</p>`;
  const points = h.weights.map((w) => ({ date: w.date, v: wOut(w.kg) }));
  const goalW = d.suggested.target_weight_kg ? wOut(d.suggested.target_weight_kg) : null;
  const first = h.weights[0], last = h.weights[h.weights.length - 1];
  const change = first && last && first !== last ? r1(wOut(last.kg) - wOut(first.kg)) : null;
  const bf = d.latest.body_fat;
  const m = d.latest.measurements;
  const needs = d.profile.sex === 'female' ? 'neck, waist and hips' : 'neck and waist';
  return `<header class="head"><h1>Progress</h1><span class="muted small">Last 90 days</span></header>
    <section class="card">
      <div class="split">
        <div class="stat"><b>${last ? `${wOut(last.kg)} ${wUnit()}` : '—'}</b><span>Weight${change != null ? ` · ${change > 0 ? '+' : ''}${change} in this period` : ''}</span></div>
        <div class="stat"><b>${bf ? `${bf.pct}%` : '—'}</b><span>Body fat${bf ? ` · measured ${niceDate(bf.date)}` : ''}</span></div>
      </div>
      ${chart(points, goalW)}
    </section>
    <section class="card">
      <h2>Tape measurements (${lUnit()})</h2>
      <p class="muted small">Body fat is calculated from ${needs} plus your height. Fill in only what you measured today; the rest carries over.</p>
      <form id="measure" class="split">
        ${SITES.map((s) => `<label>${cap(s)}<input name="${s}" inputmode="decimal" placeholder="${lOut(m[s]) || ''}"></label>`).join('')}
        <button class="primary" style="grid-column:1/-1">Save measurements</button>
      </form>
    </section>
    ${h.body_fat.length > 1 ? `<section class="card"><h2>Body fat history</h2><div class="list">${h.body_fat.slice().reverse().map((p) => `<div><span>${niceDate(p.date)}</span><b>${p.pct}%</b></div>`).join('')}</div></section>` : ''}
    ${h.weights.length ? `<section class="card"><h2>Weight entries</h2><div class="list">${h.weights.slice().reverse().slice(0, 14).map((w) => `<div><span>${niceDate(w.date)}${w.source !== 'manual' ? ` <span class="muted small">· ${esc(w.source)}</span>` : ''}</span><span><b>${wOut(w.kg)} ${wUnit()}</b> <button class="link" data-action="del-weight" data-date="${w.date}" aria-label="Delete weight for ${niceDate(w.date)}">Delete</button></span></div>`).join('')}</div></section>` : ''}`;
}

function planScreen() {
  const d = state.data;
  const g = d.goal;
  const s = d.suggested;
  const areas = new Set(g ? g.target_areas : []);
  let suggestion = '';
  if (!s.ready) {
    suggestion = `<section class="card"><h2>Calorie target</h2><p>To work out a target the app still needs: ${esc(s.missing.join(', '))}.</p></section>`;
  } else {
    const weekly = s.weekly_change_kg ? `${s.weekly_change_kg > 0 ? '+' : ''}${wOut(s.weekly_change_kg)} ${wUnit()} a week` : 'holding steady';
    suggestion = `<section class="card">
      <h2>What your goal asks for</h2>
      <div class="split">
        <div class="stat"><b>${s.calories}</b><span>kcal a day · ${weekly}</span></div>
        <div class="stat"><b>${s.maintenance}</b><span>kcal to maintain</span></div>
      </div>
      ${s.target_weight_kg ? `<p class="muted small">Goal weight about ${wOut(s.target_weight_kg)} ${wUnit()}${g && g.target_body_fat && !g.target_weight_kg ? `, worked out from ${g.target_body_fat}% body fat with muscle kept` : ''}. Protein ${s.protein_g} g a day.</p>` : ''}
      ${s.missing ? `<p class="muted small">Still needed: ${esc(s.missing.join(', '))}.</p>` : ''}
      ${s.warnings.length ? `<div class="notice"><b>This pace is aggressive</b>${s.warnings.map((w) => `<span>${esc(w.message)}</span>`).join('')}${s.safer ? `<span>A safer plan is ${s.safer.calories} kcal a day, reaching the goal around ${niceDate(s.safer.target_date)} ${s.safer.target_date.slice(0, 4)}.</span>` : ''}</div>` : ''}
      <div class="row">
        ${s.safer ? `<button class="primary" data-action="use-target" data-calories="${s.safer.calories}" data-reason="Safer pace than the timeline asks for">Use ${s.safer.calories}</button><button data-action="use-target" data-calories="${s.calories}" data-reason="Matches the goal timeline, set despite the pace warning">Use ${s.calories} anyway</button>`
          : `<button class="primary" data-action="use-target" data-calories="${s.calories}" data-reason="Matches the goal timeline">Use ${s.calories} kcal</button>`}
      </div>
      <form id="custom-target" class="row"><label>Or set your own (kcal)<input name="calories" inputmode="numeric" required></label><button class="fit" style="align-self:end">Set</button></form>
    </section>`;
  }
  const hist = state.targets || [];
  return `<header class="head"><h1>Plan</h1></header>
    <section class="card">
      <h2>Goal</h2>
      <form id="goal" style="display:grid;gap:12px">
        <div class="split">
          <label>Target body fat (%)<input name="target_body_fat" inputmode="decimal" value="${g?.target_body_fat ?? ''}"></label>
          <label>Target weight (${wUnit()})<input name="target_weight" inputmode="decimal" value="${g?.target_weight_kg ? wOut(g.target_weight_kg) : ''}" placeholder="optional"></label>
        </div>
        <label>Reach it by<input name="target_date" type="date" value="${g?.target_date ?? ''}" min="${d.today}" required></label>
        <div style="display:grid;gap:6px"><span class="small muted" style="font-weight:600;font-size:.8rem">Areas to define</span><div class="chips" id="areas">${AREAS.map((a) => `<button type="button" data-action="area" data-area="${a}" aria-pressed="${areas.has(a)}">${cap(a === 'calf' ? 'calves' : a)}</button>`).join('')}</div></div>
        <button class="primary">${g ? 'Update goal' : 'Set goal'}</button>
      </form>
    </section>
    ${suggestion}
    ${hist.length ? `<section class="card"><h2>Target history</h2><div class="list">${hist.map((t, i) => `<div><span><b>${t.calories} kcal</b>${t.protein_g ? ` · ${t.protein_g} g protein` : ''}<br><span class="muted small">${niceDate(t.created_at.slice(0, 10))} · set by ${esc(t.set_by)}${t.reverted_at ? ' · undone' : ''}${t.reason ? `<br>${esc(t.reason)}` : ''}</span></span>${!t.reverted_at && t === hist.find((x) => !x.reverted_at) ? '<button class="link fit" data-action="revert">Undo</button>' : ''}</div>`).join('')}</div></section>` : ''}`;
}

function settingsScreen() {
  const d = state.data;
  const p = d.profile;
  const url = `${location.origin}/mcp`;
  return `<header class="head"><h1>Settings</h1></header>
    <section class="card">
      <h2>Profile</h2>
      <form id="profile" style="display:grid;gap:12px">
        <label>Sex, used only for the body-fat and energy formulas
          <select name="sex" required><option value="" ${p.sex ? '' : 'selected'} disabled>Choose</option><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
        <div class="split">
          <label>Birth year<input name="birth_year" inputmode="numeric" value="${p.birth_year ?? ''}" required></label>
          <label>Height (${lUnit()})<input name="height" inputmode="decimal" value="${lOut(p.height_cm)}" required></label>
        </div>
        <label>Activity<select name="activity">${Object.entries(ACTIVITY).map(([k, v]) => `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <div class="split">
          <label>Units<select name="units"><option value="metric" ${p.units === 'metric' ? 'selected' : ''}>kg and cm</option><option value="imperial" ${p.units === 'imperial' ? 'selected' : ''}>lb and inches</option></select></label>
          <label>Coach review<select name="review_cadence"><option value="weekly" ${p.review_cadence === 'weekly' ? 'selected' : ''}>Every week</option><option value="biweekly" ${p.review_cadence === 'biweekly' ? 'selected' : ''}>Every 2 weeks</option><option value="monthly" ${p.review_cadence === 'monthly' ? 'selected' : ''}>Every month</option></select></label>
        </div>
        <button class="primary">Save profile</button>
      </form>
    </section>
    <section class="card">
      <h2>Connect Claude</h2>
      <p class="small">In Claude, add a custom connector with this address, then sign in with your All For One email and password when asked.</p>
      <code id="mcp-url">${esc(url)}</code>
      <button data-action="copy" data-text="${esc(url)}">Copy address</button>
    </section>
    <section class="card">
      <p class="muted small">Signed in as ${esc(d.user.email)}</p>
      <button data-action="logout">Sign out</button>
    </section>`;
}

const TABS = { today: ['Today', todayScreen], progress: ['Progress', progressScreen], plan: ['Plan', planScreen], settings: ['Settings', settingsScreen] };

function render() {
  if (!state.data) { $app.innerHTML = ''; return; }
  if (!state.data.signed_in) { $app.innerHTML = authScreen(); return; }
  $app.innerHTML = `<div class="shell">${TABS[state.tab][1]()}</div>
    <nav class="tabs" aria-label="Sections">${Object.entries(TABS).map(([k, [label]]) => `<button data-tab="${k}" ${state.tab === k ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
}

/* ---------- events ---------- */

const values = (form) => Object.fromEntries(new FormData(form));
const numOrNull = (v) => (v === '' ? null : Number(v));

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const v = values(form);
  if (form.id === 'auth') {
    api('POST', form.dataset.mode === 'signup' ? '/api/signup' : '/api/login', v)
      .then(() => { state.authError = ''; return load(); })
      .catch((err) => { state.authError = err.message; render(); });
  } else if (form.id === 'day') {
    save(() => api('POST', '/api/day', { calories: numOrNull(v.calories), protein_g: numOrNull(v.protein_g), note: v.note }), 'Saved');
  } else if (form.id === 'weight') {
    save(() => api('POST', '/api/weight', { kg: wIn(v.weight) }), 'Weight logged');
  } else if (form.id === 'measure') {
    const out = {};
    for (const s of SITES) if (v[s] !== '') out[s] = lIn(v[s]);
    save(() => api('POST', '/api/measurements', { values: out }), 'Measurements saved');
  } else if (form.id === 'goal') {
    const target_areas = [...form.querySelectorAll('#areas [aria-pressed="true"]')].map((b) => b.dataset.area);
    save(() => api('PUT', '/api/goal', { target_body_fat: numOrNull(v.target_body_fat), target_weight_kg: wIn(v.target_weight), target_date: v.target_date, target_areas }), 'Goal saved');
  } else if (form.id === 'custom-target') {
    save(() => api('POST', '/api/target', { calories: Number(v.calories), protein_g: state.data.suggested.protein_g, reason: 'Set by hand' }), 'Target set');
  } else if (form.id === 'profile') {
    // Height is typed in the units shown on screen, which are the ones saved before this change.
    save(() => api('PUT', '/api/profile', { sex: v.sex, birth_year: Number(v.birth_year), height_cm: lIn(v.height), activity: v.activity, units: v.units, review_cadence: v.review_cadence }), 'Profile saved');
  }
});

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    render();
    window.scrollTo(0, 0);
    load().catch((err) => toast(err.message));
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'met') save(() => api('POST', '/api/day', { target_met: el.dataset.value === '1' }), el.dataset.value === '1' ? 'Nice work' : 'Logged');
  else if (a === 'area') el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true');
  else if (a === 'use-target') save(() => api('POST', '/api/target', { calories: Number(el.dataset.calories), protein_g: state.data.suggested.protein_g, reason: el.dataset.reason }), 'Target set');
  else if (a === 'revert') save(() => api('POST', '/api/target/revert', {}), 'Change undone');
  else if (a === 'del-weight') save(() => api('DELETE', `/api/weight/${el.dataset.date}`), 'Entry deleted');
  else if (a === 'copy') navigator.clipboard.writeText(el.dataset.text).then(() => toast('Copied'), () => toast('Copy failed. Select the address and copy it by hand.'));
  else if (a === 'logout') api('POST', '/api/logout', {}).then(load);
});

load().catch(() => { $app.innerHTML = '<div class="auth-page"><main class="auth-card"><h1>All For One</h1><p class="error">The app could not reach its server. Check your connection and reload.</p></main></div>'; });
