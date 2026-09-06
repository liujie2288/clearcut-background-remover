interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first(): Promise<Record<string, unknown> | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

type GoogleProfile = { sub: string; email: string; name?: string; picture?: string };

const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function redirect(request: Request, pathname: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Location', new URL(pathname, request.url).toString());
  return new Response(null, { status: 302, headers: responseHeaders });
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function sessionId(request: Request) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('cc_session='))?.slice(11);
}

export const onRequest = async ({ request, env, params }: { request: Request; env: Env; params: { path?: string | string[] } }) => {
  const route = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
  const url = new URL(request.url);

  if (route === 'google' && request.method === 'GET') {
    const state = randomToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(new Date().toISOString()).run();
    await env.DB.prepare('INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)').bind(state, expiresAt).run();
    const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    google.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    google.searchParams.set('redirect_uri', new URL('/api/auth/google/callback', url).toString());
    google.searchParams.set('response_type', 'code');
    google.searchParams.set('scope', 'openid email profile');
    google.searchParams.set('state', state);
    return Response.redirect(google.toString(), 302);
  }

  if (route === 'google/callback' && request.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return redirect(request, '/?login=failed');
    const saved = await env.DB.prepare('SELECT state FROM oauth_states WHERE state = ? AND expires_at > ?').bind(state, new Date().toISOString()).first();
    await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
    if (!saved) return redirect(request, '/?login=failed');
    const tokens = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: new URL('/api/auth/google/callback', url).toString(), grant_type: 'authorization_code' }) });
    if (!tokens.ok) return redirect(request, '/?login=failed');
    const token = await tokens.json() as { access_token?: string };
    if (!token.access_token) return redirect(request, '/?login=failed');
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!profileResponse.ok) return redirect(request, '/?login=failed');
    const profile = await profileResponse.json() as GoogleProfile;
    if (!profile.sub || !profile.email) return redirect(request, '/?login=failed');
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO users (id, google_sub, email, name, picture_url, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture_url = excluded.picture_url, updated_at = excluded.updated_at, last_login_at = excluded.last_login_at').bind(crypto.randomUUID(), profile.sub, profile.email, profile.name ?? null, profile.picture ?? null, now, now, now).run();
    const user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(profile.sub).first();
    if (!user || typeof user.id !== 'string') return redirect(request, '/?login=failed');
    const session = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(session, user.id, expiresAt, now).run();
    return redirect(request, '/?login=success', { 'Set-Cookie': cookie('cc_session', session, SESSION_AGE_SECONDS) });
  }

  if (route === 'session' && request.method === 'GET') {
    const id = sessionId(request);
    if (!id) return Response.json({ user: null });
    const user = await env.DB.prepare('SELECT users.email, users.name, users.picture_url FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ?').bind(id, new Date().toISOString()).first();
    return Response.json({ user: user ?? null });
  }

  if (route === 'logout' && request.method === 'POST') {
    const id = sessionId(request);
    if (id) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie('cc_session', '', 0) } });
  }

  return new Response('Not found', { status: 404 });
};
