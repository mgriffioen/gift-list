const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const accounts = require('./lib/accounts');
const sessions = require('./lib/sessions');
const store = require('./lib/store');
const { UPLOADS_DIR } = require('./lib/files');
const { migrateLegacyList } = require('./lib/migrate');
const { scrapeProduct, parseSubmittedPage } = require('./lib/scrape');
const loginLimiter = require('./lib/login-limiter');
const { createRateLimit } = require('./lib/rate-limit');

const PORT = process.env.PORT || 3000;
const SIGNUP_CODE = process.env.SIGNUP_CODE || '';
const COOKIE_NAME = 'giftlist_session';

migrateLegacyList();

const app = express();
app.disable('x-powered-by');
// Hosts like Railway and Render sit behind one proxy hop; trusting it makes
// req.ip the visitor's real address (used to limit login attempts).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.use(express.json({ limit: '12mb' })); // room for an uploaded image

const signupLimit = createRateLimit({ max: Number(process.env.SIGNUPS_PER_HOUR) || 5, windowMs: 60 * 60 * 1000 });
const claimLimit = createRateLimit({ max: 60, windowMs: 60 * 60 * 1000 });

// ---------- Helpers ----------

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

const currentAccount = (req) => sessions.accountForToken(readCookie(req, COOKIE_NAME));

function startSession(req, res, account) {
  res.cookie(COOKIE_NAME, sessions.createToken(account), {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: sessions.MAX_AGE_MS,
  });
}

function requireUser(req, res, next) {
  const account = currentAccount(req);
  if (!account) return res.status(401).json({ error: 'Please log in.' });
  req.username = account.username;
  next();
}

function requireSiteAdmin(req, res, next) {
  const account = currentAccount(req);
  if (!account) return res.status(401).json({ error: 'Please log in.' });
  if (!accounts.isSiteAdmin(account.username)) return res.status(403).json({ error: 'Only site admins can do that.' });
  req.username = account.username;
  next();
}

// Turns thrown errors into JSON responses (400 unless the error says otherwise).
const ok = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Something went wrong.' });
  }
};

