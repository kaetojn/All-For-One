// OAuth 2.1 for the Claude connector: discovery, client registration, a sign-in and consent page,
// and tokens. Claude registers itself, sends you here to sign in, and gets a token for /mcp.
// Codes and tokens are stored hashed, so a copy of the database can't be replayed.

import { HttpError, checkPassword, sessionUser, sessionCookie, randomToken, sha256, b64url } from './auth.js';

const ACCESS_SECONDS = 3600;
const REFRESH_SECONDS = 180 * 86400;
const CODE_SECONDS = 300;
const now = () => Math.floor(Date.now() / 1000);

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...headers } });
const oauthError = (error, description, status = 400) => json({ error, error_description: description }, status);

export function metadata(origin) {
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['tracking'],
  });
}

export function resourceMetadata(origin) {
  return json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'], scopes_supported: ['tracking'] });
}

function validRedirect(uri) {
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  } catch { return false; }
}

export async function register(db, request) {
  let body;
  try { body = await request.json(); } catch { return oauthError('invalid_client_metadata', 'Send JSON.'); }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === 'string') : [];
  if (!uris.length || !uris.every(validRedirect) || uris.length > 10) return oauthError('invalid_redirect_uri', 'Provide one to ten https redirect URIs.');
  const client_id = randomToken(16);
  const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : 'Unnamed app';
  await db.prepare(`INSERT INTO oauth_clients (client_id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)`).bind(client_id, name, JSON.stringify(uris), new Date().toISOString()).run();
  return json({ client_id, client_name: name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }, 201);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/styles.css"></head><body class="auth-page"><main class="auth-card">${body}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action *; frame-ancestors 'none'" },
  });
}

async function readRequest(db, params) {
  const client = await db.prepare(`SELECT client_id, name, redirect_uris FROM oauth_clients WHERE client_id = ?`).bind(params.get('client_id') || '').first();
  if (!client) return { error: page('Connection problem', '<h1>Unknown app</h1><p>This connection request came from an app that is not registered here. Remove the connector in Claude and add it again.</p>', 400) };
  const redirect_uri = params.get('redirect_uri') || '';
  if (!JSON.parse(client.redirect_uris).includes(redirect_uri)) return { error: page('Connection problem', '<h1>Address mismatch</h1><p>The return address in this request does not match the one the app registered.</p>', 400) };
  const fields = { client_id: client.client_id, redirect_uri, state: params.get('state') || '', code_challenge: params.get('code_challenge') || '', code_challenge_method: params.get('code_challenge_method') || '', response_type: params.get('response_type') || '', scope: params.get('scope') || '', resource: params.get('resource') || '' };
  if (fields.response_type !== 'code' || fields.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(fields.code_challenge)) {
    const back = new URL(redirect_uri);
    back.searchParams.set('error', 'invalid_request');
    back.searchParams.set('error_description', 'Use response_type=code with an S256 code challenge.');
    if (fields.state) back.searchParams.set('state', fields.state);
    return { error: Response.redirect(back.toString(), 302) };
  }
  return { client, fields };
}

function consentPage(client, fields, user, message) {
  const hidden = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('');
  const signIn = user
    ? `<p class="muted">Signed in as ${esc(user.email)}.</p>`
    : `<label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>`;
  return page('Connect to All For One', `<h1>Connect ${esc(client.name)}</h1>
    <p>${esc(client.name)} is asking to read and update your All For One data: profile, goals, weight, measurements, daily logs and calorie targets.</p>
    ${message ? `<p class="error">${esc(message)}</p>` : ''}
    <form method="post" action="/oauth/authorize">${hidden}${signIn}
      <button class="primary" name="decision" value="allow">Allow</button>
      <button class="ghost" name="decision" value="deny" formnovalidate>Cancel</button>
    </form>`, message ? 401 : 200);
}

