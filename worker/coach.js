// Reviews, the Apple Health sync endpoint, and reminders.

import { HttpError, newId, randomToken, sha256, b64url } from './auth.js';
import { getProfile, logWeight, todayIn, history } from './store.js';
import { addDays, daysBetween } from './calc.js';
import { home, workoutHistory } from './workouts.js';

/* ---------- reviews ---------- */

const CADENCE_DAYS = { weekly: 7, biweekly: 14, monthly: 30 };

export async function latestReview(db, uid) {
  return (await db.prepare(`SELECT period_start, period_end, summary, created_at FROM reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).bind(uid).first()) || null;
}

export function reviewStatus(profile, last, today) {
  const every = CADENCE_DAYS[profile.review_cadence] || 7;
  const since = last ? last.period_end : (profile.onboarded_at || '').slice(0, 10) || today;
  const waited = daysBetween(since, today);
  return { due: waited >= every, every_days: every, period_start: since, days_until: Math.max(0, every - waited) };
}

// Everything Claude needs for a review in one call.
export async function reviewBrief(db, uid) {
  const state = await home(db, uid);
  const last = await latestReview(db, uid);
  const status = reviewStatus(state.profile, last, state.today);
  const days = Math.max(daysBetween(status.period_start, state.today), 7);
  return { ...status, last_review: last, now: state, history: await history(db, uid, days), workouts: await workoutHistory(db, uid, days) };
}

export async function saveReview(db, uid, input) {
  const summary = String(input.summary || '').trim();
  if (summary.length < 20) throw new HttpError(400, 'Write a review summary the user can read: what went well, what changed and why.');
  const profile = await getProfile(db, uid);
  const today = todayIn(profile.timezone);
  const status = reviewStatus(profile, await latestReview(db, uid), today);
  await db.prepare(`INSERT INTO reviews (id, user_id, period_start, period_end, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(newId(), uid, status.period_start, today, summary.slice(0, 4000), new Date().toISOString()).run();
  return latestReview(db, uid);
}

/* ---------- Apple Health sync ---------- */
// An iPhone Shortcut posts the day's numbers here with a personal key. Only a hash of the key is stored.

export async function newSyncKey(db, uid) {
  const key = `afo_${randomToken(24)}`;
  await db.prepare(`UPDATE profiles SET sync_key_hash = ? WHERE user_id = ?`).bind(await sha256(key), uid).run();
  return { key };
}

const number = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

export async function healthIngest(db, request) {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+(afo_[A-Za-z0-9_-]+)$/);
  const row = match && (await db.prepare(`SELECT user_id FROM profiles WHERE sync_key_hash = ?`).bind(await sha256(match[1])).first());
  if (!row) throw new HttpError(401, 'Unknown sync key. Create a new one in the app and update the Shortcut.');
  const uid = row.user_id;
  const body = await request.json().catch(() => { throw new HttpError(400, 'Send JSON.'); });
  const profile = await getProfile(db, uid);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayIn(profile.timezone);
  const active = number(body.active_kcal), steps = number(body.steps), wk = number(body.workout_kcal), wm = number(body.workout_minutes);
  let weight = number(body.weight_kg);
  if (!weight && number(body.weight_lb)) weight = number(body.weight_lb) / 2.20462;
  await db.prepare(`INSERT INTO health_days (user_id, date, active_kcal, steps, workout_kcal, workout_minutes) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, date) DO UPDATE SET active_kcal = COALESCE(excluded.active_kcal, active_kcal), steps = COALESCE(excluded.steps, steps), workout_kcal = COALESCE(excluded.workout_kcal, workout_kcal), workout_minutes = COALESCE(excluded.workout_minutes, workout_minutes)`)
    .bind(uid, date, active && Math.round(active), steps && Math.round(steps), wk && Math.round(wk), wm && Math.round(wm)).run();
  if (weight && weight >= 25 && weight <= 400) await logWeight(db, uid, { date, kg: weight }, 'health');
  // Calories burned in training go onto that day's finished workout.
  if (wk) await db.prepare(`UPDATE workouts SET kcal = ? WHERE user_id = ? AND date = ? AND status = 'done'`).bind(Math.round(wk), uid, date).run();
  return { ok: true, date, saved: { active_kcal: !!active, steps: !!steps, workout_kcal: !!wk, weight: !!weight } };
}

export async function healthDays(db, uid, days = 14) {
  const profile = await getProfile(db, uid);
  return (await db.prepare(`SELECT date, active_kcal, steps, workout_kcal, workout_minutes FROM health_days WHERE user_id = ? AND date >= ? ORDER BY date DESC`).bind(uid, addDays(todayIn(profile.timezone), -days)).all()).results;
}

/* ---------- reminders (web push) ---------- */
// Notifications are sent without a payload; the app's service worker then asks /api/nudge for the words.
// That keeps this code free of the push encryption scheme and keeps the message off third-party servers.

const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

async function vapid(db) {
  let row = await db.prepare(`SELECT value FROM meta WHERE key = 'vapid'`).first();
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const value = JSON.stringify({ private: await crypto.subtle.exportKey('jwk', pair.privateKey), public: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)) });
    await db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('vapid', ?)`).bind(value).run();
    row = await db.prepare(`SELECT value FROM meta WHERE key = 'vapid'`).first();
  }
  return JSON.parse(row.value);
}

export const pushKey = async (db) => ({ key: (await vapid(db)).public });

export async function subscribe(db, uid, input) {
  let url;
  try { url = new URL(input.endpoint); } catch { throw new HttpError(400, 'Bad push address.'); }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => h.test(url.hostname))) throw new HttpError(400, 'Unknown push service.');
  await db.prepare(`INSERT INTO push_subs (endpoint, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id`).bind(url.toString(), uid, new Date().toISOString()).run();
  return { ok: true };
}

export async function vapidHeader(db, endpoint, contact) {
  const keys = await vapid(db);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: `mailto:${contact}` })}`;
  const key = await crypto.subtle.importKey('jwk', keys.private, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)));
  return `vapid t=${unsigned}.${sig}, k=${keys.public}`;
}

