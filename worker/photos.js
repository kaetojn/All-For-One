// Progress and meal photos. Only the analysis is kept. With an API key set, a photo is estimated as it
// arrives and never stored. Otherwise it waits privately in R2 for Claude's next review, and is deleted
// as soon as Claude saves its estimate. A row with an empty object_key has no photo left, only its numbers.

import { HttpError, newId } from './auth.js';
import { getProfile, todayIn, overview } from './store.js';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;
const POSES = ['front', 'side', 'back'];

const toBase64 = (buffer) => { let s = ''; const b = new Uint8Array(buffer); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

const PROMPTS = {
  body: (ctx) => `This is a progress photo the user took of themselves for their own fitness tracking (${ctx}). Estimate their body-fat percentage as a range from visible cues. Photo estimates are rough; say so through the width of the range. Reply with JSON only: {"body_fat_low": number, "body_fat_high": number, "notes": "one or two neutral, practical sentences about what is visible, no judgement"}. If the image does not show a person's physique clearly enough, reply {"unclear": true, "notes": "why"}.`,
  meal: () => `This is a photo of a meal. Estimate what it is and its nutrition for the portion shown. Reply with JSON only: {"name": "short name", "kcal": number, "protein_g": number, "items": ["main components"], "confidence": "low" | "medium" | "high"}. If it is not food, reply {"unclear": true, "notes": "why"}.`,
};

export async function estimate(env, kind, bytes, type, context, send = fetch) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const res = await send('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.VISION_MODEL || 'claude-sonnet-5-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: type, data: toBase64(bytes) } }, { type: 'text', text: PROMPTS[kind](context) }] }],
    }),
  });
  if (!res.ok) { console.error('vision failed', res.status, (await res.text()).slice(0, 300)); return null; }
  const data = await res.json();
  const reply = (data.content || []).map((c) => c.text || '').join('');
  try { return JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)); } catch { return null; }
}

const view = (r) => ({ id: r.id, kind: r.kind, pose: r.pose, date: r.date, estimate: r.estimate ? JSON.parse(r.estimate) : null, estimated_by: r.estimated_by, url: r.object_key ? `/api/photo/${r.id}` : null });

export async function upload(db, env, uid, request, send = fetch) {
  if (!env.PHOTOS) throw new HttpError(503, 'Photo storage is not set up yet.');
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const pose = url.searchParams.get('pose');
  const type = (request.headers.get('Content-Type') || '').split(';')[0];
  if (!['body', 'meal'].includes(kind)) throw new HttpError(400, 'Kind must be body or meal.');
  if (kind === 'body' && !POSES.includes(pose)) throw new HttpError(400, 'Pose must be front, side or back.');
  if (!TYPES.includes(type)) throw new HttpError(400, 'Upload a JPEG, PNG or WebP image.');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new HttpError(400, 'The photo must be under 4 MB.');
  const profile = await getProfile(db, uid);
  const id = newId();
  let context = '';
  if (kind === 'body') {
    const o = await overview(db, uid);
    context = [profile.sex, profile.height_cm && `${profile.height_cm} cm`, o.latest.weight && `${o.latest.weight.kg} kg`, `${pose} view`].filter(Boolean).join(', ');
  }
  const result = await estimate(env, kind, bytes, type, context, send).catch((e) => { console.error(e); return null; });
  // Keep the photo only if it still needs reading.
  const key = result ? '' : `${uid}/${kind}/${id}`;
  if (key) await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  await db.prepare(`INSERT INTO photos (id, user_id, kind, pose, date, object_key, estimate, estimated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, uid, kind, kind === 'body' ? pose : null, todayIn(profile.timezone), key, result ? JSON.stringify(result) : null, result ? 'app' : null, new Date().toISOString()).run();
  return view(await db.prepare(`SELECT * FROM photos WHERE id = ?`).bind(id).first());
}

export async function listPhotos(db, uid, kind, limit = 60) {
  const q = kind ? db.prepare(`SELECT * FROM photos WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?`).bind(uid, kind, limit) : db.prepare(`SELECT * FROM photos WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).bind(uid, limit);
  return (await q.all()).results.map(view);
}

async function own(db, uid, id) {
  const row = await db.prepare(`SELECT * FROM photos WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!row) throw new HttpError(404, 'Photo not found.');
  return row;
}

export async function servePhoto(db, env, uid, id) {
  const row = await own(db, uid, id);
  if (!row.object_key) throw new HttpError(404, 'This photo was deleted after it was analysed.');
  const object = env.PHOTOS && (await env.PHOTOS.get(row.object_key));
  if (!object) throw new HttpError(404, 'Photo file is missing.');
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}

export async function deletePhoto(db, env, uid, id) {
  const row = await own(db, uid, id);
  if (env.PHOTOS && row.object_key) await env.PHOTOS.delete(row.object_key);
  await db.prepare(`DELETE FROM photos WHERE id = ?`).bind(id).run();
}

// For Claude: the image itself, so it can look during a review.
export async function photoForClaude(db, env, uid, id) {
  const row = await own(db, uid, id);
  if (!row.object_key) throw new HttpError(404, 'This photo has already been analysed and deleted; only its estimate is kept.');
  const object = env.PHOTOS && (await env.PHOTOS.get(row.object_key));
  if (!object) throw new HttpError(404, 'Photo file is missing.');
  return [{ type: 'image', data: toBase64(await object.arrayBuffer()), mimeType: object.httpMetadata?.contentType || 'image/jpeg' }, { type: 'text', text: JSON.stringify(view(row)) }];
}

export async function saveEstimate(db, uid, id, input, env = {}) {
  const row = await own(db, uid, id);
  if (!input.estimate || typeof input.estimate !== 'object') throw new HttpError(400, 'Send an estimate object.');
  // The estimate is all that is kept: the photo goes as soon as it has been read.
  if (row.object_key && env.PHOTOS) await env.PHOTOS.delete(row.object_key);
  await db.prepare(`UPDATE photos SET estimate = ?, estimated_by = 'claude', object_key = '' WHERE id = ?`).bind(JSON.stringify(input.estimate).slice(0, 2000), id).run();
  return view(await own(db, uid, id));
}