export async function authorize(db, request) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const { error, client, fields } = await readRequest(db, url.searchParams);
    if (error) return error;
    return consentPage(client, fields, await sessionUser(db, request));
  }
  const form = new URLSearchParams(await request.text());
  const { error, client, fields } = await readRequest(db, form);
  if (error) return error;
  const back = new URL(fields.redirect_uri);
  if (fields.state) back.searchParams.set('state', fields.state);
  if (form.get('decision') !== 'allow') {
    back.searchParams.set('error', 'access_denied');
    return Response.redirect(back.toString(), 302);
  }
  let user = await sessionUser(db, request);
  const headers = new Headers();
  if (!user) {
    try { user = await checkPassword(db, form.get('email'), form.get('password')); } catch (e) {
      if (e instanceof HttpError) return consentPage(client, fields, null, e.message);
      throw e;
    }
    headers.append('Set-Cookie', await sessionCookie(db, user.id));
  }
  const code = randomToken();
  await db.prepare(`INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(await sha256(code), client.client_id, user.id, fields.redirect_uri, fields.code_challenge, now() + CODE_SECONDS).run();
  back.searchParams.set('code', code);
  headers.set('Location', back.toString());
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 302, headers });
}

async function issueTokens(db, client_id, user_id) {
  const access = randomToken();
  const refresh = randomToken();
  await db.batch([
    db.prepare(`INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, expires_at) VALUES (?, 'access', ?, ?, ?)`).bind(await sha256(access), client_id, user_id, now() + ACCESS_SECONDS),
    db.prepare(`INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, expires_at) VALUES (?, 'refresh', ?, ?, ?)`).bind(await sha256(refresh), client_id, user_id, now() + REFRESH_SECONDS),
    db.prepare(`DELETE FROM oauth_tokens WHERE expires_at < ?`).bind(now()),
    db.prepare(`DELETE FROM oauth_codes WHERE expires_at < ?`).bind(now()),
  ]);
  return json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: 'tracking' });
}

export async function token(db, request) {
  const type = request.headers.get('Content-Type') || '';
  let form;
  try { form = type.includes('json') ? new URLSearchParams(await request.json()) : new URLSearchParams(await request.text()); } catch { return oauthError('invalid_request', 'Unreadable body.'); }
  const grant = form.get('grant_type');
  if (grant === 'authorization_code') {
    const hash = await sha256(form.get('code') || '');
    const row = await db.prepare(`SELECT client_id, user_id, redirect_uri, challenge, expires_at FROM oauth_codes WHERE code_hash = ?`).bind(hash).first();
    // A code works once: delete it before checking anything else.
    await db.prepare(`DELETE FROM oauth_codes WHERE code_hash = ?`).bind(hash).run();
    if (!row || row.expires_at < now()) return oauthError('invalid_grant', 'The code is wrong or has expired.');
    if (row.client_id !== form.get('client_id') || row.redirect_uri !== form.get('redirect_uri')) return oauthError('invalid_grant', 'The code was issued to a different app or address.');
    const verifier = form.get('code_verifier') || '';
    const digest = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    if (digest !== row.challenge) return oauthError('invalid_grant', 'The code verifier does not match.');
    return issueTokens(db, row.client_id, row.user_id);
  }
  if (grant === 'refresh_token') {
    const hash = await sha256(form.get('refresh_token') || '');
    const row = await db.prepare(`SELECT client_id, user_id, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'`).bind(hash).first();
    if (!row || row.expires_at < now() || (form.get('client_id') && form.get('client_id') !== row.client_id)) return oauthError('invalid_grant', 'The refresh token is wrong or has expired.');
    await db.prepare(`DELETE FROM oauth_tokens WHERE token_hash = ?`).bind(hash).run();
    return issueTokens(db, row.client_id, row.user_id);
  }
  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}

export async function bearerUser(db, request) {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const row = await db.prepare(`SELECT user_id, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'`).bind(await sha256(match[1])).first();
  if (!row || row.expires_at < now()) return null;
  return { id: row.user_id };
}
