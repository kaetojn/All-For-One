import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import worker from '../worker/index.js';
import { resetSchemaCache } from '../worker/schema.js';
import { resetKeyCache } from '../worker/auth.js';
import { navyBodyFat, plan, weightForBodyFat } from '../worker/calc.js';
import { fakeD1 } from './d1.js';

const ORIGIN = 'https://app.test';

function app() {
  resetSchemaCache();
  resetKeyCache();
  const env = { DB: fakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const init = { method, headers: { ...headers }, redirect: 'manual' };
    if (cookie && !headers.Authorization) init.headers.Cookie = cookie;
    if (body instanceof URLSearchParams) { init.body = body.toString(); init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await worker.fetch(new Request(ORIGIN + path, init), env);
    const set = res.headers.get('Set-Cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return { call, signOut: () => { cookie = ''; } };
}

async function owner(a) {
  await a.call('POST', '/api/signup', { email: 'me@example.com', password: 'correct horse battery' });
  await a.call('PUT', '/api/profile', { sex: 'male', birth_year: 1990, height_cm: 180, activity: 'light' });
}

test('navy body fat matches a worked example', () => {
  // 180 cm man, 90 cm waist, 38 cm neck: about 19%.
  const pct = navyBodyFat({ sex: 'male', height_cm: 180, neck: 38, waist: 90 });
  assert.ok(pct > 18 && pct < 20, String(pct));
  assert.equal(navyBodyFat({ sex: 'female', height_cm: 165, neck: 33, waist: 75 }), null, 'women need hips');
  assert.ok(navyBodyFat({ sex: 'female', height_cm: 165, neck: 33, waist: 75, hips: 100 }) > 20);
});

test('a body-fat goal becomes a weight by keeping lean mass', () => {
  assert.equal(weightForBodyFat(90, 20, 15), 84.7);
});

test('an aggressive plan is allowed but comes with warnings and a safer option', () => {
  const profile = { sex: 'male', birth_year: 1990, height_cm: 180, activity: 'light' };
  const p = plan({ profile, weight_kg: 90, body_fat: 25, goal: { target_weight_kg: 75, target_date: '2026-12-31' }, today: '2026-11-15' });
  assert.equal(p.ready, true);
  assert.ok(p.calories < 1500);
  assert.deepEqual(p.warnings.map((w) => w.code).sort(), ['too_fast', 'too_low']);
  assert.ok(p.safer.calories >= 1500);
  assert.ok(p.safer.target_date > '2026-12-31');
  const gentle = plan({ profile, weight_kg: 90, body_fat: 25, goal: { target_weight_kg: 85, target_date: '2027-03-15' }, today: '2026-11-15' });
  assert.deepEqual(gentle.warnings, []);
  assert.ok(gentle.calories < gentle.maintenance);
});

test('the first account claims the app and sign-up then closes', async () => {
  const a = app();
  assert.equal((await a.call('GET', '/api/state')).data.can_sign_up, true);
  assert.equal((await a.call('POST', '/api/signup', { email: 'me@example.com', password: 'short' })).status, 400);
  assert.equal((await a.call('POST', '/api/signup', { email: 'me@example.com', password: 'correct horse battery' })).status, 201);
  assert.equal((await a.call('GET', '/api/state')).data.signed_in, true);
  a.signOut();
  assert.equal((await a.call('POST', '/api/signup', { email: 'other@example.com', password: 'another password' })).status, 403);
  assert.equal((await a.call('GET', '/api/history')).status, 401);
  assert.equal((await a.call('POST', '/api/login', { email: 'me@example.com', password: 'wrong password!' })).status, 401);
  assert.equal((await a.call('POST', '/api/login', { email: 'ME@example.com', password: 'correct horse battery' })).status, 200);
  assert.equal((await a.call('GET', '/api/history')).status, 200);
});

test('a forged session cookie is refused', async () => {
  const a = app();
  await owner(a);
  const forged = Buffer.from(JSON.stringify({ uid: 'x', exp: Date.now() + 1e9 })).toString('base64url') + '.AAAA';
  const res = await a.call('GET', '/api/history', undefined, { Cookie: `afo_session=${forged}`, Authorization: 'none' });
  assert.equal(res.status, 401);
});

test('cross-site writes are refused', async () => {
  const a = app();
  await owner(a);
  assert.equal((await a.call('POST', '/api/weight', { kg: 80 }, { Origin: 'https://evil.test' })).status, 403);
});

test('tracking: weight, measurements, day log, goal and target flow into the overview', async () => {
  const a = app();
  await owner(a);
  assert.equal((await a.call('POST', '/api/weight', { kg: 5 })).status, 400);
  assert.equal((await a.call('POST', '/api/weight', { kg: 90, date: '2026-11-01' })).status, 200);
  await a.call('POST', '/api/weight', { kg: 89.2 });
  assert.equal((await a.call('POST', '/api/measurements', { values: { elbow: 30 } })).status, 400);
  await a.call('POST', '/api/measurements', { date: '2026-11-01', values: { neck: 38, waist: 95 } });
  await a.call('POST', '/api/measurements', { values: { waist: 93 } }); // neck carries forward
  await a.call('POST', '/api/day', { calories: 2100, target_met: true });
  await a.call('POST', '/api/day', { protein_g: 150 }); // keeps calories
  const future = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  assert.equal((await a.call('PUT', '/api/goal', { target_date: '2020-01-01', target_body_fat: 15 })).status, 400);
  assert.equal((await a.call('PUT', '/api/goal', { target_date: future })).status, 400);
  const goal = await a.call('PUT', '/api/goal', { target_date: future, target_body_fat: 15, target_areas: ['waist', 'abs', 'nonsense'] });
  assert.deepEqual(goal.data.target_areas, ['waist', 'abs']);

  const s = (await a.call('GET', '/api/state')).data;
  assert.equal(s.latest.weight.kg, 89.2);
  assert.equal(s.latest.measurements.neck, 38);
  assert.equal(s.latest.measurements.waist, 93);
  assert.ok(s.latest.body_fat.pct > 15);
  assert.deepEqual(s.today_log, { calories: 2100, protein_g: 150, target_met: true, note: null });
  assert.equal(s.suggested.ready, true);
  assert.ok(s.suggested.target_weight_kg < 89.2);
  assert.ok(s.suggested.calories < s.suggested.maintenance);
  assert.equal(s.target, null);

  await a.call('POST', '/api/target', { calories: 2200, protein_g: 160, reason: 'Start' });
  await a.call('POST', '/api/target', { calories: 2000, reason: 'Tighter' });
  assert.equal((await a.call('GET', '/api/state')).data.target.calories, 2000);
  assert.equal((await a.call('POST', '/api/target/revert', {})).data.target.calories, 2200);
  const h = (await a.call('GET', '/api/history?days=30')).data;
  assert.equal(h.weights.length, 2);
  assert.equal(h.body_fat.length, 2);
  assert.equal(h.days.length, 1);
});

async function connect(a) {
  const reg = await a.call('POST', '/oauth/register', { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
  assert.equal(reg.status, 201);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const params = { client_id: reg.data.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz' };
  return { reg, verifier, params };
}

test('claude connector: discovery, sign-in, tokens and tools', async () => {
  const a = app();
  await owner(a);
  a.signOut();

  const unauth = await a.call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get('WWW-Authenticate'), /resource_metadata="https:\/\/app\.test\/\.well-known\/oauth-protected-resource"/);
  assert.equal((await a.call('GET', '/.well-known/oauth-protected-resource/mcp')).data.resource, ORIGIN + '/mcp');
  assert.equal((await a.call('GET', '/.well-known/oauth-authorization-server')).data.token_endpoint, ORIGIN + '/oauth/token');

  const { verifier, params } = await connect(a);
  const pageRes = await a.call('GET', '/oauth/authorize?' + new URLSearchParams(params));
  assert.equal(pageRes.status, 200);
  assert.match(pageRes.data, /name="password"/);

  const bad = await a.call('POST', '/oauth/authorize', new URLSearchParams({ ...params, decision: 'allow', email: 'me@example.com', password: 'nope nope nope' }));
  assert.equal(bad.status, 401);
  const denied = await a.call('POST', '/oauth/authorize', new URLSearchParams({ ...params, decision: 'deny' }));
  assert.match(denied.headers.get('Location'), /error=access_denied/);

  const ok = await a.call('POST', '/oauth/authorize', new URLSearchParams({ ...params, decision: 'allow', email: 'me@example.com', password: 'correct horse battery' }));
  assert.equal(ok.status, 302);
  const back = new URL(ok.headers.get('Location'));
  assert.equal(back.searchParams.get('state'), 'xyz');
  const code = back.searchParams.get('code');

  const exchange = (v) => a.call('POST', '/oauth/token', new URLSearchParams({ grant_type: 'authorization_code', code, client_id: params.client_id, redirect_uri: params.redirect_uri, code_verifier: v }));
  assert.equal((await exchange('wrong-verifier')).status, 400);
  assert.equal((await exchange(verifier)).status, 400, 'a code is single use, even after a failed attempt');

  // Go round again for a fresh code.
  const ok2 = await a.call('POST', '/oauth/authorize', new URLSearchParams({ ...params, decision: 'allow' })); // session cookie from the first sign-in
  const code2 = new URL(ok2.headers.get('Location')).searchParams.get('code');
  const tokens = await a.call('POST', '/oauth/token', new URLSearchParams({ grant_type: 'authorization_code', code: code2, client_id: params.client_id, redirect_uri: params.redirect_uri, code_verifier: verifier }));
  assert.equal(tokens.status, 200);
  const auth = { Authorization: `Bearer ${tokens.data.access_token}` };
  const rpc = (method, p, id = 1) => a.call('POST', '/mcp', { jsonrpc: '2.0', id, method, params: p }, auth);

  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.data.result.protocolVersion, '2025-06-18');
  assert.equal((await a.call('POST', '/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, auth)).status, 202);
  const list = await rpc('tools/list');
  assert.ok(list.data.result.tools.length >= 8);
  assert.ok(list.data.result.tools.every((t) => t.inputSchema.type === 'object'));

  const logged = await rpc('tools/call', { name: 'log_weight', arguments: { kg: 88.4 } });
  assert.equal(JSON.parse(logged.data.result.content[0].text).kg, 88.4);
  const invalid = await rpc('tools/call', { name: 'log_weight', arguments: { kg: 1 } });
  assert.equal(invalid.data.result.isError, true);
  await rpc('tools/call', { name: 'set_calorie_target', arguments: { calories: 2050, reason: 'Weekly review: on pace.' } });
  const over = JSON.parse((await rpc('tools/call', { name: 'get_overview', arguments: {} })).data.result.content[0].text);
  assert.equal(over.latest.weight.kg, 88.4);
  assert.equal(over.target.set_by, 'claude');
  assert.equal((await rpc('nope')).data.error.code, -32601);

  const refreshed = await a.call('POST', '/oauth/token', new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.data.refresh_token, client_id: params.client_id }));
  assert.equal(refreshed.status, 200);
  const reused = await a.call('POST', '/oauth/token', new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.data.refresh_token }));
  assert.equal(reused.status, 400, 'refresh tokens rotate');
  assert.equal((await a.call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { Authorization: 'Bearer made-up' })).status, 401);
});

test('authorize refuses unregistered apps and mismatched return addresses', async () => {
  const a = app();
  await owner(a);
  const { params } = await connect(a);
  assert.equal((await a.call('GET', '/oauth/authorize?' + new URLSearchParams({ ...params, client_id: 'unknown' }))).status, 400);
  assert.equal((await a.call('GET', '/oauth/authorize?' + new URLSearchParams({ ...params, redirect_uri: 'https://evil.test/cb' }))).status, 400);
  assert.equal((await a.call('POST', '/oauth/register', { redirect_uris: ['javascript:alert(1)'] })).status, 400);
});

test('everything else is served from the static assets', async () => {
  const a = app();
  assert.equal((await a.call('GET', '/')).data, 'asset');
});

const ANSWERS = { fitness_level: 'beginner', primary_goal: 'fat_loss', minutes: 30, days_per_week: 3, equipment: ['dumbbell'], sex: 'male', birth_year: 1990, height_cm: 180, weight_kg: 90 };

test('onboarding builds a plan and the workout loop prefills from last time', async () => {
  const a = app();
  await a.call('POST', '/api/signup', { email: 'me@example.com', password: 'correct horse battery' });
  assert.equal((await a.call('POST', '/api/onboarding', { ...ANSWERS, sex: undefined })).status, 400);
  const home = (await a.call('POST', '/api/onboarding', ANSWERS)).data;
  assert.ok(home.profile.onboarded_at);
  assert.deepEqual(home.profile.equipment, ['dumbbell']);
  assert.equal(home.latest.weight.kg, 90);
  assert.equal(home.streak.days, 1, 'the weigh-in counts as a check-in');
  assert.equal(home.streak.stage, 'ember');
  assert.deepEqual(home.workout.week, { done: 0, goal: 3 });
  assert.equal(home.workout.next.day_index, 0);
  assert.ok(home.workout.next.exercises.length >= 3);
  assert.ok(home.workout.next.exercises.every((x) => x.name && ['body only', 'dumbbell'].includes(x.equipment)));
  assert.equal(home.unlocks.trends, false);

  const s = (await a.call('POST', '/api/workout/start', {})).data;
  assert.equal(s.status, 'active');
  assert.equal((await a.call('POST', '/api/workout/start', {})).data.id, s.id, 'starting again resumes');
  await a.call('POST', `/api/workout/${s.id}/item`, { position: 0, done: true, weight_kg: 12.5, reps: 14 });
  const after = (await a.call('POST', `/api/workout/${s.id}/item`, { position: 1, done: true })).data;
  assert.equal(after.items[0].weight_kg, 12.5);
  assert.equal((await a.call('POST', `/api/workout/${s.id}/item`, { position: 15, done: true })).status, 404);
  const fin = (await a.call('POST', `/api/workout/${s.id}/finish`, { effort: 7, feeling: 'strong' })).data;
  assert.equal(fin.win, 'First workout of the week. You showed up.');
  assert.match(fin.effort_meaning, /sustainable/);

  const state = (await a.call('GET', '/api/state')).data;
  assert.equal(state.workout.week.done, 1);
  assert.equal(state.workout.done_today.day_name, s.day_name);
  assert.equal(state.workout.next.day_index, 1, 'the plan moves on to the next day');

  // Jump back to the first day: last time's weight and reps come pre-filled.
  const again = (await a.call('POST', '/api/workout/start', { day_index: 0 })).data;
  assert.equal(again.items[0].weight_kg, 12.5);
  assert.equal(again.items[0].reps, 14);
  assert.equal((await a.call('POST', `/api/workout/${again.id}/cancel`, {})).status, 200);
  assert.equal((await a.call('GET', '/api/state')).data.workout.active, null);
  assert.equal((await a.call('GET', '/api/workouts')).data.length, 1);
  assert.equal((await a.call('POST', '/api/workout/00000000-0000-0000-0000-000000000000/finish', {})).status, 404);

  await a.call('PUT', '/api/profile', { show_all: true });
  assert.equal((await a.call('GET', '/api/state')).data.unlocks.fine_tuning, true);
});

test('win messages and plans', async () => {
  const { winMessage } = await import('../worker/workouts.js');
  const { buildPlan, BY_ID } = await import('../worker/planner.js');
  assert.equal(winMessage(3, 5), "3rd workout this week. You're locked in.");
  assert.equal(winMessage(2, 5), "2nd workout this week. You're locked in.");
  assert.equal(winMessage(3, 3), "That's all 3 for the week. Goal hit.");
  assert.equal(winMessage(4, 3), 'Bonus session. Above and beyond.');
  for (const days of [1, 2, 3, 4, 5, 6, 7]) {
    const plan = buildPlan({ days_per_week: days, minutes: 45, fitness_level: 'beginner', primary_goal: 'consistency', equipment: [] }, ['abs']);
    assert.equal(plan.days.length, days);
    for (const d of plan.days) {
      assert.ok(d.exercises.length >= 3, `${d.name} is too short`);
      assert.equal(new Set(d.exercises.map((x) => x.exercise_id)).size, d.exercises.length, 'no repeats within a day');
      for (const x of d.exercises) {
        const e = BY_ID.get(x.exercise_id);
        assert.equal(e.equipment, 'body only');
        assert.equal(e.level, 'beginner');
        assert.doesNotMatch(e.name, /chin|pull-?up/i, 'no bar, no pull-ups');
      }
    }
  }
});

test('claude can read and replace the workout plan', async () => {
  const a = app();
  await a.call('POST', '/api/signup', { email: 'me@example.com', password: 'correct horse battery' });
  await a.call('POST', '/api/onboarding', ANSWERS);
  const { verifier, params } = await connect(a);
  const ok = await a.call('POST', '/oauth/authorize', new URLSearchParams({ ...params, decision: 'allow' }));
  const code = new URL(ok.headers.get('Location')).searchParams.get('code');
  const tokens = await a.call('POST', '/oauth/token', new URLSearchParams({ grant_type: 'authorization_code', code, client_id: params.client_id, redirect_uri: params.redirect_uri, code_verifier: verifier }));
  const tool = async (name, args = {}) => {
    const res = await a.call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { Authorization: `Bearer ${tokens.data.access_token}` });
    const text = res.data.result.content[0].text;
    return res.data.result.isError ? { error: text } : JSON.parse(text);
  };
  assert.equal((await tool('get_workout_plan')).set_by, 'app');
  const found = await tool('search_exercises', { muscle: 'chest', equipment: 'dumbbell', limit: 3 });
  assert.equal(found.length, 3);
  assert.ok(found.every((e) => e.equipment === 'dumbbell'));
  assert.match((await tool('set_workout_plan', { days: [{ name: 'A', exercises: [{ exercise_id: 'made-up' }] }], reason: 'x' })).error, /Unknown exercise/);
  const plan = await tool('set_workout_plan', { days: [{ name: 'Chest day', exercises: found.map((e) => ({ exercise_id: e.id, sets: 3, reps: 10 })) }], reason: 'More chest work, as you asked.' });
  assert.equal(plan.set_by, 'claude');
  assert.equal(plan.days[0].exercises[0].name, found[0].name);
  const over = await tool('get_overview');
  assert.equal(over.workout.next.name, 'Chest day');
  assert.equal(over.profile.days_per_week, 3);
  assert.deepEqual(await tool('get_workouts'), []);
  assert.deepEqual((await tool('update_profile', { equipment: ['dumbbell', 'bands'] })).equipment, ['dumbbell', 'bands']);
});
