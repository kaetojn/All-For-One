// The Claude connector: a Model Context Protocol server over HTTP at /mcp.
// Each tool is a thin wrapper over store.js, so Claude follows the same rules as the app.

import { HttpError } from './auth.js';
import { bearerUser } from './oauth.js';
import * as store from './store.js';
import { SITES, ACTIVITY } from './calc.js';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const date = { type: 'string', description: 'Date as YYYY-MM-DD. Leave out for today in the user\'s time zone.' };

const TOOLS = [
  {
    name: 'get_overview',
    title: 'Get overview',
    description: 'Read the current picture: profile, active goal, the calorie target in force, the target the goal and timeline imply (with safety warnings and a safer alternative when the pace is aggressive), latest weight, body fat and measurements, and the last 7 days of logging. Call this first.',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (db, uid) => store.overview(db, uid),
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
    name: 'update_profile',
    title: 'Update profile',
    description: `Update profile fields used by the formulas and reviews. activity is one of: ${Object.keys(ACTIVITY).join(', ')}. review_cadence is weekly, biweekly or monthly.`,
    inputSchema: { type: 'object', properties: { sex: { type: 'string', enum: ['male', 'female'] }, birth_year: { type: 'integer' }, height_cm: { type: 'number' }, activity: { type: 'string', enum: Object.keys(ACTIVITY) }, units: { type: 'string', enum: ['metric', 'imperial'] }, timezone: { type: 'string' }, review_cadence: { type: 'string', enum: ['weekly', 'biweekly', 'monthly'] } } },
    run: (db, uid, a) => store.updateProfile(db, uid, a),
  },
];

const INSTRUCTIONS = 'All For One is the user\'s personal diet and fitness tracker. Stored values are metric (kg, cm); convert when the profile says imperial. Start with get_overview. The tape-measure body-fat figure is the official one. When you change the calorie target, give a short reason the user can read in the app. Unsafe paces are allowed but must be flagged clearly.';

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handle(db, uid, msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid request');
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
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
        const data = await tool.run(db, uid, (msg.params && msg.params.arguments) || {});
        return rpcResult(msg.id, { content: [{ type: 'text', text: JSON.stringify(data) }] });
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

export async function mcp(db, request, origin) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405, headers: { Allow: 'POST', ...CORS } });
  const user = await bearerUser(db, request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`, ...CORS },
    });
  }
  let body;
  try { body = await request.json(); } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const replies = [];
  for (const msg of batch ? body : [body]) {
    const reply = await handle(db, user.id, msg);
    if (reply) replies.push(reply);
  }
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? replies : replies[0], { headers: CORS });
}
