// Workout plans, sessions, streaks and the small wins shown after each one.
// A plan is an ordered list of days; "next" is simply the day after the last one finished,
// so missing a day never leaves the plan out of step with the calendar.

import { HttpError, newId } from './auth.js';
import { getProfile, getGoal, updateProfile, logWeight, overview, todayIn } from './store.js';
import { addDays } from './calc.js';
import { BY_ID, buildPlan, estimateMinutes } from './planner.js';

const int = (v, label, min, max, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return n;
};

const describe = (id) => {
  const e = BY_ID.get(id);
  return e ? { name: e.name, equipment: e.equipment, muscles: e.muscles, steps: e.steps } : { name: 'Unknown exercise', equipment: '', muscles: [], steps: [] };
};

function cleanPlan(input) {
  const days = Array.isArray(input && input.days) ? input.days : null;
  if (!days || days.length < 1 || days.length > 7) throw new HttpError(400, 'A plan needs between 1 and 7 days.');
  return {
    days: days.map((d, i) => {
      const list = Array.isArray(d.exercises) ? d.exercises : [];
      if (list.length < 1 || list.length > 12) throw new HttpError(400, `Day ${i + 1} needs between 1 and 12 exercises.`);
      return {
        name: String(d.name || `Day ${i + 1}`).slice(0, 40),
        exercises: list.map((x) => {
          if (!BY_ID.has(x.exercise_id)) throw new HttpError(400, `Unknown exercise "${x.exercise_id}". Use search_exercises to find valid ids.`);
          return { exercise_id: x.exercise_id, sets: int(x.sets, 'Sets', 1, 10, 3), reps: int(x.reps, 'Reps', 1, 100, 12) };
        }),
      };
    }),
  };
}

