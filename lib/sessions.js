// Login sessions as signed cookies: "username.version.expires.signature".
// The version comes from the account, so changing a password (which bumps it)
// signs out every other session for that account.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./files');
const accounts = require('./accounts');

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// SESSION_SECRET if set; otherwise a random secret saved next to the data so
// sessions survive restarts.
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, 'session-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
const SECRET = loadSecret();

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function createToken(account, now = Date.now()) {
  const payload = `${account.username}.${account.sessionVersion || 1}.${now + MAX_AGE_MS}`;
  return `${payload}.${sign(payload)}`;
}

// The signed-in account for a token, or null.
function accountForToken(token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [username, version, expires, signature] = parts;
  const expected = Buffer.from(sign(`${username}.${version}.${expires}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (Number(expires) < now) return null;
  const account = accounts.getAccount(username);
  if (!account || String(account.sessionVersion || 1) !== version) return null;
  return account;
}

module.exports = { createToken, accountForToken, MAX_AGE_MS };