function tooMany(res, waitMs, message) {
  const minutes = Math.ceil(waitMs / 60000);
  res.set('Retry-After', String(Math.ceil(waitMs / 1000)));
  res.status(429).json({ error: `${message} Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });
}

// ---------- Accounts & sessions ----------

app.get('/api/session', (req, res) => {
  const account = currentAccount(req);
  res.json({
    user: account ? { username: account.username, siteAdmin: accounts.isSiteAdmin(account.username) } : null,
    signupCodeRequired: Boolean(SIGNUP_CODE),
  });
});

app.post('/api/signup', ok((req, res) => {
  const { username, password, code } = req.body || {};
  if (SIGNUP_CODE && !safeEqual(String(code ?? '').trim(), SIGNUP_CODE)) {
    throw new Error('That sign-up code isn’t right. Ask whoever sent you here for the code.');
  }
  const waitMs = signupLimit(req.ip);
  if (waitMs) return tooMany(res, waitMs, 'Too many new accounts from your network.');
  const account = accounts.createAccount(username, password);
  startSession(req, res, account);
  res.status(201).json({ username: account.username });
}));

app.post('/api/login', (req, res) => {
  const waitMs = loginLimiter.lockedFor(req.ip);
  if (waitMs) return tooMany(res, waitMs, 'Too many wrong passwords.');
  const account = accounts.verifyLogin(req.body?.username, req.body?.password);
  if (!account) {
    const { remaining, lockedFor } = loginLimiter.recordFailure(req.ip);
    if (lockedFor) return tooMany(res, lockedFor, 'Too many wrong passwords.');
    const warning = remaining <= 2 ? ` ${remaining} ${remaining === 1 ? 'try' : 'tries'} left before a 15-minute lockout.` : '';
    return res.status(401).json({ error: `Wrong name or password.${warning}` });
  }
  loginLimiter.recordSuccess(req.ip);
  startSession(req, res, account);
  res.json({ username: account.username });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.put('/api/me/password', requireUser, ok((req, res) => {
  const { current, next } = req.body || {};
  if (!accounts.verifyLogin(req.username, current)) throw new Error('Your current password isn’t right.');
  const account = accounts.setPassword(req.username, next);
  startSession(req, res, account); // keep this browser signed in; others are signed out
  res.json({ ok: true });
}));

app.delete('/api/me', requireUser, ok((req, res) => {
  if (!accounts.verifyLogin(req.username, req.body?.password)) throw new Error('That password isn’t right.');
  accounts.deleteAccount(req.username);
  store.deleteUserData(req.username);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}));

// ---------- Shared list (anyone with the link) ----------

app.get('/api/lists/:username', (req, res) => {
  const username = accounts.normalizeUsername(req.params.username);
  if (!accounts.getAccount(username)) return res.status(404).json({ error: 'There’s no list here.' });
  // The owner sees their page without claims, so gifts stay a surprise.
  const viewerIsOwner = currentAccount(req)?.username === username;
  const claims = viewerIsOwner ? {} : store.getClaims(username);
  const items = store
    .listItems(username)
    .filter((item) => !item.hidden)
    .map((item) => ({
      ...item,
      claim: claims[item.id] ? { name: claims[item.id].name } : null,
    }));
  res.set('Cache-Control', 'no-store');
  res.json({
    username,
    viewerIsOwner,
    settings: store.getSettings(username),
    categories: store.getCategories(username),
    items,
  });
});

function listOwner(req) {
  const username = accounts.normalizeUsername(req.params.username);
  if (!accounts.getAccount(username)) {
    const err = new Error('There’s no list here.');
    err.status = 404;
    throw err;
  }
  if (currentAccount(req)?.username === username) {
    throw new Error('This is your own list, so you can’t mark gifts as taken. (That would spoil the surprise!)');
  }
  return username;
}

app.post('/api/lists/:username/items/:id/claim', ok((req, res) => {
  const username = listOwner(req);
  const waitMs = claimLimit(req.ip);
  if (waitMs) return tooMany(res, waitMs, 'That’s a lot of gifts!');
  const token = store.claimItem(username, req.params.id, req.body?.name);
  res.status(201).json({ token });
}));

app.delete('/api/lists/:username/items/:id/claim', ok((req, res) => {
  const username = listOwner(req);
  if (!store.unclaimItem(username, req.params.id, req.body?.token ?? '')) {
    const err = new Error('Only the person who said they’d get this gift can undo it, from the browser they used.');
    err.status = 403;
    throw err;
  }
  res.json({ ok: true });
}));

// ---------- Your own list (logged in) ----------

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

app.get('/api/me/list', requireUser, (req, res) => {
  res.json({
    username: req.username,
    settings: store.getSettings(req.username),
    categories: store.getCategories(req.username),
    items: store.listItems(req.username),
  });
});

app.post('/api/scrape', requireUser, ok(async (req, res) => {
  res.json(await scrapeProduct(req.body?.url));
}));

app.post('/api/parse', requireUser, ok((req, res) => {
  res.json(parseSubmittedPage(req.body?.url, req.body?.html));
}));

app.post('/api/me/items', requireUser, ok((req, res) => {
  res.status(201).json(store.createItem(req.username, validateItem(req.body || {})));
}));

app.put('/api/me/items/:id', requireUser, ok((req, res) => {
  const item = store.updateItem(req.username, req.params.id, validateItem(req.body || {}, { partial: true }));
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json(item);
}));

app.delete('/api/me/items/:id', requireUser, (req, res) => {
  if (!store.deleteItem(req.username, req.params.id)) return res.status(404).json({ error: 'Item not found.' });
  res.json({ ok: true });
});

app.post('/api/me/items/:id/move', requireUser, (req, res) => {
  res.json(store.moveItem(req.username, req.params.id, req.body?.direction === 'up' ? -1 : 1));
});

app.put('/api/me/categories', requireUser, ok((req, res) => {
  res.json(store.setCategories(req.username, req.body?.categories));
}));

app.post('/api/me/upload', requireUser, ok((req, res) => {
  res.json({ image: store.saveUpload(req.username, req.body?.dataUrl) });
}));

app.put('/api/me/settings', requireUser, ok((req, res) => {
  res.json(store.updateSettings(req.username, req.body || {}));
}));

app.post('/api/me/claims/clear', requireUser, (req, res) => {
  store.clearClaims(req.username);
  res.json({ ok: true });
});

// ---------- Site admin ----------

app.get('/api/site/accounts', requireSiteAdmin, (req, res) => {
  res.json(accounts.listAccounts().map((a) => ({ ...a, items: store.countItems(a.username) })));
});

app.post('/api/site/accounts/:username/reset-password', requireSiteAdmin, ok((req, res) => {
  const username = accounts.normalizeUsername(req.params.username);
  if (!accounts.getAccount(username)) return res.status(404).json({ error: 'No such account.' });
  const password = crypto.randomBytes(9).toString('base64url');
  accounts.setPassword(username, password);
  res.json({ password });
}));

app.delete('/api/site/accounts/:username', requireSiteAdmin, ok((req, res) => {
  const username = accounts.normalizeUsername(req.params.username);
  if (username === req.username) throw new Error('Delete your own account from the Account section instead.');
  if (!accounts.deleteAccount(username)) return res.status(404).json({ error: 'No such account.' });
  store.deleteUserData(username);
  res.json({ ok: true });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- Pages & static files ----------

const PUBLIC_DIR = path.join(__dirname, 'public');

// Fingerprint of the public files, added to each page's script and stylesheet
// links. A deploy that changes them changes the links, so browsers and CDNs
// can't pair a new page with old cached scripts. (Cloudflare tells browsers to
// cache scripts for hours by default, regardless of the server's headers.)
const ASSET_VERSION = (() => {
  const hash = crypto.createHash('sha256');
  for (const name of fs.readdirSync(PUBLIC_DIR).sort()) {
    const file = path.join(PUBLIC_DIR, name);
    if (fs.statSync(file).isFile()) hash.update(name).update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 12);
})();

function servePage(name, status = 200) {
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, name), 'utf8')
    .replace(/(src|href)="\/([\w-]+\.(?:js|css))"/g, `$1="/$2?v=${ASSET_VERSION}"`);
  return (req, res) => {
    res.set('Cache-Control', 'no-cache'); // always check for a newer page
    res.status(status).type('html').send(html);
  };
}

const homePage = servePage('home.html');
const adminPage = servePage('admin.html');
const listPage = servePage('list.html');
const missingListPage = servePage('list.html', 404);

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));
app.get(['/', '/index.html'], homePage);
app.get(['/admin', '/admin.html', '/login', '/signup'], adminPage);
app.use(express.static(PUBLIC_DIR, { index: false }));

// A shared list: gift.example.com/<username>
app.get('/:username', (req, res, next) => {
  const raw = req.params.username;
  const username = accounts.normalizeUsername(raw);
  if (!/^[a-z0-9-]+$/.test(username)) return next();
  if (raw !== username) return res.redirect(301, `/${username}`);
  return (accounts.getAccount(username) ? listPage : missingListPage)(req, res);
});

app.listen(PORT, () => {
  console.log(`Gift list running at http://localhost:${PORT}`);
});
