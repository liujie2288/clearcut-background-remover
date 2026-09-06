# Google OAuth + PayPal Sandbox Lab Playbook

This repository keeps authentication and payment experiments isolated from the privacy-first image tool. The lab is deployed as its own Cloudflare Pages project at `lab.clearcutai.shop`, with its own D1 database and secrets.

## End-to-end flow

```text
Browser -> Google OAuth -> lab session in D1
Browser -> create-order Function -> PayPal Sandbox Orders API
Browser -> PayPal buyer approval -> return Function
return Function -> capture + verify -> paypal_orders in D1
```

The browser never receives the PayPal Client Secret. The test price is fixed server-side at USD 1.00, so changing browser code cannot change the captured amount.

## Isolated resources

- Source root: `lab/`
- Pages project: `clearcut-lab`
- Custom domain: `lab.clearcutai.shop`
- D1 database and binding: `clearcut-lab` / `DB`
- Session cookie: `cc_lab_session`
- Runtime secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`

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

Before going live, create a separate Live app, rotate any credential shared outside the secret manager, add verified webhooks, define fulfillment and refund behavior, and test approve/cancel/error cases.

## Local checks

From `lab/`:

```text
npm test
npm run build
npx wrangler pages dev out
```

Local OAuth and PayPal callbacks need a matching public HTTPS callback, so end-to-end provider tests are normally performed on the deployed lab domain.