async function push(db, uid, send = fetch) {
  const user = await db.prepare(`SELECT email FROM users WHERE id = ?`).bind(uid).first();
  const subs = (await db.prepare(`SELECT endpoint FROM push_subs WHERE user_id = ?`).bind(uid).all()).results;
  let sent = 0;
  for (const { endpoint } of subs) {
    const res = await send(endpoint, { method: 'POST', headers: { TTL: '3600', Urgency: 'normal', 'Content-Length': '0', Authorization: await vapidHeader(db, endpoint, user.email) } }).catch(() => null);
    if (res && (res.status === 404 || res.status === 410)) await db.prepare(`DELETE FROM push_subs WHERE endpoint = ?`).bind(endpoint).run();
    else if (res && res.ok) sent += 1;
  }
  return sent;
}

// What to say at each reminder, or null when there is nothing worth interrupting for.
// The first reminder is about training; the second is the evening check-in.
export function nudgeFor(state, slot) {
  const w = state.workout;
  if (slot === 0) {
    if (w.done_today || !w.next) return null;
    if (w.week.goal && w.week.done >= w.week.goal) return null; // rest day
    if (w.active) return `${w.active.day_name} is half done. Pick it back up?`;
    return `${w.next.name} is ready: ${w.next.exercises.length} exercises, about ${w.next.minutes} minutes.`;
  }
  if (state.today_log && state.today_log.target_met != null) return null;
  return state.streak.days >= 2 ? `Quick food check keeps your ${state.streak.days}-day streak going.` : 'How did eating go today? One tap to log it.';
}

const localClock = (timezone, at) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

// Called every 15 minutes. Sends a reminder when one of the user's chosen times has just passed.
export async function runNudges(db, at = new Date(), send = fetch) {
  const rows = (await db.prepare(`SELECT user_id, timezone, nudge_times FROM profiles WHERE nudge_times != '[]' AND user_id IN (SELECT user_id FROM push_subs)`).all()).results;
  let sent = 0;
  for (const row of rows) {
    const now = minutesOf(localClock(row.timezone, at));
    const today = todayIn(row.timezone);
    for (const [slot, time] of JSON.parse(row.nudge_times).entries()) {
      const late = now - minutesOf(time);
      if (late < 0 || late >= 15) continue;
      if (await db.prepare(`SELECT 1 FROM nudges_sent WHERE user_id = ? AND date = ? AND slot = ?`).bind(row.user_id, today, slot).first()) continue;
      const message = nudgeFor(await home(db, row.user_id), slot);
      await db.prepare(`INSERT INTO nudges_sent (user_id, date, slot, message) VALUES (?, ?, ?, ?)`).bind(row.user_id, today, slot, message).run();
      if (message) sent += await push(db, row.user_id, send);
    }
  }
  return sent;
}

export async function latestNudge(db, uid) {
  const profile = await getProfile(db, uid);
  const row = await db.prepare(`SELECT message FROM nudges_sent WHERE user_id = ? AND date = ? AND message IS NOT NULL ORDER BY slot DESC LIMIT 1`).bind(uid, todayIn(profile.timezone)).first();
  return { title: 'All For One', body: row ? row.message : 'Time to check in.' };
}
