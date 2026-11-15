// The numbers: body fat from tape measurements, energy needs, and the calorie target a goal implies.
// Pure functions, no storage.

export const SITES = ['neck', 'shoulders', 'chest', 'waist', 'belly', 'hips', 'bicep', 'forearm', 'thigh', 'calf'];

export const ACTIVITY = {
  sedentary: 1.2, // desk job, little exercise
  light: 1.375, // 1 to 3 workouts a week
  moderate: 1.55, // 3 to 5 workouts a week
  active: 1.725, // 6 to 7 workouts a week
  very_active: 1.9, // physical job plus training
};

const KCAL_PER_KG = 7700; // energy in a kilogram of body fat
const MAX_WEEKLY_LOSS = 0.01; // 1% of body weight a week
const FLOOR = { male: 1500, female: 1200 };

const round1 = (n) => Math.round(n * 10) / 10;

// US Navy method, metric form. Needs neck and waist, plus hips for women.
// Returns a percentage, or null when a measurement is missing or the result is implausible.
export function navyBodyFat({ sex, height_cm, neck, waist, hips }) {
  if (!height_cm || !neck || !waist) return null;
  let pct;
  if (sex === 'female') {
    if (!hips || waist + hips - neck <= 0) return null;
    pct = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(height_cm)) - 450;
  } else if (sex === 'male') {
    if (waist - neck <= 0) return null;
    pct = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height_cm)) - 450;
  } else return null;
  if (!Number.isFinite(pct) || pct < 2 || pct > 70) return null;
  return round1(pct);
}

// Mifflin-St Jeor resting energy, kcal a day.
export function bmr({ sex, weight_kg, height_cm, age }) {
  if (!weight_kg || !height_cm || !age || (sex !== 'male' && sex !== 'female')) return null;
  return 10 * weight_kg + 6.25 * height_cm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function tdee(profile, weight_kg, year) {
  const age = profile.birth_year ? year - profile.birth_year : null;
  const base = bmr({ sex: profile.sex, weight_kg, height_cm: profile.height_cm, age });
  if (!base) return null;
  return Math.round(base * (ACTIVITY[profile.activity] || ACTIVITY.light));
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

export function addDays(date, days) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}

// The weight a body-fat goal implies, assuming lean mass is kept.
export function weightForBodyFat(weight_kg, body_fat, target_body_fat) {
  if (!weight_kg || body_fat == null || target_body_fat == null) return null;
  const lean = weight_kg * (1 - body_fat / 100);
  return round1(lean / (1 - target_body_fat / 100));
}

// What the goal and timeline ask for. Unsafe plans are not blocked: they come back with
// warnings and a safer alternative, and the caller decides.
export function plan({ profile, weight_kg, body_fat, goal, today }) {
  const missing = [];
  if (!profile.sex) missing.push('sex');
  if (!profile.birth_year) missing.push('birth year');
  if (!profile.height_cm) missing.push('height');
  if (!weight_kg) missing.push('a weight entry');
  if (missing.length) return { ready: false, missing };

  const maintenance = tdee(profile, weight_kg, Number(today.slice(0, 4)));
  const protein_g = Math.round(weight_kg * 1.8);
  const out = { ready: true, maintenance, protein_g, warnings: [] };
  if (!goal) return { ...out, calories: maintenance, weekly_change_kg: 0 };

  const target_weight =
    goal.target_weight_kg ?? weightForBodyFat(weight_kg, body_fat, goal.target_body_fat);
  if (!target_weight) {
    return { ...out, calories: maintenance, weekly_change_kg: 0, missing: ['neck and waist measurements, to turn the body-fat goal into a weight'] };
  }
  out.target_weight_kg = target_weight;
  const to_lose = weight_kg - target_weight;
  const days = daysBetween(today, goal.target_date);
  if (days <= 0) {
    out.warnings.push({ code: 'date_passed', message: 'The target date has passed. Set a new date to get a calorie target.' });
    return { ...out, calories: maintenance, weekly_change_kg: 0 };
  }
  const daily_deficit = (to_lose * KCAL_PER_KG) / days;
  out.calories = Math.round(maintenance - daily_deficit);
  out.weekly_change_kg = round1((-to_lose / days) * 7);

  if (to_lose > 0) {
    const floor = FLOOR[profile.sex];
    const max_weekly = weight_kg * MAX_WEEKLY_LOSS;
    const too_fast = -out.weekly_change_kg > max_weekly + 0.05;
    const too_low = out.calories < floor;
    if (too_fast) out.warnings.push({ code: 'too_fast', message: `This pace is about ${-out.weekly_change_kg} kg a week. More than ${round1(max_weekly)} kg a week (1% of body weight) risks muscle loss.` });
    if (too_low) out.warnings.push({ code: 'too_low', message: `${out.calories} kcal a day is below the ${floor} kcal minimum usually advised without medical supervision.` });
    if (too_fast || too_low) {
      const safe_calories = Math.max(floor, Math.round(maintenance - (max_weekly * KCAL_PER_KG) / 7));
      const safe_deficit = maintenance - safe_calories;
      out.safer = safe_deficit > 0
        ? { calories: safe_calories, target_date: addDays(today, Math.ceil((to_lose * KCAL_PER_KG) / safe_deficit)) }
        : null;
    }
  }
  return out;
}
