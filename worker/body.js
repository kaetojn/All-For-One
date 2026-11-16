// The numbers behind the 3D body: today's shape from tape measurements (or sensible defaults until
// they exist) and a projected goal shape. The projection is an estimate, and the user can override any part.

import { HttpError } from './auth.js';
import { overview } from './store.js';
import { SITES } from './calc.js';

const RATIOS = {
  male: { neck: [0.21, 0.4], shoulders: [0.65, 0.3], chest: [0.54, 0.6], waist: [0.45, 1], belly: [0.47, 1], hips: [0.53, 0.6], bicep: [0.18, 0.6], forearm: [0.155, 0.4], thigh: [0.31, 0.6], calf: [0.21, 0.5] },
  female: { neck: [0.19, 0.4], shoulders: [0.6, 0.3], chest: [0.52, 0.6], waist: [0.42, 1], belly: [0.45, 1], hips: [0.57, 0.6], bicep: [0.16, 0.6], forearm: [0.14, 0.4], thigh: [0.33, 0.6], calf: [0.21, 0.5] },
};
// Centimetres each site typically shrinks per kilogram of fat lost.
const SHRINK = { waist: 0.9, belly: 1.0, hips: 0.6, chest: 0.4, thigh: 0.35, neck: 0.12, bicep: 0.1, calf: 0.08, forearm: 0.05, shoulders: 0.15 };
// Sites that grow a little when the goal asks to define an area.
const BUILD = { shoulders: { shoulders: 1.03 }, chest: { chest: 1.02 }, arms: { bicep: 1.04, forearm: 1.02 }, legs: { thigh: 1.02, calf: 1.02 }, calf: { calf: 1.03 }, glutes: { hips: 1.01 }, back: { shoulders: 1.015 } };
const r1 = (n) => Math.round(n * 10) / 10;

export function defaultMeasurements(sex, height_cm, weight_kg) {
  const h = height_cm || 170;
  const bmi = weight_kg ? weight_kg / (h / 100) ** 2 : 23;
  const f = bmi / 22;
  return Object.fromEntries(Object.entries(RATIOS[sex === 'female' ? 'female' : 'male']).map(([site, [ratio, power]]) => [site, r1(h * ratio * f ** (power * 0.7))]));
}

export function projectGoal(current, { weight_kg, target_weight_kg, areas = [], overrides = {} }) {
  const loss = weight_kg && target_weight_kg ? weight_kg - target_weight_kg : 0;
  const out = {};
  for (const site of SITES) {
    let cm = Math.max(current[site] - SHRINK[site] * loss, current[site] * 0.6);
    for (const area of areas) cm *= (BUILD[area] && BUILD[area][site]) || 1;
    out[site] = r1(overrides[site] ?? cm);
  }
  return out;
}

export async function bodyModel(db, uid) {
  const o = await overview(db, uid);
  const weight = o.latest.weight ? o.latest.weight.kg : null;
  const defaults = defaultMeasurements(o.profile.sex, o.profile.height_cm, weight);
  const current = { ...defaults, ...o.latest.measurements };
  const row = o.goal && (await db.prepare(`SELECT body_overrides FROM goals WHERE id = ?`).bind(o.goal.id).first());
  const overrides = row && row.body_overrides ? JSON.parse(row.body_overrides) : {};
  return {
    sex: o.profile.sex, height_cm: o.profile.height_cm || 170, skin_tone: o.profile.skin_tone || '#d19c74',
    measured: Object.keys(o.latest.measurements), current, weight_kg: weight, target_weight_kg: o.suggested.target_weight_kg || null, areas: o.goal ? o.goal.target_areas : [],
    goal: o.goal ? projectGoal(current, { weight_kg: weight, target_weight_kg: o.suggested.target_weight_kg, areas: o.goal.target_areas, overrides }) : null,
    goal_date: o.goal ? o.goal.target_date : null, overrides,
    body_fat: o.latest.body_fat ? o.latest.body_fat.pct : null,
    // The goal's body fat: as set, or what the goal weight implies if muscle is kept.
    target_body_fat: !o.goal ? null : o.goal.target_body_fat ?? (o.latest.body_fat && weight && o.suggested.target_weight_kg ? r1((1 - (weight * (1 - o.latest.body_fat.pct / 100)) / o.suggested.target_weight_kg) * 100) : null),
    projection: o.projection,
  };
}

export async function setOverrides(db, uid, input) {
  const o = await overview(db, uid);
  if (!o.goal) throw new HttpError(400, 'Set a goal first.');
  const clean = {};
  for (const [site, value] of Object.entries(input.overrides || {})) {
    if (!SITES.includes(site)) continue;
    const cm = Number(value);
    if (Number.isFinite(cm) && cm >= 10 && cm <= 250) clean[site] = r1(cm);
  }
  await db.prepare(`UPDATE goals SET body_overrides = ? WHERE id = ?`).bind(Object.keys(clean).length ? JSON.stringify(clean) : null, o.goal.id).run();
  return bodyModel(db, uid);
}
