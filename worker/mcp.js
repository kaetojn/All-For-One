// The Claude connector: a Model Context Protocol server over HTTP at /mcp.
// Each tool is a thin wrapper over store.js, so Claude follows the same rules as the app.

import { HttpError } from './auth.js';
import { bearerUser, logStep } from './oauth.js';
import * as store from './store.js';
import * as workouts from './workouts.js';
import { searchExercises } from './planner.js';
import * as coach from './coach.js';
import * as meals from './meals.js';
import * as photos from './photos.js';
import { bodyModel } from './body.js';
import { SITES, ACTIVITY } from './calc.js';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const date = { type: 'string', description: 'Date as YYYY-MM-DD. Leave out for today in the user\'s time zone.' };

const TOOLS = [
  {
    name: 'get_overview',
    title: 'Get overview',
    description: 'Read the current picture: profile (level, time, days a week, equipment, primary goal), today\'s workout and this week\'s count, streak, active goal, the calorie target in force, the target the goal and timeline imply (with safety warnings and a safer alternative when the pace is aggressive), latest weight, body fat and measurements, and the last 7 days of logging. Call this first.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (db, uid) => workouts.home(db, uid),
  },
  {
    name: 'get_history',
    title: 'Get history',
    description: 'Read weights, daily calorie logs, tape measurements and the body-fat series over a period. Use it for weekly and monthly reviews.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 1100, description: 'How many days back from today. Default 90.' } } },
    readOnly: true,
    run: (db, uid, a) => store.history(db, uid, a.days),
  },
  {
    name: 'get_target_history',
    title: 'Get target history',
    description: 'List past calorie targets with who set each one and why, newest first.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (db, uid) => store.targetHistory(db, uid),
  },
  {
    name: 'log_weight',
    title: 'Log weight',
    description: 'Record body weight for a day, in kilograms. A second entry for the same day replaces the first.',
    inputSchema: { type: 'object', properties: { kg: { type: 'number' }, date }, required: ['kg'] },
    run: (db, uid, a) => store.logWeight(db, uid, a, 'claude'),
  },
  {
    name: 'log_measurements',
    title: 'Log measurements',
    description: `Record tape measurements for a day, in centimetres. Sites: ${SITES.join(', ')}. Neck and waist (plus hips for women) drive the body-fat number.`,
    inputSchema: { type: 'object', properties: { values: { type: 'object', properties: Object.fromEntries(SITES.map((s) => [s, { type: 'number' }])), additionalProperties: false }, date }, required: ['values'] },
    run: (db, uid, a) => store.logMeasurements(db, uid, a),
  },
  {
    name: 'log_day',
    title: 'Log day',
    description: 'Record the daily check: calories eaten, protein in grams, whether the calorie target was met, and a note. Only the fields you send change.',
    inputSchema: { type: 'object', properties: { calories: { type: 'integer' }, protein_g: { type: 'integer' }, target_met: { type: 'boolean' }, note: { type: 'string' }, date } },
    run: (db, uid, a) => store.logDay(db, uid, a),
  },
  {
    name: 'set_goal',
    title: 'Set goal',
    description: 'Set the active goal: a target body-fat percentage and/or target weight, a target date, and the body areas to define. Replaces the current goal, which is kept on record. Check get_overview afterwards for the implied calorie target and any safety warnings, and tell the user about them.',
    inputSchema: { type: 'object', properties: { target_body_fat: { type: 'number', description: 'Percent, for example 15.' }, target_weight_kg: { type: 'number' }, target_date: { type: 'string', description: 'YYYY-MM-DD, in the future.' }, target_areas: { type: 'array', items: { type: 'string' }, description: `Any of: ${[...SITES, 'abs', 'back', 'glutes', 'arms', 'legs'].join(', ')}.` } }, required: ['target_date'] },
    run: (db, uid, a) => store.setGoal(db, uid, a),
  },
  {
    name: 'set_calorie_target',
    title: 'Set calorie target',
    description: 'Change the daily calorie and protein target. Applies immediately and is recorded with your reason, which the user sees in the app and can revert. If the target is below the safety floor or implies losing more than 1% of body weight a week, say so plainly in the reason and to the user.',
    inputSchema: { type: 'object', properties: { calories: { type: 'integer' }, protein_g: { type: 'integer' }, reason: { type: 'string', description: 'One or two sentences the user will read: what changed and why.' } }, required: ['calories', 'reason'] },
    run: (db, uid, a) => store.setTarget(db, uid, a, 'claude'),
  },
  {
    name: 'get_workout_plan',
    title: 'Get workout plan',
    description: 'Read the current workout plan: each day with its exercises, sets and reps.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: async (db, uid) => workouts.planView(await workouts.getPlan(db, uid)),
  },
  {
    name: 'get_workouts',
    title: 'Get workouts',
    description: 'List finished workouts, newest first: what was done, weights used, effort from 1 to 10 with what it means, and how the user felt. Use it in reviews to see which exercises get skipped and when effort is trending too high.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 400, description: 'How many days back. Default 30.' } } },
    readOnly: true,
    run: (db, uid, a) => workouts.workoutHistory(db, uid, a.days),
  },
  {
    name: 'search_exercises',
    title: 'Search exercises',
    description: 'Find exercises in the built-in library (about 780, each with demo photos in the app). Filter by muscle (abdominals, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, quadriceps, shoulders, traps, triceps), equipment, level (beginner, intermediate, expert) or a name fragment. Returns ids to use in set_workout_plan.',
    inputSchema: { type: 'object', properties: { muscle: { type: 'string' }, equipment: { type: 'string', description: `"body only" or one of: ${store.EQUIPMENT.join(', ')}.` }, level: { type: 'string' }, query: { type: 'string' }, limit: { type: 'integer' } } },
    readOnly: true,
    run: (db, uid, a) => searchExercises(a),
  },
  {
    name: 'set_workout_plan',
    title: 'Set workout plan',
    description: 'Replace the workout plan. Only use exercises the user has the equipment for (see the profile), fit each day inside their minutes per workout, and match the number of days to their days a week. Days are done in order, whatever the weekday. Applies immediately; the reason is shown to the user in the app.',
    inputSchema: { type: 'object', properties: { days: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', properties: { name: { type: 'string' }, exercises: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', properties: { exercise_id: { type: 'string' }, sets: { type: 'integer' }, reps: { type: 'integer' } }, required: ['exercise_id'] } } }, required: ['name', 'exercises'] } }, reason: { type: 'string', description: 'One or two sentences the user will read: what changed and why.' } }, required: ['days', 'reason'] },
    run: (db, uid, a) => workouts.setPlan(db, uid, a, 'claude'),
  },
  {
    name: 'get_review_brief',
    title: 'Get review brief',
    description: 'Everything needed for a weekly or monthly review in one call: whether a review is due, the period it should cover, the current picture, history, finished workouts with effort and any symptoms, and the last review. A review should: read this, look at any new photos, adjust the calorie target and workout plan if the data supports it, then call save_review.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (db, uid) => coach.reviewBrief(db, uid),
  },
  {
    name: 'save_review',
    title: 'Save review',
    description: 'Record a finished review. The summary appears in the app: what went well, what changed (targets, plan) and why, and one thing to focus on next. Plain language, no diagnosis. If symptoms include chest pain, dizziness or shortness of breath, tell the user to see a doctor before training again.',
    inputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
    run: (db, uid, a) => coach.saveReview(db, uid, a),
  },
  {
    name: 'get_food_setup',
    title: 'Get food setup',
    description: 'Read the current meal plan and shopping list, the user\'s store, weekly grocery budget, household size and dietary needs (in the profile from get_overview), and whether the user has asked for a price refresh.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (db, uid) => meals.foodState(db, uid),
  },
  {
    name: 'get_prices',
    title: 'Get prices',
    description: `Read the stored grocery price list for a chain (${meals.CHAINS.join(', ')}), or all chains. Each price has the date it was last checked.`,
    inputSchema: { type: 'object', properties: { chain: { type: 'string' } } },
    readOnly: true,
    run: (db, uid, a) => meals.getPrices(db, a.chain),
  },
  {
    name: 'set_prices',
    title: 'Set prices',
    description: 'Add or update grocery prices after looking up current flyers and shelf prices for the user\'s store. Use real prices you found, never guesses. Clears the user\'s refresh request.',
    inputSchema: { type: 'object', properties: { prices: { type: 'array', items: { type: 'object', properties: { chain: { type: 'string', enum: meals.CHAINS }, item: { type: 'string' }, unit: { type: 'string', description: 'For example "per kg", "12 pack", "900 g".' }, price: { type: 'number', description: 'Canadian dollars.' } }, required: ['chain', 'item', 'price'] } } }, required: ['prices'] },
    run: (db, uid, a) => meals.setPrices(db, uid, a),
  },
  {
    name: 'set_meal_plan',
    title: 'Set meal plan',
    description: 'Replace the weekly meal plan and shopping list. Hit the user\'s calorie and protein targets per day for the user alone, respect every dietary need and health condition in the profile, scale the shopping list to the household size, and keep the estimated cost inside the weekly budget using the stored prices for their store.',
    inputSchema: { type: 'object', properties: { week_start: { type: 'string', description: 'YYYY-MM-DD, a Monday. Defaults to this week.' }, days: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', properties: { day: { type: 'string' }, meals: { type: 'array', items: { type: 'object', properties: { slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] }, name: { type: 'string' }, kcal: { type: 'number' }, protein_g: { type: 'number' }, ingredients: { type: 'array', items: { type: 'string' } } }, required: ['slot', 'name'] } } }, required: ['day', 'meals'] } }, shopping: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, qty: { type: 'string' }, est_price: { type: 'number' }, store: { type: 'string' } }, required: ['item'] } }, est_cost: { type: 'number' }, reason: { type: 'string' } }, required: ['days'] },
    run: (db, uid, a) => meals.setMealPlan(db, uid, a),
  },
  {
    name: 'list_photos',
    title: 'List photos',
    description: 'List the user\'s progress photos (kind "body", with pose and any estimate) or meal photos (kind "meal"), newest first.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['body', 'meal'] } } },
    readOnly: true,
    run: (db, uid, a) => photos.listPhotos(db, uid, a.kind),
  },
  {
    name: 'view_photo',
    title: 'View photo',
    description: 'Look at one photo by id. Progress photos are the user\'s own, shared for fitness tracking: describe visible change neutrally and practically.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    readOnly: true,
    raw: true,
    run: (db, uid, a, env) => photos.photoForClaude(db, env, uid, a.id),
  },
  {
    name: 'save_photo_estimate',
    title: 'Save photo estimate',
    description: 'Save your estimate for a photo. Body: {"body_fat_low", "body_fat_high", "notes"}. Meal: {"name", "kcal", "protein_g", "items", "confidence"}. The tape-measure figure stays the official body-fat number; this is shown beside it.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, estimate: { type: 'object' } }, required: ['id', 'estimate'] },
    run: (db, uid, a) => photos.saveEstimate(db, uid, a.id, a),
  },
  {
    name: 'get_body_model',
    title: 'Get body model',
    description: 'Read the measurements behind the 3D body: current shape, projected goal shape, which sites were actually measured, and any manual overrides.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (db, uid) => bodyModel(db, uid),
  },
  {
    name: 'update_profile',
    title: 'Update profile',
    description: `Update profile fields used by the formulas, plans and reviews. activity is one of: ${Object.keys(ACTIVITY).join(', ')}. review_cadence is weekly, biweekly or monthly. equipment replaces the whole list.`,
    inputSchema: { type: 'object', properties: { sex: { type: 'string', enum: ['male', 'female'] }, birth_year: { type: 'integer' }, height_cm: { type: 'number' }, activity: { type: 'string', enum: Object.keys(ACTIVITY) }, units: { type: 'string', enum: ['metric', 'imperial'] }, timezone: { type: 'string' }, review_cadence: { type: 'string', enum: ['weekly', 'biweekly', 'monthly'] }, fitness_level: { type: 'string', enum: store.LEVELS }, primary_goal: { type: 'string', enum: store.GOALS }, conditions: { type: 'array', items: { type: 'string' }, description: 'Health conditions and injuries the user has told you about, in their words.' }, diet: { type: 'array', items: { type: 'string' }, description: 'Dietary needs, for example vegan, no dairy, low fat.' }, store: { type: 'string', enum: meals.CHAINS }, postal: { type: 'string' }, weekly_budget: { type: 'number' }, household: { type: 'integer' }, minutes: { type: 'integer', description: 'Minutes per workout.' }, days_per_week: { type: 'integer' }, equipment: { type: 'array', items: { type: 'string', enum: store.EQUIPMENT } }, build: { type: 'string', enum: store.BUILDS, description: 'How the body sketch is drawn: lean, muscular or bodybuilder.' } } },
    run: (db, uid, a) => store.updateProfile(db, uid, a),
  },
];

const INSTRUCTIONS = 'All For One is the user\'s personal diet and fitness tracker. Stored values are metric (kg, cm); convert when the profile says imperial. Start with get_overview. Workouts come from a plan of ordered days; build plans with search_exercises and set_workout_plan. For a scheduled review, start with get_review_brief and end with save_review. Meal plans and grocery prices are yours to write (set_meal_plan, set_prices). Respect the conditions and dietary needs in the profile; never diagnose. The tape-measure body-fat figure is the official one. When you change the calorie target, give a short reason the user can read in the app. Unsafe paces are allowed but must be flagged clearly.';

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handle(db, uid, msg, env) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid request');
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
      await logStep(db, 'mcp_initialize', true, `version=${asked}`);
      return rpcResult(msg.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'all-for-one', title: 'All For One', version: '0.1.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(msg.id, {});
    case 'tools/list':
      return rpcResult(msg.id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, readOnly }) => ({ name, title, description, inputSchema, annotations: { title, readOnlyHint: !!readOnly, destructiveHint: false, openWorldHint: false } })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === (msg.params && msg.params.name));
      if (!tool) return rpcError(msg.id, -32602, 'Unknown tool');
      try {
        const data = await tool.run(db, uid, (msg.params && msg.params.arguments) || {}, env);
        return rpcResult(msg.id, { content: tool.raw ? data : [{ type: 'text', text: JSON.stringify(data) }] });
      } catch (e) {
        if (!(e instanceof HttpError)) console.error('tool failed', tool.name, e);
        return rpcResult(msg.id, { content: [{ type: 'text', text: e instanceof HttpError ? e.message : 'Something went wrong on the server.' }], isError: true });
      }
    }
    default:
      return isNotification ? null : rpcError(msg.id, -32601, 'Method not found');
  }
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

export async function mcp(db, request, origin, env = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const user = await bearerUser(db, request);
  if (!user) {
    if (request.headers.get('Authorization')) await logStep(db, 'mcp', false, 'token not recognised or expired');
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`, ...CORS },
    });
  }
  // Signed-in clients may ask for a server-to-client stream; this server has none to offer.
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405, headers: { Allow: 'POST', ...CORS } });
  let body;
  try { body = await request.json(); } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const replies = [];
  for (const msg of batch ? body : [body]) {
    const reply = await handle(db, user.id, msg, env);
    if (reply) replies.push(reply);
  }
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? replies : replies[0], { headers: CORS });
}
