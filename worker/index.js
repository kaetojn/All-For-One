// All For One backend: one Cloudflare Worker.
//
// It does four jobs:
//   1. Serves the web app from public/.
//   2. Accounts and the app's own API (/api/*), signed in with a cookie.
//   3. OAuth sign-in for Claude (/oauth/*, /.well-known/*).
//   4. The Claude connector (/mcp).
//   5. Reminders, on a 15-minute timer.
//
// Bindings (wrangler.toml): DB is the D1 database, ASSETS is the public/ folder, PHOTOS is the R2 bucket.
// Secret: ANTHROPIC_API_KEY turns on instant photo estimates. Without it photos wait for Claude's review.

import { ensureSchema } from './schema.js';
import { HttpError, signUp, checkPassword, sessionCookie, clearCookie, sessionUser, userCount } from './auth.js';
import * as oauth from './oauth.js';
import { mcp } from './mcp.js';
import * as store from './store.js';
import * as workouts from './workouts.js';
import * as coach from './coach.js';
import * as meals from './meals.js';
import * as photos from './photos.js';
import * as body3d from './body.js';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

async function api(db, request, path, env) {
  const method = request.method;
  // The iPhone Shortcut signs in with its own key, not a cookie.
  if (path === '/api/health/ingest' && method === 'POST') return json(await coach.healthIngest(db, request));
  // The cookie is SameSite=Lax, which already keeps other sites from sending it on writes.
  // Checking Origin as well covers browsers that don't enforce that.
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-site request refused.');
  }
  const binary = path === '/api/photos' && method === 'POST';
  const body = method === 'GET' || method === 'DELETE' || binary ? {} : await request.json().catch(() => { throw new HttpError(400, 'Send JSON.'); });

  if (path === '/api/signup' && method === 'POST') {
    const user = await signUp(db, body.email, body.password);
    return json({ user }, 201, { 'Set-Cookie': await sessionCookie(db, user.id) });
  }
  if (path === '/api/login' && method === 'POST') {
    const user = await checkPassword(db, body.email, body.password);
    return json({ user }, 200, { 'Set-Cookie': await sessionCookie(db, user.id) });
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });

  const user = await sessionUser(db, request);
  if (path === '/api/state' && method === 'GET') {
    if (!user) return json({ signed_in: false, can_sign_up: (await userCount(db)) === 0 });
    const state = await workouts.home(db, user.id);
    const last = await coach.latestReview(db, user.id);
    return json({ signed_in: true, user, ...state, review: { latest: last, ...coach.reviewStatus(state.profile, last, state.today) }, photo_ai: !!env.ANTHROPIC_API_KEY, photo_storage: !!env.PHOTOS });
  }
  if (!user) throw new HttpError(401, 'Sign in first.');
  const uid = user.id;

  if (path === '/api/profile' && method === 'PUT') return json(await store.updateProfile(db, uid, body));
  if (path === '/api/goal' && method === 'PUT') return json(await store.setGoal(db, uid, body));
  if (path === '/api/weight' && method === 'POST') return json(await store.logWeight(db, uid, body));
  if (path.startsWith('/api/weight/') && method === 'DELETE') { await store.deleteWeight(db, uid, path.slice(12)); return json({ ok: true }); }
  if (path === '/api/measurements' && method === 'POST') return json(await store.logMeasurements(db, uid, body));
  if (path === '/api/day' && method === 'POST') return json(await store.logDay(db, uid, body));
  if (path === '/api/history' && method === 'GET') return json(await store.history(db, uid, new URL(request.url).searchParams.get('days')));
  if (path === '/api/target' && method === 'POST') return json(await store.setTarget(db, uid, body, 'you'));
  if (path === '/api/target/revert' && method === 'POST') return json({ target: await store.revertTarget(db, uid) });
  if (path === '/api/targets' && method === 'GET') return json(await store.targetHistory(db, uid));
  if (path === '/api/sync-key' && method === 'POST') return json(await coach.newSyncKey(db, uid));
  if (path === '/api/health' && method === 'GET') return json(await coach.healthDays(db, uid));
  if (path === '/api/push/key' && method === 'GET') return json(await coach.pushKey(db));
  if (path === '/api/push/subscribe' && method === 'POST') return json(await coach.subscribe(db, uid, body));
  if (path === '/api/nudge' && method === 'GET') return json(await coach.latestNudge(db, uid));
  if (path === '/api/food' && method === 'GET') return json(await meals.foodState(db, uid));
  if (path === '/api/food/bought' && method === 'POST') return json(await meals.toggleBought(db, uid, body.index));
  if (path === '/api/food/refresh' && method === 'POST') return json(await meals.requestRefresh(db, uid));
  if (path === '/api/photos' && method === 'POST') return json(await photos.upload(db, env, uid, request), 201);
  if (path === '/api/photos' && method === 'GET') return json(await photos.listPhotos(db, uid, new URL(request.url).searchParams.get('kind')));
  if (path.startsWith('/api/photo/') && method === 'GET') return photos.servePhoto(db, env, uid, path.slice(11));
  if (path.startsWith('/api/photo/') && method === 'DELETE') { await photos.deletePhoto(db, env, uid, path.slice(11)); return json({ ok: true }); }
  if (path === '/api/body' && method === 'GET') return json(await body3d.bodyModel(db, uid));
  if (path === '/api/body' && method === 'PUT') return json(await body3d.setOverrides(db, uid, body));
  if (path === '/api/onboarding' && method === 'POST') return json(await workouts.onboard(db, uid, body));
  if (path === '/api/plan' && method === 'GET') return json({ plan: workouts.planView(await workouts.getPlan(db, uid)) });
  if (path === '/api/plan/regenerate' && method === 'POST') return json({ plan: await workouts.generatePlan(db, uid, 'Rebuilt from your current profile') });
  if (path === '/api/workout/start' && method === 'POST') return json(await workouts.startWorkout(db, uid, body));
  if (path === '/api/workouts' && method === 'GET') return json(await workouts.workoutHistory(db, uid, new URL(request.url).searchParams.get('days')));
  const match = path.match(/^\/api\/workout\/([0-9a-f-]{36})\/(item|finish|cancel)$/);
  if (match && method === 'POST') {
    if (match[2] === 'item') return json(await workouts.updateItem(db, uid, match[1], body));
    if (match[2] === 'finish') return json(await workouts.finishWorkout(db, uid, match[1], body));
    await workouts.cancelWorkout(db, uid, match[1]);
    return json({ ok: true });
  }
  throw new HttpError(404, 'Not found.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    // Sign-in for Claude lives at /authorize, /token and /register. The /oauth/... spellings are kept as aliases.
    const signin = ['/authorize', '/token', '/register'].includes(path) ? path : path.startsWith('/oauth/') ? path.slice(6) : null;
    const dynamic = path.startsWith('/api/') || signin || path.startsWith('/.well-known/') || path === '/mcp';
    if (!dynamic) return env.ASSETS.fetch(request);
    try {
      await ensureSchema(env.DB);
      // Record every request Claude makes while connecting (method and path only), so a stalled sign-in can be traced.
      if (!path.startsWith('/api/')) await oauth.logStep(env.DB, 'hit', true, `${request.method} ${path} ${[...url.searchParams.keys()].join(',')} ua=${(request.headers.get('User-Agent') || '').slice(0, 50)}`);
      if (path === '/mcp') return await mcp(env.DB, request, url.origin, env);
      if (path.startsWith('/.well-known/oauth-authorization-server')) return oauth.metadata(url.origin);
      if (path.startsWith('/.well-known/oauth-protected-resource')) return oauth.resourceMetadata(url.origin);
      if (signin && request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
      }
      if (signin === '/register' && request.method === 'POST') return await oauth.register(env.DB, request);
      if (signin === '/authorize' && (request.method === 'GET' || request.method === 'POST')) return await oauth.authorize(env.DB, request);
      // Some clients check that the sign-in page exists before opening it.
      if (signin === '/authorize' && request.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      if (signin === '/token' && request.method === 'POST') return await oauth.token(env.DB, request);
      if (path.startsWith('/api/')) return await api(env.DB, request, path, env);
      return json({ error: 'Not found.' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  },
  // Runs every 15 minutes (see wrangler.toml) to send any reminder whose time has come.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ensureSchema(env.DB).then(() => coach.runNudges(env.DB)).catch((e) => console.error('nudges failed', e)));
  },
};
