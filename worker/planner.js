// Builds a starter workout plan from the profile: how many days, how long, what kit, what to emphasise.
// It is a sensible default so the app is useful on day one. Claude can replace the plan at any review.

import EXERCISES from './exercise-data.js';

export const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

const DAY_TYPES = {
  'Full body': ['quadriceps', 'chest', 'lats', 'hamstrings', 'shoulders', 'abdominals', 'middle back', 'triceps', 'biceps', 'glutes', 'calves'],
  Upper: ['chest', 'lats', 'shoulders', 'middle back', 'triceps', 'biceps', 'abdominals'],
  Lower: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals', 'quadriceps'],
  Push: ['chest', 'shoulders', 'triceps', 'chest', 'shoulders', 'abdominals'],
  Pull: ['lats', 'middle back', 'biceps', 'lats', 'abdominals', 'forearms'],
  Legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'quadriceps', 'abdominals'],
};

const SPLITS = {
  1: ['Full body'], 2: ['Full body', 'Full body'], 3: ['Full body', 'Full body', 'Full body'],
  4: ['Upper', 'Lower', 'Upper', 'Lower'], 5: ['Push', 'Pull', 'Legs', 'Upper', 'Lower'],
  6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'], 7: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Full body'],
};

// The areas a goal can name, mapped to the library's muscle names.
export const AREA_MUSCLES = {
  abs: ['abdominals'], waist: ['abdominals'], belly: ['abdominals'], chest: ['chest'], shoulders: ['shoulders'],
  back: ['lats', 'middle back'], arms: ['biceps', 'triceps'], bicep: ['biceps'], forearm: ['forearms'], glutes: ['glutes'],
  hips: ['glutes'], legs: ['quadriceps', 'hamstrings'], thigh: ['quadriceps', 'hamstrings'], calf: ['calves'], neck: [],
};

const LEVEL_ALLOWS = { beginner: ['beginner'], intermediate: ['beginner', 'intermediate'], advanced: ['beginner', 'intermediate', 'expert'] };
// Familiar movements rank ahead of the library's more unusual ones.
const STAPLE = /bench press|push-?ups?|squat|deadlift|\brow|pulldown|pull-?ups?|chin-?up|shoulder press|lunge|curl|dips?\b|plank|crunch|calf raise|lateral raise|glute bridge|hip thrust|goblet|extension|fl(y|ies|ye)|leg press|step-?up/i;

// The best-known movement for each muscle gets first pick of its slot.
const CLASSIC = {
  chest: /bench press|push-?ups?/i, shoulders: /press/i, quadriceps: /squat|lunge|leg press/i, hamstrings: /deadlift|leg curl/i,
  lats: /pulldown|pull-?ups?|chin-?up|row/i, 'middle back': /row/i, triceps: /dips?\b|extension|pushdown|close-grip/i, biceps: /curl/i,
  glutes: /bridge|thrust/i, calves: /calf raise/i, abdominals: /crunch|plank|leg raise|sit-?up/i,
};
// The library files these under "body only", but they need a bar, a bench or straps.
const NEEDS_APPARATUS = /chin|pull-?ups?|decline|incline|bench|dips?\b|hanging|inverted row|parallel bar/i;
// Too unusual, or needing kit nobody lists, to put in a plan automatically. Claude can still choose them.
const UNUSUAL = /sled|trap bar|suspended|rings?\b|chains|board|tire|sandbag|\blog\b|yoke|atlas|keg|gorilla|otis|kipping|muscle up|one arm chin|london|manual|partner|plate|neck/i;

export function allowed(profile) {
  const kit = new Set(['body only', ...(profile.equipment || [])]);
  const levels = LEVEL_ALLOWS[profile.fitness_level] || LEVEL_ALLOWS.beginner;
  return (e) => kit.has(e.equipment) && levels.includes(e.level);
}

