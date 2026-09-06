const account = document.querySelector('#account');
const checkout = document.querySelector('#checkout');
const notice = document.querySelector('#notice');

function showNotice(message, kind = 'info') {
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  notice.hidden = false;
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return body;
}

async function loadSession() {
  const { user } = await readJson(await fetch('/api/auth/session', { credentials: 'same-origin' }));
  if (!user) return;

  const avatar = user.picture_url
    ? `<img src="${escapeAttribute(user.picture_url)}" alt="" referrerpolicy="no-referrer" />`
    : '<span class="avatar">✓</span>';
  account.innerHTML = `<div class="profile">${avatar}<div><strong>${escapeHtml(user.name || 'Signed in')}</strong><span>${escapeHtml(user.email)}</span></div></div><button id="logout" class="text-button">Sign out</button>`;
  document.querySelector('#logout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/';
  });
  checkout.disabled = false;
  checkout.textContent = 'Pay $1.00 with PayPal Sandbox';
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function escapeAttribute(value) {
  return String(value).replace(/[&"'<>]/g, (character) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[character]);
}

checkout.addEventListener('click', async () => {
  checkout.disabled = true;
  checkout.textContent = 'Creating secure checkout…';
  try {
    const order = await readJson(await fetch('/api/paypal/create-order', { method: 'POST', credentials: 'same-origin' }));
    window.location.assign(order.approveUrl);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Could not create the order.', 'error');
    checkout.disabled = false;
    checkout.textContent = 'Pay $1.00 with PayPal Sandbox';
  }
});

const status = new URLSearchParams(window.location.search).get('payment');
if (status === 'success') showNotice('Sandbox payment captured and recorded in D1.', 'success');
if (status === 'cancelled') showNotice('Sandbox payment cancelled. Nothing was charged.', 'info');
if (status === 'failed') showNotice('PayPal could not capture this sandbox payment.', 'error');
if (new URLSearchParams(window.location.search).get('login') === 'failed') showNotice('Google sign-in failed. Check the lab callback URI.', 'error');

loadSession().catch(() => showNotice('Could not read the current session.', 'error'));
