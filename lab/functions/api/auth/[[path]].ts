interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

type GoogleProfile = { sub: string; email: string; name?: string; picture?: string };
type Context = { request: Request; env: Env; params: { path?: string | string[] } };

const SESSION_SECONDS = 60 * 60 * 24 * 7;
const COOKIE_NAME = 'cc_lab_session';

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

function sessionCookie(value: string, maxAge: number) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function sessionId(request: Request) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}

export const onRequest = async ({ request, env, params }: Context) => {
  const route = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
  const url = new URL(request.url);

  if (route === 'google' && request.method === 'GET') {
    const state = randomToken();
    const now = new Date();
    await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now.toISOString()).run();
    await env.DB.prepare('INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)').bind(state, new Date(now.getTime() + 10 * 60 * 1000).toISOString()).run();
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

    const callback = new URL('/api/auth/google/callback', url).toString();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: 'authorization_code' }),
    });
    if (!tokenResponse.ok) return redirect(request, '/?login=failed');
    const token = await tokenResponse.json<{ access_token?: string }>();
    if (!token.access_token) return redirect(request, '/?login=failed');
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!profileResponse.ok) return redirect(request, '/?login=failed');
    const profile = await profileResponse.json<GoogleProfile>();
    if (!profile.sub || !profile.email) return redirect(request, '/?login=failed');

    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO users (id, google_sub, email, name, picture_url, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture_url = excluded.picture_url, updated_at = excluded.updated_at, last_login_at = excluded.last_login_at').bind(crypto.randomUUID(), profile.sub, profile.email, profile.name ?? null, profile.picture ?? null, now, now, now).run();
    const user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(profile.sub).first<{ id: string }>();
    if (!user) return redirect(request, '/?login=failed');
    const session = randomToken();
    await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(session, user.id, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(), now).run();
    return redirect(request, '/', { 'Set-Cookie': sessionCookie(session, SESSION_SECONDS) });
  }

  if (route === 'session' && request.method === 'GET') {
    const id = sessionId(request);
    if (!id) return Response.json({ user: null });
    const user = await env.DB.prepare('SELECT users.email, users.name, users.picture_url FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ?').bind(id, new Date().toISOString()).first();
    return Response.json({ user: user ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (route === 'logout' && request.method === 'POST') {
    const id = sessionId(request);
    if (id) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' } });
  }

  return new Response('Not found', { status: 404 });
};
