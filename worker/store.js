// Reading and writing the tracking data. The web API and the Claude connector both go through here,
// so a rule enforced in this file holds for both.

import { HttpError, newId } from './auth.js';
import { SITES, ACTIVITY, navyBodyFat, plan, addDays } from './calc.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function num(value, label, min, max, { optional = false, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new HttpError(400, `${label} is required.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

function day(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!DATE.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) throw new HttpError(400, 'Dates must look like 2026-11-15.');
  return value;
}

export function todayIn(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const LEVELS = ['beginner', 'intermediate', 'advanced'];
export const GOALS = ['fat_loss', 'strength', 'consistency', 'general_health'];
// What the exercise library calls each kind of kit. Bodyweight moves are always available.
export const EQUIPMENT = ['dumbbell', 'barbell', 'kettlebells', 'bands', 'cable', 'machine', 'e-z curl bar', 'exercise ball', 'medicine ball', 'foam roll', 'other'];

const PROFILE_COLUMNS = ['sex', 'birth_year', 'height_cm', 'activity', 'units', 'timezone', 'review_cadence', 'fitness_level', 'minutes', 'days_per_week', 'primary_goal', 'equipment', 'onboarded_at', 'show_all', 'conditions', 'nudge_times', 'skin_tone', 'diet', 'store', 'postal', 'weekly_budget', 'household'];
const JSON_COLUMNS = ['equipment', 'conditions', 'nudge_times', 'diet'];
export const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'no dairy', 'no gluten', 'no red meat', 'no pork', 'halal', 'kosher', 'low fat', 'low sodium', 'low sugar'];
export const SKIN_TONES = ['#f6d7c3', '#e9bd9b', '#d19c74', '#b07a52', '#8a5a3b', '#5f3d28', '#3d2618'];
const list = (value, label, max, each) => {
  if (!Array.isArray(value) || value.length > max) throw new HttpError(400, `${label} must be a list of up to ${max}.`);
  return [...new Set(value.map((v) => String(v).trim().slice(0, each)).filter(Boolean))];
};

export async function getProfile(db, uid) {
  const row = await db.prepare(`SELECT ${PROFILE_COLUMNS.join(', ')} FROM profiles WHERE user_id = ?`).bind(uid).first();
  const out = { ...row, show_all: !!row.show_all };
  for (const c of JSON_COLUMNS) out[c] = JSON.parse(row[c] || '[]');
  return out;
}

