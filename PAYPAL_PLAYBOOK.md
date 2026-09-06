# Google OAuth + PayPal Sandbox Lab Playbook

This repository keeps authentication and payment experiments isolated from the privacy-first image tool. The lab is deployed as its own Cloudflare Pages project at `lab.clearcutai.shop`, with its own D1 database and secrets.

## End-to-end flow

```text
Browser -> Google OAuth -> lab session in D1
Browser -> create-order Function -> PayPal Sandbox Orders API
Browser -> PayPal buyer approval -> return Function
return Function -> capture + verify -> paypal_orders in D1
PayPal -> signed webhook -> verify + deduplicate -> synchronize D1
```

The browser never receives the PayPal Client Secret. The test price is fixed server-side at USD 1.00, so changing browser code cannot change the captured amount.

## Isolated resources

- Source root: `lab/`
- Pages project: `clearcut-lab`
- Custom domain: `lab.clearcutai.shop`
- D1 database and binding: `clearcut-lab` / `DB`
- Session cookie: `cc_lab_session`
- Runtime secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`

## OAuth setup

Add this authorized redirect URI to the Google Web OAuth client used by the lab:

```text
https://lab.clearcutai.shop/api/auth/google/callback
```

For stronger production isolation, create a separate Google OAuth client instead of sharing the main site's client.

## PayPal setup

Use Sandbox app credentials and a Sandbox personal buyer account. The server calls:

- `POST /v1/oauth2/token` for a short-lived server access token.
- `POST /v2/checkout/orders` to create the fixed-price order.
- `POST /v2/checkout/orders/{id}/capture` after buyer approval.

## Webhooks

The Sandbox app sends events to:

```text
https://lab.clearcutai.shop/api/paypal/webhook
```

The listener is registered on the PayPal Sandbox app. Store the returned webhook ID as the encrypted Cloudflare variable `PAYPAL_WEBHOOK_ID`; do not hardcode it in the Function.

Subscribed events:

- `CHECKOUT.ORDER.APPROVED`: captures an approved order even if the buyer never returns to the site.
- `PAYMENT.CAPTURE.COMPLETED`: verifies amount/currency and confirms the local order.
- `PAYMENT.CAPTURE.PENDING`: records a payment that is not final yet.
- `PAYMENT.CAPTURE.DECLINED` and `PAYMENT.CAPTURE.DENIED`: records a failed capture.
- `PAYMENT.CAPTURE.REFUNDED`: records a refund.
- `PAYMENT.CAPTURE.REVERSED`: records a reversal.

Every webhook is verified by PayPal's `verify-webhook-signature` endpoint before it can change an order. Event IDs are stored in `paypal_webhook_events`; a successfully processed ID is acknowledged without running the business logic again. Failed processing returns HTTP 500 so PayPal can retry.

The browser return and `CHECKOUT.ORDER.APPROVED` webhook use the same `PayPal-Request-Id` for capture. This makes capture idempotent when both paths run.

Before going live, create a separate Live app, rotate any credential shared outside the secret manager, create a separate Live webhook, define fulfillment and refund behavior, and test approve/cancel/error cases.

## Local checks

From `lab/`:

```text
npm test
npm run build
npx wrangler pages dev out
```

Local OAuth and PayPal callbacks need a matching public HTTPS callback, so end-to-end provider tests are normally performed on the deployed lab domain.
