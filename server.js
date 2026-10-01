const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./lib/store');
const { scrapeProduct } = require('./lib/scrape');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE_NAME = 'giftlist_admin';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

if (!ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD is not set — the admin page will refuse all logins.');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' })); // room for an uploaded image

// ---------- Admin auth (one shared password, signed cookie) ----------

// The session token is an HMAC of the password, so changing ADMIN_PASSWORD
// logs out every existing session.
const sessionToken = () =>
  crypto.createHmac('sha256', ADMIN_PASSWORD).update('gift-list-admin-session').digest('hex');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

const isAdmin = (req) => Boolean(ADMIN_PASSWORD) && safeEqual(readCookie(req, COOKIE_NAME), sessionToken());

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Please log in.' });
}

app.post('/api/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Set the ADMIN_PASSWORD environment variable and restart the server.' });
  }
  if (!safeEqual(req.body?.password ?? '', ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  res.cookie(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: COOKIE_MAX_AGE_MS,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => res.json({ admin: isAdmin(req) }));

// ---------- Public API ----------

app.get('/api/items', (req, res) => {
  res.json({ settings: store.getSettings(), items: store.listItems() });
});

// ---------- Admin API ----------

const ok = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Something went wrong.' });
  }
};

function validateItem(body, { partial = false } = {}) {
  if (!partial || body.title !== undefined) {
    if (!String(body.title ?? '').trim()) throw new Error('A title is required.');
  }
  if (body.url) {
    const u = new URL(String(body.url).trim()); // throws on garbage
    if (!/^https?:$/.test(u.protocol)) throw new Error('The link must start with http:// or https://');
  }
  return body;
}

app.post('/api/scrape', requireAdmin, ok(async (req, res) => {
  res.json(await scrapeProduct(req.body?.url));
}));

app.post('/api/items', requireAdmin, ok((req, res) => {
  res.status(201).json(store.createItem(validateItem(req.body || {})));
}));

app.put('/api/items/:id', requireAdmin, ok((req, res) => {
  const item = store.updateItem(req.params.id, validateItem(req.body || {}, { partial: true }));
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json(item);
}));

app.delete('/api/items/:id', requireAdmin, (req, res) => {
  if (!store.deleteItem(req.params.id)) return res.status(404).json({ error: 'Item not found.' });
  res.json({ ok: true });
});

app.post('/api/items/:id/move', requireAdmin, (req, res) => {
  res.json(store.moveItem(req.params.id, req.body?.direction === 'up' ? -1 : 1));
});

app.post('/api/upload', requireAdmin, ok((req, res) => {
  res.json({ image: store.saveUpload(req.body?.dataUrl) });
}));

app.put('/api/settings', requireAdmin, ok((req, res) => {
  res.json(store.updateSettings(req.body || {}));
}));

// ---------- Pages & static files ----------

app.use('/uploads', express.static(store.UPLOADS_DIR, { maxAge: '30d', immutable: true }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Gift list running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin)`);
});
