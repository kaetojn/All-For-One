// Accounts and sessions. Passwords are hashed with PBKDF2; sessions are signed tokens in a cookie.
// The signing key is generated on first use and kept in the meta table, so there is no secret to set up.

const enc = new TextEncoder();
const COOKIE = 'afo_session';
const SESSION_DAYS = 30;

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const newId = () => crypto.randomUUID();

export async function sha256(text) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(salt), iterations: 100000 }, key, 256);
  return b64url(bits);
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

let cachedKey = null;
export function resetKeyCache() { cachedKey = null; }

async function signingKey(db) {
  if (cachedKey) return cachedKey;
  await db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('session_key', ?)`).bind(randomToken(48)).run();
  const row = await db.prepare(`SELECT value FROM meta WHERE key = 'session_key'`).first();
  cachedKey = await crypto.subtle.importKey('raw', enc.encode(row.value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return cachedKey;
}

async function sign(db, payload) {
  return b64url(await crypto.subtle.sign('HMAC', await signingKey(db), enc.encode(payload)));
}

export async function userCount(db) {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM users`).first()).n;
}

// This is a personal app: the first account claims it, and sign-up closes after that.
export async function signUp(db, email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (String(password || '').length < 10) throw new HttpError(400, 'Use a password of at least 10 characters.');
  if ((await userCount(db)) > 0) throw new HttpError(403, 'This app already has its owner. Sign in instead.');
  const id = newId();
  const salt = randomToken(16);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO users (id, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)`).bind(id, email, await hashPassword(password, salt), salt, now),
    db.prepare(`INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)`).bind(id, now),
  ]);
  return { id, email };
}

export async function checkPassword(db, email, password) {
  email = String(email || '').trim().toLowerCase();
  const user = await db.prepare(`SELECT id, email, pass_hash, salt FROM users WHERE email = ?`).bind(email).first();
  // Hash even when the account doesn't exist, so the response time doesn't reveal which emails are registered.
  const hash = await hashPassword(String(password || ''), user ? user.salt : 'AAAAAAAAAAAAAAAAAAAAAA');
  if (!user || !sameString(hash, user.pass_hash)) throw new HttpError(401, 'Wrong email or password.');
  return { id: user.id, email: user.email };
}

export async function sessionCookie(db, userId) {
  const payload = b64url(enc.encode(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 86400000 })));
  const token = `${payload}.${await sign(db, payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function sessionUser(db, request) {
  const match = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;
  const [payload, sig] = match[1].split('.');
  if (!payload || !sig || !sameString(sig, await sign(db, payload))) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(fromB64url(payload))); } catch { return null; }
  if (!data.uid || data.exp < Date.now()) return null;
  return db.prepare(`SELECT id, email FROM users WHERE id = ?`).bind(data.uid).first();
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
