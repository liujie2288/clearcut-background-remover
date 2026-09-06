import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('lab is noindex and checkout starts disabled', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /id="checkout"[^>]*disabled/);
});

test('browser code never contains a PayPal secret', async () => {
  const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /PAYPAL_CLIENT_SECRET|client_secret/i);
});