function candidates(muscle, profile, compoundOnly) {
  const ok = allowed(profile);
  const kit = profile.equipment || [];
  const ownsKit = kit.length > 0;
  const hasBars = kit.includes('other');
  const score = (e) =>
    (CLASSIC[muscle] && CLASSIC[muscle].test(e.name) ? 3 : 0) + (STAPLE.test(e.name) ? 4 : 0) + (e.compound ? 2 : 0) + (e.level === 'beginner' ? 1 : 0) + (ownsKit && e.equipment !== 'body only' ? 1 : 0);
  let list = EXERCISES.filter((e) =>
    e.category === 'strength' && e.muscles.includes(muscle) && ok(e) && !UNUSUAL.test(e.name) &&
    (hasBars || e.equipment !== 'body only' || !NEEDS_APPARATUS.test(e.name)));
  if (compoundOnly && list.some((e) => e.compound)) list = list.filter((e) => e.compound);
  return list.sort((a, b) => score(b) - score(a) || a.name.length - b.name.length || a.name.localeCompare(b.name));
}

export function buildPlan(profile, targetAreas = [], { accessories = true } = {}) {
  const days = Math.min(Math.max(profile.days_per_week || 3, 1), 7);
  const minutes = profile.minutes || 40;
  const strength = profile.primary_goal === 'strength';
  const sets = Math.max(2, (strength ? 4 : 3) - (profile.fitness_level === 'beginner' ? 1 : 0));
  const perExercise = sets * (strength ? 3 : 2.25) + 1; // minutes, including rest and setup
  let count = Math.min(Math.max(Math.round(minutes / perExercise), 3), 8);
  if (!accessories) count = Math.min(count, 5);
  const targets = [...new Set(targetAreas.flatMap((a) => AREA_MUSCLES[a] || []))];
  const used = new Set();
  const seen = {};

  const plan = SPLITS[days].map((type) => {
    const all = DAY_TYPES[type];
    const slots = all.slice(0, count);
    // Make room for the areas the goal names, when this kind of day trains them.
    for (const muscle of targets) {
      if (!all.includes(muscle) || slots.includes(muscle)) continue;
      for (let i = slots.length - 1; i >= 1; i--) if (!targets.includes(slots[i])) { slots[i] = muscle; break; }
    }
    const exercises = [];
    // With little kit some muscles have no movement available, so keep going down the list until the day is full.
    const queue = [...slots, ...all.slice(count), 'glutes', 'lower back', 'quadriceps', 'abdominals', 'calves', 'triceps'];
    for (const muscle of queue) {
      if (exercises.length >= count) break;
      // Prefer something not already in the plan; repeating a movement on another day is fine when choice is thin.
      const today = new Set(exercises.map((x) => x.exercise_id));
      const pool = candidates(muscle, profile, !accessories).filter((e) => !today.has(e.id));
      const pick = pool.find((e) => !used.has(e.id)) || pool[0];
      if (!pick) continue;
      used.add(pick.id);
      const core = muscle === 'abdominals';
      exercises.push({ exercise_id: pick.id, sets, reps: core ? 15 : strength && pick.compound ? 6 : 12 });
    }
    seen[type] = (seen[type] || 0) + 1;
    const repeats = SPLITS[days].filter((t) => t === type).length > 1;
    return { name: repeats ? `${type} ${'ABCD'[seen[type] - 1]}` : type, exercises };
  });
  return { days: plan.filter((d) => d.exercises.length) };
}

export function estimateMinutes(day) {
  return Math.round(day.exercises.reduce((sum, x) => sum + (x.sets || 3) * 2.25 + 1, 0) / 5) * 5;
}

export function searchExercises({ muscle, equipment, level, query, limit = 25 } = {}) {
  const q = query ? String(query).toLowerCase() : null;
  return EXERCISES.filter((e) =>
    (!muscle || e.muscles.includes(muscle) || e.also.includes(muscle)) &&
    (!equipment || e.equipment === equipment) && (!level || e.level === level) && (!q || e.name.toLowerCase().includes(q)))
    .slice(0, Math.min(Math.max(Number(limit) || 25, 1), 60))
    .map(({ id, name, level, equipment, category, compound, muscles }) => ({ id, name, level, equipment, category, compound, muscles }));
}
