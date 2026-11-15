// Meal plans and the grocery price list. Claude writes both through the connector; the app shows them.

import { HttpError, newId } from './auth.js';
import { getProfile, todayIn } from './store.js';
import { addDays } from './calc.js';

export const CHAINS = ['Loblaws', 'Real Canadian Superstore', 'No Frills', 'Metro', 'Food Basics', 'Sobeys', 'FreshCo', 'Walmart', 'Costco'];
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const amount = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null; };

function monday(date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export async function getMealPlan(db, uid) {
  const row = await db.prepare(`SELECT id, week_start, plan, est_cost, reason, created_at FROM meal_plans WHERE user_id = ? AND replaced_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(uid).first();
  return row ? { ...row, plan: undefined, ...JSON.parse(row.plan) } : null;
}

export async function setMealPlan(db, uid, input) {
  const profile = await getProfile(db, uid);
  const days = Array.isArray(input.days) ? input.days : [];
  if (days.length < 1 || days.length > 7) throw new HttpError(400, 'A meal plan covers 1 to 7 days.');
  const plan = {
    days: days.map((d, i) => {
      const meals = Array.isArray(d.meals) ? d.meals : [];
      if (!meals.length || meals.length > 8) throw new HttpError(400, `Day ${i + 1} needs 1 to 8 meals.`);
      return {
        day: text(d.day || `Day ${i + 1}`, 20),
        meals: meals.map((m) => {
          if (!text(m.name, 120)) throw new HttpError(400, 'Every meal needs a name.');
          return { slot: SLOTS.includes(m.slot) ? m.slot : 'snack', name: text(m.name, 120), kcal: amount(m.kcal, 5000), protein_g: amount(m.protein_g, 400), ingredients: (Array.isArray(m.ingredients) ? m.ingredients : []).slice(0, 20).map((x) => text(x, 80)) };
        }),
      };
    }),
    shopping: (Array.isArray(input.shopping) ? input.shopping : []).slice(0, 80).map((s) => ({ item: text(s.item, 80), qty: text(s.qty, 30), est_price: amount(s.est_price, 1000), store: text(s.store, 40), bought: false })).filter((s) => s.item),
  };
  const cost = amount(input.est_cost, 100000) ?? Math.round(plan.shopping.reduce((sum, s) => sum + (s.est_price || 0), 0) * 100) / 100;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE meal_plans SET replaced_at = ? WHERE user_id = ? AND replaced_at IS NULL`).bind(now, uid),
    db.prepare(`INSERT INTO meal_plans (id, user_id, week_start, plan, est_cost, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId(), uid, /^\d{4}-\d{2}-\d{2}$/.test(input.week_start || '') ? input.week_start : monday(todayIn(profile.timezone)), JSON.stringify(plan), cost, text(input.reason, 1000) || null, now),
  ]);
  return getMealPlan(db, uid);
}

export async function toggleBought(db, uid, index) {
  const row = await db.prepare(`SELECT id, plan FROM meal_plans WHERE user_id = ? AND replaced_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(uid).first();
  if (!row) throw new HttpError(404, 'No meal plan yet.');
  const plan = JSON.parse(row.plan);
  const item = plan.shopping[Number(index)];
  if (!item) throw new HttpError(404, 'Item not found.');
  item.bought = !item.bought;
  await db.prepare(`UPDATE meal_plans SET plan = ? WHERE id = ?`).bind(JSON.stringify(plan), row.id).run();
  return getMealPlan(db, uid);
}

// The price list is shared reference data: staple foods per chain, each with the date it was checked.
export async function setPrices(db, uid, input) {
  const rows = (Array.isArray(input.prices) ? input.prices : []).slice(0, 400);
  if (!rows.length) throw new HttpError(400, 'Send at least one price.');
  const profile = await getProfile(db, uid);
  const today = todayIn(profile.timezone);
  const statements = [];
  for (const r of rows) {
    const price = amount(r.price, 1000);
    if (!CHAINS.includes(r.chain) || !text(r.item, 80) || price === null) throw new HttpError(400, `Each price needs a chain (${CHAINS.join(', ')}), an item and a price.`);
    statements.push(db.prepare(`INSERT INTO prices (chain, item, unit, price, as_of) VALUES (?, ?, ?, ?, ?) ON CONFLICT (chain, item) DO UPDATE SET unit = excluded.unit, price = excluded.price, as_of = excluded.as_of`)
      .bind(r.chain, text(r.item, 80).toLowerCase(), text(r.unit, 30) || null, price, today));
  }
  statements.push(db.prepare(`DELETE FROM price_refresh WHERE user_id = ?`).bind(uid));
  await db.batch(statements);
  return { saved: rows.length, as_of: today };
}

export async function getPrices(db, chain) {
  const q = chain ? db.prepare(`SELECT chain, item, unit, price, as_of FROM prices WHERE chain = ? ORDER BY item`).bind(chain) : db.prepare(`SELECT chain, item, unit, price, as_of FROM prices ORDER BY chain, item`);
  return (await q.all()).results;
}

export async function requestRefresh(db, uid) {
  await db.prepare(`INSERT INTO price_refresh (user_id, requested_at) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET requested_at = excluded.requested_at`).bind(uid, new Date().toISOString()).run();
  return { requested: true };
}

export async function foodState(db, uid) {
  const profile = await getProfile(db, uid);
  const [plan, stats, refresh] = await Promise.all([
    getMealPlan(db, uid),
    db.prepare(`SELECT COUNT(*) AS items, MIN(as_of) AS oldest, MAX(as_of) AS newest FROM prices WHERE chain = ?`).bind(profile.store || '').first(),
    db.prepare(`SELECT requested_at FROM price_refresh WHERE user_id = ?`).bind(uid).first(),
  ]);
  return { plan, prices: { store: profile.store, ...stats, refresh_requested: !!refresh } };
}