export async function updateProfile(db, uid, input) {
  const current = await getProfile(db, uid);
  const next = { ...current };
  if ('sex' in input) {
    if (!['male', 'female'].includes(input.sex)) throw new HttpError(400, 'Sex must be male or female. It is only used for the body-fat and energy formulas.');
    next.sex = input.sex;
  }
  if ('birth_year' in input) next.birth_year = num(input.birth_year, 'Birth year', 1900, new Date().getUTCFullYear() - 18, { integer: true });
  if ('height_cm' in input) next.height_cm = num(input.height_cm, 'Height', 100, 250);
  if ('activity' in input) {
    if (!ACTIVITY[input.activity]) throw new HttpError(400, `Activity must be one of: ${Object.keys(ACTIVITY).join(', ')}.`);
    next.activity = input.activity;
  }
  if ('units' in input) {
    if (!['metric', 'imperial'].includes(input.units)) throw new HttpError(400, 'Units must be metric or imperial.');
    next.units = input.units;
  }
  if ('timezone' in input) {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: input.timezone }); } catch { throw new HttpError(400, 'Unknown time zone.'); }
    next.timezone = input.timezone;
  }
  if ('review_cadence' in input) {
    if (!['weekly', 'biweekly', 'monthly'].includes(input.review_cadence)) throw new HttpError(400, 'Review cadence must be weekly, biweekly or monthly.');
    next.review_cadence = input.review_cadence;
  }
  if ('fitness_level' in input) {
    if (!LEVELS.includes(input.fitness_level)) throw new HttpError(400, `Fitness level must be one of: ${LEVELS.join(', ')}.`);
    next.fitness_level = input.fitness_level;
  }
  if ('primary_goal' in input) {
    if (!GOALS.includes(input.primary_goal)) throw new HttpError(400, `Primary goal must be one of: ${GOALS.join(', ')}.`);
    next.primary_goal = input.primary_goal;
  }
  if ('minutes' in input) next.minutes = num(input.minutes, 'Minutes per workout', 10, 180, { integer: true });
  if ('days_per_week' in input) next.days_per_week = num(input.days_per_week, 'Workouts a week', 1, 7, { integer: true });
  if ('equipment' in input) {
    if (!Array.isArray(input.equipment) || !input.equipment.every((e) => EQUIPMENT.includes(e))) throw new HttpError(400, `Equipment must be a list from: ${EQUIPMENT.join(', ')}.`);
    next.equipment = [...new Set(input.equipment)];
  }
  if ('show_all' in input) next.show_all = !!input.show_all;
  if ('conditions' in input) next.conditions = list(input.conditions, 'Conditions', 12, 80);
  if ('diet' in input) next.diet = list(input.diet, 'Dietary needs', 16, 40);
  if ('nudge_times' in input) {
    next.nudge_times = list(input.nudge_times, 'Reminder times', 2, 5);
    if (!next.nudge_times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new HttpError(400, 'Reminder times must look like 17:30.');
  }
  if ('skin_tone' in input) {
    if (!SKIN_TONES.includes(input.skin_tone)) throw new HttpError(400, 'Unknown skin tone.');
    next.skin_tone = input.skin_tone;
  }
  if ('store' in input) next.store = input.store ? String(input.store).slice(0, 40) : null;
  if ('postal' in input) next.postal = input.postal ? String(input.postal).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) : null;
  if ('weekly_budget' in input) next.weekly_budget = num(input.weekly_budget, 'Weekly budget', 10, 5000, { optional: true });
  if ('household' in input) next.household = num(input.household, 'Household size', 1, 12, { integer: true });
  if (input.onboarded && !next.onboarded_at) next.onboarded_at = new Date().toISOString();
  const stored = { ...next, show_all: next.show_all ? 1 : 0 };
  for (const c of JSON_COLUMNS) stored[c] = JSON.stringify(next[c] || []);
  await db.prepare(`UPDATE profiles SET ${PROFILE_COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE user_id = ?`)
    .bind(...PROFILE_COLUMNS.map((c) => stored[c] ?? null), new Date().toISOString(), uid).run();
  return next;
}

export async function logWeight(db, uid, input, source = 'manual') {
  const profile = await getProfile(db, uid);
  const date = day(input.date, todayIn(profile.timezone));
  const kg = num(input.kg, 'Weight', 25, 400);
  await db.prepare(`INSERT INTO weights (user_id, date, kg, source) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, date) DO UPDATE SET kg = excluded.kg, source = excluded.source`)
    .bind(uid, date, kg, source).run();
  return { date, kg };
}

export async function deleteWeight(db, uid, date) {
  await db.prepare(`DELETE FROM weights WHERE user_id = ? AND date = ?`).bind(uid, day(date)).run();
}

export async function logMeasurements(db, uid, input) {
  const profile = await getProfile(db, uid);
  const date = day(input.date, todayIn(profile.timezone));
  const values = input.values || {};
  const rows = [];
  for (const [site, value] of Object.entries(values)) {
    if (!SITES.includes(site)) throw new HttpError(400, `Unknown measurement "${site}". Use: ${SITES.join(', ')}.`);
    const cm = num(value, site, 10, 250, { optional: true });
    if (cm !== null) rows.push([site, cm]);
  }
  if (!rows.length) throw new HttpError(400, 'Enter at least one measurement.');
  await db.batch(rows.map(([site, cm]) =>
    db.prepare(`INSERT INTO measurements (user_id, date, site, cm) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, date, site) DO UPDATE SET cm = excluded.cm`).bind(uid, date, site, cm)));
  return { date, values: Object.fromEntries(rows) };
}