export async function getPlan(db, uid) {
  const row = await db.prepare(`SELECT id, plan, reason, set_by, created_at FROM workout_plans WHERE user_id = ? AND replaced_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(uid).first();
  return row ? { ...row, plan: undefined, ...JSON.parse(row.plan) } : null;
}

export async function setPlan(db, uid, input, set_by) {
  const plan = cleanPlan(input);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE workout_plans SET replaced_at = ? WHERE user_id = ? AND replaced_at IS NULL`).bind(now, uid),
    db.prepare(`INSERT INTO workout_plans (id, user_id, plan, reason, set_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(newId(), uid, JSON.stringify(plan), input.reason ? String(input.reason).slice(0, 1000) : null, set_by, now),
  ]);
  return planView(await getPlan(db, uid));
}

export async function generatePlan(db, uid, reason = 'Starter plan built from your profile') {
  const [profile, goal, activity] = await Promise.all([getProfile(db, uid), getGoal(db, uid), activityOf(db, uid)]);
  const plan = buildPlan(profile, goal ? goal.target_areas : [], { accessories: unlocksFor(profile, activity).fine_tuning });
  if (!plan.days.length) throw new HttpError(400, 'No exercises match your level and equipment.');
  return setPlan(db, uid, { ...plan, reason }, 'app');
}

export function planView(plan) {
  if (!plan) return null;
  return {
    id: plan.id, reason: plan.reason, set_by: plan.set_by, created_at: plan.created_at,
    days: plan.days.map((d) => ({ name: d.name, minutes: estimateMinutes(d), exercises: d.exercises.map((x) => ({ ...x, ...describe(x.exercise_id) })) })),
  };
}

// Days with any check-in: a finished workout, a daily check or a weigh-in.
async function activityOf(db, uid) {
  const profile = await getProfile(db, uid);
  const today = todayIn(profile.timezone);
  const rows = (await db.prepare(`SELECT date FROM workouts WHERE user_id = ?1 AND status = 'done' UNION SELECT date FROM daily_logs WHERE user_id = ?1 UNION SELECT date FROM weights WHERE user_id = ?1 ORDER BY date DESC`).bind(uid).all()).results.map((r) => r.date);
  const set = new Set(rows);
  // A streak survives until the end of the day after the last check-in.
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) { streak += 1; cursor = addDays(cursor, -1); }
  return { today, streak, active_days: rows.length, checked_in_today: set.has(today) };
}

// Extra screens open up as the habit forms, so the first week stays simple. "Show everything" in settings skips the wait.
export function unlocksFor(profile, activity) {
  const all = !!profile.show_all;
  const at = (n) => all || activity.active_days >= n;
  return { trends: at(3), body: at(7), fine_tuning: at(14), next: all ? null : [3, 7, 14].find((n) => activity.active_days < n) || null };
}

const STAGES = [[30, 'beacon'], [14, 'bonfire'], [7, 'blaze'], [3, 'flame'], [1, 'ember'], [0, 'spark']];
const stageFor = (streak) => STAGES.find(([min]) => streak >= min)[1];

function weekStart(date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 is Sunday
  return addDays(date, -((dow + 6) % 7)); // Monday
}

export const SYMPTOMS = ['Knee', 'Lower back', 'Shoulder', 'Wrist', 'Dizzy', 'Chest pain', 'Short of breath'];
const RED_FLAGS = ['Dizzy', 'Chest pain', 'Short of breath'];
// Not a diagnosis: a prompt to stop and get checked when a symptom is one that should never be trained through.
export function symptomAdvice(symptoms = []) {
  const red = symptoms.filter((x) => RED_FLAGS.includes(x));
  if (red.length) return { level: 'stop', message: `${red.join(' and ')} during exercise should be checked by a doctor before you train again. If it is severe or does not pass, get medical help now.` };
  if (symptoms.length) return { level: 'care', message: `Noted: ${symptoms.join(', ').toLowerCase()}. Go lighter on movements that load it, and mention it to your coach review. See a professional if it lingers or gets worse.` };
  return null;
}

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;

export function winMessage(doneThisWeek, weeklyGoal) {
  if (weeklyGoal && doneThisWeek === weeklyGoal) return `That's all ${weeklyGoal} for the week. Goal hit.`;
  if (weeklyGoal && doneThisWeek > weeklyGoal) return 'Bonus session. Above and beyond.';
  if (doneThisWeek <= 1) return 'First workout of the week. You showed up.';
  return `${ordinal(doneThisWeek)} workout this week. You're locked in.`;
}

export function effortMeaning(effort) {
  if (effort == null) return null;
  if (effort <= 4) return 'Easy. Good for recovery, and you have room to add a little next time.';
  if (effort <= 6) return 'Moderate. Solid, repeatable work.';
  if (effort <= 8) return 'Hard but sustainable. This is the range where most progress happens.';
  return 'Near your limit. Fine now and then; plan an easier session next.';
}

async function sessionView(db, workout) {
  const items = (await db.prepare(`SELECT position, exercise_id, sets, reps, weight_kg, done FROM workout_items WHERE workout_id = ? ORDER BY position`).bind(workout.id).all()).results;
  return {
    id: workout.id, date: workout.date, day_name: workout.day_name, day_index: workout.day_index, status: workout.status,
    effort: workout.effort, feeling: workout.feeling, note: workout.note, kcal: workout.kcal, symptoms: workout.symptoms ? JSON.parse(workout.symptoms) : [],
    items: items.map((i) => ({ ...i, done: !!i.done, ...describe(i.exercise_id) })),
  };
}

async function weekCount(db, uid, today) {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM workouts WHERE user_id = ? AND status = 'done' AND date >= ?`).bind(uid, weekStart(today)).first()).n;
}

// Everything the home screen needs: the base overview plus today's workout, streak and what is unlocked.
export async function home(db, uid) {
  const base = await overview(db, uid);
  const [activity, plan, active, lastDone, doneToday] = await Promise.all([
    activityOf(db, uid),
    getPlan(db, uid),
    db.prepare(`SELECT * FROM workouts WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`).bind(uid).first(),
    db.prepare(`SELECT plan_id, day_index FROM workouts WHERE user_id = ? AND status = 'done' ORDER BY finished_at DESC LIMIT 1`).bind(uid).first(),
    db.prepare(`SELECT * FROM workouts WHERE user_id = ? AND status = 'done' AND date = ? ORDER BY finished_at DESC LIMIT 1`).bind(uid, base.today).first(),
  ]);
  const view = planView(plan);
  const done = await weekCount(db, uid, base.today);
  const goal = base.profile.days_per_week || null;
  let next = null;
  if (view) {
    const index = lastDone && lastDone.plan_id === plan.id ? (lastDone.day_index + 1) % view.days.length : 0;
    next = { day_index: index, ...view.days[index] };
  }
  return {
    ...base,
    streak: { days: activity.streak, stage: stageFor(activity.streak), checked_in_today: activity.checked_in_today, active_days: activity.active_days },
    unlocks: unlocksFor(base.profile, activity),
    workout: {
      week: { done, goal },
      next,
      active: active ? await sessionView(db, active) : null,
      done_today: doneToday ? { ...(await sessionView(db, doneToday)), win: winMessage(done, goal), effort_meaning: effortMeaning(doneToday.effort), advice: symptomAdvice(doneToday.symptoms ? JSON.parse(doneToday.symptoms) : []) } : null,
    },
  };
}

// Start (or resume) a session. Sets, reps and weights are filled in from the last time each exercise was done.
export async function startWorkout(db, uid, input = {}) {
  const profile = await getProfile(db, uid);
  const today = todayIn(profile.timezone);
  const existing = await db.prepare(`SELECT * FROM workouts WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`).bind(uid).first();
  if (existing) return sessionView(db, existing);
  const plan = await getPlan(db, uid);
  if (!plan) throw new HttpError(400, 'There is no workout plan yet.');
  const state = await home(db, uid);
  const index = int(input.day_index, 'Day', 0, plan.days.length - 1, state.workout.next.day_index);
  const day = plan.days[index];
  const id = newId();
  const statements = [
    db.prepare(`INSERT INTO workouts (id, user_id, date, plan_id, day_index, day_name, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, uid, today, plan.id, index, day.name, new Date().toISOString()),
  ];
  for (const [position, x] of day.exercises.entries()) {
    const last = await db.prepare(`SELECT i.sets, i.reps, i.weight_kg FROM workout_items i JOIN workouts w ON w.id = i.workout_id WHERE w.user_id = ? AND w.status = 'done' AND i.exercise_id = ? AND i.done = 1 ORDER BY w.finished_at DESC LIMIT 1`).bind(uid, x.exercise_id).first();
    statements.push(db.prepare(`INSERT INTO workout_items (workout_id, position, exercise_id, sets, reps, weight_kg) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, position, x.exercise_id, x.sets, last ? Math.max(last.reps, x.reps) : x.reps, last ? last.weight_kg : null));
  }
  await db.batch(statements);
  return sessionView(db, await db.prepare(`SELECT * FROM workouts WHERE id = ?`).bind(id).first());
}

async function ownWorkout(db, uid, id) {
  const row = await db.prepare(`SELECT * FROM workouts WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!row) throw new HttpError(404, 'Workout not found.');
  return row;
}

export async function updateItem(db, uid, id, input) {
  const workout = await ownWorkout(db, uid, id);
  const position = int(input.position, 'Position', 0, 20);
  const item = await db.prepare(`SELECT sets, reps, weight_kg, done FROM workout_items WHERE workout_id = ? AND position = ?`).bind(id, position).first();
  if (!item) throw new HttpError(404, 'Exercise not found in this workout.');
  const sets = 'sets' in input ? int(input.sets, 'Sets', 1, 20, item.sets) : item.sets;
  const reps = 'reps' in input ? int(input.reps, 'Reps', 1, 200, item.reps) : item.reps;
  let weight = item.weight_kg;
  if ('weight_kg' in input) {
    weight = input.weight_kg === null || input.weight_kg === '' ? null : Number(input.weight_kg);
    if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 600)) throw new HttpError(400, 'Weight must be between 0 and 600 kg.');
  }
  const done = 'done' in input ? (input.done ? 1 : 0) : item.done;
  await db.prepare(`UPDATE workout_items SET sets = ?, reps = ?, weight_kg = ?, done = ? WHERE workout_id = ? AND position = ?`).bind(sets, reps, weight, done, id, position).run();
  return sessionView(db, workout);
}

