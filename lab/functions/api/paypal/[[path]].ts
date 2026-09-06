interface Env {
  DB: D1Database;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
}

type Context = { request: Request; env: Env; params: { path?: string | string[] } };
type PayPalOrder = {
  id?: string;
  status?: string;
  payer?: { payer_id?: string };
  links?: Array<{ href?: string; rel?: string }>;
  purchase_units?: Array<{
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }> };
  }>;
};

const API = 'https://api-m.sandbox.paypal.com';
const AMOUNT = '1.00';
const CURRENCY = 'USD';
const COOKIE_NAME = 'cc_lab_session';

function routePath(params: Context['params']) {
  return Array.isArray(params.path) ? params.path.join('/') : params.path ?? '';
}

function sessionId(request: Request) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}

async function currentUser(request: Request, db: D1Database) {
  const id = sessionId(request);
  if (!id) return null;
  return db.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ?').bind(id, new Date().toISOString()).first<{ id: string; email: string }>();
}

async function accessToken(env: Env) {
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  const body = await response.json<{ access_token?: string }>();
  if (!body.access_token) throw new Error('PayPal did not return an access token.');
  return body.access_token;
}

async function paypalRequest(env: Env, path: string, method: 'GET' | 'POST', body?: unknown, requestId?: string) {
  const headers = new Headers({ Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' });
  if (requestId) headers.set('PayPal-Request-Id', requestId);
  const response = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json<PayPalOrder & { details?: unknown }>().catch(() => ({}));
  if (!response.ok) throw new Error(`PayPal request failed (${response.status}).`);
  return result;
}

function validateCapture(order: PayPalOrder) {
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amount = capture?.amount ?? unit?.amount;
  if (order.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' || amount?.value !== AMOUNT || amount.currency_code !== CURRENCY || !capture.id) {
    throw new Error('PayPal returned an unexpected capture result.');
  }
  return { captureId: capture.id, payerId: order.payer?.payer_id ?? null };
}

function redirect(request: Request, payment: 'success' | 'cancelled' | 'failed') {
  const url = new URL('/', request.url);
  url.searchParams.set('payment', payment);
  return Response.redirect(url.toString(), 302);
}

export const onRequest = async ({ request, env, params }: Context) => {
  const route = routePath(params);
  const user = await currentUser(request, env.DB);
  if (!user) {
    if (route === 'return' || route === 'cancel') return redirect(request, 'failed');
    return Response.json({ error: 'Sign in before starting checkout.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  if (route === 'create-order' && request.method === 'POST') {
    try {
      const internalId = crypto.randomUUID();
      const origin = new URL(request.url).origin;
      const order = await paypalRequest(env, '/v2/checkout/orders', 'POST', {
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: internalId, description: 'Clearcut Lab sandbox checkout', amount: { currency_code: CURRENCY, value: AMOUNT } }],
        payment_source: { paypal: { experience_context: { user_action: 'PAY_NOW', return_url: `${origin}/api/paypal/return`, cancel_url: `${origin}/api/paypal/cancel` } } },
      }, internalId);
      const approveUrl = order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
      if (!order.id || !approveUrl) throw new Error('PayPal did not return an approval link.');
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO paypal_orders (id, paypal_order_id, user_id, status, amount, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(internalId, order.id, user.id, order.status ?? 'CREATED', AMOUNT, CURRENCY, now, now).run();
      return Response.json({ id: order.id, approveUrl }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error(JSON.stringify({ event: 'paypal_create_failed', message: error instanceof Error ? error.message : 'unknown' }));
      return Response.json({ error: 'Could not create a PayPal Sandbox order.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  if (route === 'return' && request.method === 'GET') {
    const paypalOrderId = new URL(request.url).searchParams.get('token');
    if (!paypalOrderId) return redirect(request, 'failed');
    const saved = await env.DB.prepare('SELECT id, status, amount, currency FROM paypal_orders WHERE paypal_order_id = ? AND user_id = ?').bind(paypalOrderId, user.id).first<{ id: string; status: string; amount: string; currency: string }>();
    if (!saved || saved.amount !== AMOUNT || saved.currency !== CURRENCY) return redirect(request, 'failed');
    if (saved.status === 'COMPLETED') return redirect(request, 'success');
    try {
      const captured = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, 'POST', {}, `${saved.id}-capture`);
      const verified = validateCapture(captured);
      await env.DB.prepare('UPDATE paypal_orders SET status = ?, payer_id = ?, capture_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind('COMPLETED', verified.payerId, verified.captureId, new Date().toISOString(), saved.id, user.id).run();
      return redirect(request, 'success');
    } catch (error) {
      console.error(JSON.stringify({ event: 'paypal_capture_failed', order_id: paypalOrderId, message: error instanceof Error ? error.message : 'unknown' }));
      return redirect(request, 'failed');
    }
  }

  if (route === 'cancel' && request.method === 'GET') return redirect(request, 'cancelled');
  return new Response('Not found', { status: 404 });
};