export async function logDay(db, uid, input) {
  const profile = await getProfile(db, uid);
  const date = day(input.date, todayIn(profile.timezone));
  const existing = (await db.prepare(`SELECT calories, protein_g, target_met, note FROM daily_logs WHERE user_id = ? AND date = ?`).bind(uid, date).first()) || {};
  const next = { ...existing };
  if ('calories' in input) next.calories = num(input.calories, 'Calories', 0, 15000, { optional: true, integer: true });
  if ('protein_g' in input) next.protein_g = num(input.protein_g, 'Protein', 0, 1000, { optional: true, integer: true });
  if ('target_met' in input) next.target_met = input.target_met === null ? null : input.target_met ? 1 : 0;
  if ('note' in input) next.note = input.note ? String(input.note).slice(0, 2000) : null;
  await db.prepare(`INSERT INTO daily_logs (user_id, date, calories, protein_g, target_met, note) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, date) DO UPDATE SET calories = excluded.calories, protein_g = excluded.protein_g, target_met = excluded.target_met, note = excluded.note`)
    .bind(uid, date, next.calories ?? null, next.protein_g ?? null, next.target_met ?? null, next.note ?? null).run();
  return { date, ...dayRow(next) };
}

const dayRow = (r) => ({ calories: r.calories ?? null, protein_g: r.protein_g ?? null, target_met: r.target_met == null ? null : !!r.target_met, note: r.note ?? null });

export async function getGoal(db, uid) {
  const row = await db.prepare(`SELECT id, start_date, target_date, start_weight_kg, target_weight_kg, target_body_fat, target_areas FROM goals WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`).bind(uid).first();
  return row ? { ...row, target_areas: JSON.parse(row.target_areas) } : null;
}