export async function finishWorkout(db, uid, id, input = {}) {
  const workout = await ownWorkout(db, uid, id);
  const effort = int(input.effort, 'Effort', 1, 10, null);
  const feeling = input.feeling ? String(input.feeling).slice(0, 40) : null;
  const note = input.note ? String(input.note).slice(0, 2000) : null;
  const symptoms = (Array.isArray(input.symptoms) ? input.symptoms : []).filter((x) => SYMPTOMS.includes(x));
  await db.prepare(`UPDATE workouts SET status = 'done', finished_at = COALESCE(finished_at, ?), effort = ?, feeling = ?, note = ?, symptoms = ? WHERE id = ?`).bind(new Date().toISOString(), effort, feeling, note, symptoms.length ? JSON.stringify(symptoms) : null, id).run();
  const profile = await getProfile(db, uid);
  const done = await weekCount(db, uid, todayIn(profile.timezone));
  return { win: winMessage(done, profile.days_per_week), effort_meaning: effortMeaning(effort), advice: symptomAdvice(symptoms), week: { done, goal: profile.days_per_week || null } };
}

export async function cancelWorkout(db, uid, id) {
  const workout = await ownWorkout(db, uid, id);
  if (workout.status !== 'active') throw new HttpError(400, 'Only a workout in progress can be cancelled.');
  await db.batch([
    db.prepare(`DELETE FROM workout_items WHERE workout_id = ?`).bind(id),
    db.prepare(`DELETE FROM workouts WHERE id = ?`).bind(id),
  ]);
}

