interface Env {
  DB: D1Database;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_WEBHOOK_ID: string;
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
type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { currency_code?: string; value?: string };
    supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
  };
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

function requiredWebhookHeaders(request: Request) {
  const values = {
    auth_algo: request.headers.get('paypal-auth-algo'),
    cert_url: request.headers.get('paypal-cert-url'),
    transmission_id: request.headers.get('paypal-transmission-id'),
    transmission_sig: request.headers.get('paypal-transmission-sig'),
    transmission_time: request.headers.get('paypal-transmission-time'),
  };
  return Object.values(values).every(Boolean) ? values as Record<keyof typeof values, string> : null;
}

async function verifyWebhook(request: Request, env: Env, rawEvent: string) {
  const headers = requiredWebhookHeaders(request);
  if (!headers || !env.PAYPAL_WEBHOOK_ID) return false;
  const verificationBody = [
    '{"auth_algo":', JSON.stringify(headers.auth_algo),
    ',"cert_url":', JSON.stringify(headers.cert_url),
    ',"transmission_id":', JSON.stringify(headers.transmission_id),
    ',"transmission_sig":', JSON.stringify(headers.transmission_sig),
    ',"transmission_time":', JSON.stringify(headers.transmission_time),
    ',"webhook_id":', JSON.stringify(env.PAYPAL_WEBHOOK_ID),
    ',"webhook_event":', rawEvent, '}',
  ].join('');
  const response = await fetch(`${API}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
    body: verificationBody,
  });
  if (!response.ok) return false;
  const result = await response.json<{ verification_status?: string }>();
  return result.verification_status === 'SUCCESS';
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

async function captureAndRecord(env: Env, paypalOrderId: string) {
  const saved = await env.DB.prepare('SELECT id, status, amount, currency FROM paypal_orders WHERE paypal_order_id = ?').bind(paypalOrderId).first<{ id: string; status: string; amount: string; currency: string }>();
  if (!saved || saved.amount !== AMOUNT || saved.currency !== CURRENCY) throw new Error('Order does not match a local fixed-price order.');
  if (saved.status === 'COMPLETED') return;
  const captured = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, 'POST', {}, `${saved.id}-capture`);
  const verified = validateCapture(captured);
  await env.DB.prepare('UPDATE paypal_orders SET status = ?, payer_id = ?, capture_id = ?, updated_at = ? WHERE id = ?').bind('COMPLETED', verified.payerId, verified.captureId, new Date().toISOString(), saved.id).run();
}

async function applyWebhookEvent(env: Env, event: PayPalWebhookEvent) {
  const type = event.event_type;
  const resource = event.resource;
  if (!type || !resource) return;
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const captureId = resource.supplementary_data?.related_ids?.capture_id ?? resource.id;

  if (type === 'CHECKOUT.ORDER.APPROVED' && resource.id) {
    await captureAndRecord(env, resource.id);
    return;
  }

  if (type === 'PAYMENT.CAPTURE.COMPLETED' && orderId && resource.id) {
    const saved = await env.DB.prepare('SELECT id, amount, currency FROM paypal_orders WHERE paypal_order_id = ?').bind(orderId).first<{ id: string; amount: string; currency: string }>();
    if (!saved) return;
    if (resource.status !== 'COMPLETED' || resource.amount?.value !== saved.amount || resource.amount.currency_code !== saved.currency) {
      throw new Error('Completed capture did not match the local order.');
    }
    await env.DB.prepare('UPDATE paypal_orders SET status = ?, capture_id = ?, updated_at = ? WHERE id = ?').bind('COMPLETED', resource.id, new Date().toISOString(), saved.id).run();
    return;
  }

  const statusByType: Record<string, string> = {
    'PAYMENT.CAPTURE.PENDING': 'PENDING',
    'PAYMENT.CAPTURE.DECLINED': 'DECLINED',
    'PAYMENT.CAPTURE.DENIED': 'DENIED',
    'PAYMENT.CAPTURE.REFUNDED': 'REFUNDED',
    'PAYMENT.CAPTURE.REVERSED': 'REVERSED',
  };
  const status = statusByType[type];
  if (!status || !captureId) return;
  if (orderId) {
    await env.DB.prepare('UPDATE paypal_orders SET status = ?, capture_id = COALESCE(capture_id, ?), updated_at = ? WHERE paypal_order_id = ?').bind(status, resource.id ?? null, new Date().toISOString(), orderId).run();
  } else {
    await env.DB.prepare('UPDATE paypal_orders SET status = ?, updated_at = ? WHERE capture_id = ?').bind(status, new Date().toISOString(), captureId).run();
  }
}

async function handleWebhook(request: Request, env: Env) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 1024 * 1024) return new Response('Payload too large', { status: 413 });
  const rawEvent = await request.text();
  if (!rawEvent || rawEvent.length > 1024 * 1024) return new Response('Invalid payload', { status: 400 });
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawEvent) as PayPalWebhookEvent;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!event.id || !event.event_type) return new Response('Invalid event', { status: 400 });
  if (!await verifyWebhook(request, env, rawEvent)) {
    console.warn({ event: 'paypal_webhook_rejected', paypal_event_id: event.id });
    return new Response('Invalid signature', { status: 401 });
  }

  const previous = await env.DB.prepare('SELECT processing_status FROM paypal_webhook_events WHERE event_id = ?').bind(event.id).first<{ processing_status: string }>();
  if (previous?.processing_status === 'PROCESSED') return Response.json({ received: true, duplicate: true });
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO paypal_webhook_events (event_id, event_type, resource_id, processing_status, received_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET processing_status = excluded.processing_status, error_message = NULL').bind(event.id, event.event_type, event.resource?.id ?? null, 'PROCESSING', now).run();
  try {
    await applyWebhookEvent(env, event);
    await env.DB.prepare('UPDATE paypal_webhook_events SET processing_status = ?, processed_at = ? WHERE event_id = ?').bind('PROCESSED', new Date().toISOString(), event.id).run();
    console.log({ event: 'paypal_webhook_processed', paypal_event_id: event.id, paypal_event_type: event.event_type });
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown processing error';
    await env.DB.prepare('UPDATE paypal_webhook_events SET processing_status = ?, error_message = ? WHERE event_id = ?').bind('FAILED', message.slice(0, 500), event.id).run();
    console.error({ event: 'paypal_webhook_failed', paypal_event_id: event.id, paypal_event_type: event.event_type, message });
    return new Response('Processing failed', { status: 500 });
  }
}

function redirect(request: Request, payment: 'success' | 'cancelled' | 'failed') {
  const url = new URL('/', request.url);
  url.searchParams.set('payment', payment);
  return Response.redirect(url.toString(), 302);
}

export const onRequest = async ({ request, env, params }: Context) => {
  const route = routePath(params);
  if (route === 'webhook' && request.method === 'POST') return handleWebhook(request, env);
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
      await captureAndRecord(env, paypalOrderId);
      return redirect(request, 'success');
    } catch (error) {
      console.error(JSON.stringify({ event: 'paypal_capture_failed', order_id: paypalOrderId, message: error instanceof Error ? error.message : 'unknown' }));
      return redirect(request, 'failed');
    }
  }

  if (route === 'cancel' && request.method === 'GET') return redirect(request, 'cancelled');
  return new Response('Not found', { status: 404 });
};