// Setting a goal archives the previous one, so there is always at most one active goal and the old ones stay on record.
export async function setGoal(db, uid, input) {
  const profile = await getProfile(db, uid);
  const today = todayIn(profile.timezone);
  const target_date = day(input.target_date);
  if (!target_date) throw new HttpError(400, 'A target date is required.');
  if (target_date <= today) throw new HttpError(400, 'The target date must be in the future.');
  const target_weight_kg = num(input.target_weight_kg, 'Target weight', 25, 400, { optional: true });
  const target_body_fat = num(input.target_body_fat, 'Target body fat', 3, 60, { optional: true });
  if (target_weight_kg === null && target_body_fat === null) throw new HttpError(400, 'Set a target body-fat percentage, a target weight, or both.');
  const areas = Array.isArray(input.target_areas) ? input.target_areas.map(String).filter((a) => SITES.includes(a) || ['abs', 'back', 'glutes', 'arms', 'legs'].includes(a)) : [];
  const latest = await db.prepare(`SELECT kg FROM weights WHERE user_id = ? ORDER BY date DESC LIMIT 1`).bind(uid).first();
  const id = newId();
  await db.batch([
    db.prepare(`UPDATE goals SET status = 'archived' WHERE user_id = ? AND status = 'active'`).bind(uid),
    db.prepare(`INSERT INTO goals (id, user_id, start_date, target_date, start_weight_kg, target_weight_kg, target_body_fat, target_areas, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, uid, today, target_date, latest ? latest.kg : null, target_weight_kg, target_body_fat, JSON.stringify(areas), new Date().toISOString()),
  ]);
  return getGoal(db, uid);
}

export async function currentTarget(db, uid) {
  const row = await db.prepare(`SELECT id, calories, protein_g, reason, set_by, created_at FROM targets WHERE user_id = ? AND reverted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(uid).first();
  return row || null;
}

export async function setTarget(db, uid, input, set_by) {
  const calories = num(input.calories, 'Calories', 500, 10000, { integer: true });
  const protein_g = num(input.protein_g, 'Protein', 0, 600, { optional: true, integer: true });
  await db.prepare(`INSERT INTO targets (id, user_id, calories, protein_g, reason, set_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId(), uid, calories, protein_g, input.reason ? String(input.reason).slice(0, 1000) : null, set_by, new Date().toISOString()).run();
  return currentTarget(db, uid);
}

// Undo the latest target change and fall back to the one before it.
export async function revertTarget(db, uid) {
  const current = await currentTarget(db, uid);
  if (!current) throw new HttpError(400, 'There is no target to revert.');
  await db.prepare(`UPDATE targets SET reverted_at = ? WHERE id = ?`).bind(new Date().toISOString(), current.id).run();
  return currentTarget(db, uid);
}

export async function targetHistory(db, uid, limit = 20) {
  return (await db.prepare(`SELECT calories, protein_g, reason, set_by, created_at, reverted_at FROM targets WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).bind(uid, limit).all()).results;
}

// Body fat on each date that has measurements, carrying earlier values forward for sites not re-measured that day.
function bodyFatSeries(profile, measurements) {
  const latest = {};
  const series = [];
  let i = 0;
  while (i < measurements.length) {
    const date = measurements[i].date;
    for (; i < measurements.length && measurements[i].date === date; i++) latest[measurements[i].site] = measurements[i].cm;
    const pct = navyBodyFat({ sex: profile.sex, height_cm: profile.height_cm, ...latest });
    if (pct !== null) series.push({ date, pct });
  }
  return { series, latest };
}

export async function history(db, uid, days = 90) {
  const profile = await getProfile(db, uid);
  const today = todayIn(profile.timezone);
  const from = addDays(today, -Math.min(Math.max(Number(days) || 90, 1), 1100));
  const [weights, logs, allMeasurements] = await Promise.all([
    db.prepare(`SELECT date, kg, source FROM weights WHERE user_id = ? AND date >= ? ORDER BY date`).bind(uid, from).all(),
    db.prepare(`SELECT date, calories, protein_g, target_met, note FROM daily_logs WHERE user_id = ? AND date >= ? ORDER BY date`).bind(uid, from).all(),
    db.prepare(`SELECT date, site, cm FROM measurements WHERE user_id = ? ORDER BY date`).bind(uid).all(),
  ]);
  const { series } = bodyFatSeries(profile, allMeasurements.results);
  const byDate = {};
  for (const m of allMeasurements.results) if (m.date >= from) (byDate[m.date] ||= {})[m.site] = m.cm;
  return {
    from,
    to: today,
    weights: weights.results,
    days: logs.results.map((r) => ({ date: r.date, ...dayRow(r) })),
    measurements: Object.entries(byDate).map(([date, values]) => ({ date, values })),
    body_fat: series.filter((p) => p.date >= from),
  };
}

// Everything the home screen and a coaching review need in one read.
export async function overview(db, uid) {
  const profile = await getProfile(db, uid);
  const today = todayIn(profile.timezone);
  const [goal, target, weight, measurements, todayLog, week] = await Promise.all([
    getGoal(db, uid),
    currentTarget(db, uid),
    db.prepare(`SELECT date, kg FROM weights WHERE user_id = ? ORDER BY date DESC LIMIT 1`).bind(uid).first(),
    db.prepare(`SELECT date, site, cm FROM measurements WHERE user_id = ? ORDER BY date`).bind(uid).all(),
    db.prepare(`SELECT calories, protein_g, target_met, note FROM daily_logs WHERE user_id = ? AND date = ?`).bind(uid, today).first(),
    db.prepare(`SELECT date, target_met FROM daily_logs WHERE user_id = ? AND date > ? ORDER BY date`).bind(uid, addDays(today, -7)).all(),
  ]);
  const { series, latest } = bodyFatSeries(profile, measurements.results);
  const body_fat = series.length ? series[series.length - 1] : null;
  const suggested = plan({ profile, weight_kg: weight ? weight.kg : null, body_fat: body_fat ? body_fat.pct : null, goal, today });
  return {
    today,
    profile,
    goal,
    target,
    suggested,
    latest: { weight: weight || null, body_fat, measurements: latest },
    today_log: todayLog ? dayRow(todayLog) : null,
    last_7_days: { logged: week.results.length, target_met: week.results.filter((r) => r.target_met).length },
  };
}