export async function workoutHistory(db, uid, days = 30) {
  const profile = await getProfile(db, uid);
  const from = addDays(todayIn(profile.timezone), -Math.min(Math.max(Number(days) || 30, 1), 400));
  const rows = (await db.prepare(`SELECT * FROM workouts WHERE user_id = ? AND status = 'done' AND date >= ? ORDER BY date DESC, finished_at DESC`).bind(uid, from).all()).results;
  const out = [];
  for (const w of rows) {
    const s = await sessionView(db, w);
    out.push({ date: s.date, day_name: s.day_name, symptoms: s.symptoms, effort: s.effort, effort_meaning: effortMeaning(s.effort), feeling: s.feeling, note: s.note, kcal: s.kcal,
      exercises: s.items.map(({ exercise_id, name, sets, reps, weight_kg, done }) => ({ exercise_id, name, sets, reps, weight_kg, done })) });
  }
  return out;
}

// The quick first-run questions. Saves the answers, logs the first weight and builds the starter plan.
export async function onboard(db, uid, input) {
  for (const key of ['fitness_level', 'primary_goal', 'minutes', 'days_per_week', 'sex', 'birth_year', 'height_cm']) {
    if (input[key] === undefined || input[key] === null || input[key] === '') throw new HttpError(400, 'Please answer every question.');
  }
  const { weight_kg, ...profile } = input;
  await updateProfile(db, uid, { ...profile, equipment: input.equipment || [], onboarded: true });
  if (weight_kg) await logWeight(db, uid, { kg: weight_kg });
  await generatePlan(db, uid);
  return home(db, uid);
}
