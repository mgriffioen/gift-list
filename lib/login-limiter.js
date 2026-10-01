// Limits failed admin logins per IP address so the password can't be brute-forced.
// State is kept in memory, which is fine for a single small server; a restart resets it.

const MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES) || 5;
const WINDOW_MS = 15 * 60 * 1000; // failures are counted over this window...
const LOCKOUT_MS = 15 * 60 * 1000; // ...and reaching the limit locks the IP out this long

const attempts = new Map(); // ip -> { failures, firstFailureAt, lockedUntil }

function entryFor(ip, now) {
  const entry = attempts.get(ip);
  if (!entry) return null;
  const expired = entry.lockedUntil
    ? now >= entry.lockedUntil
    : now - entry.firstFailureAt > WINDOW_MS;
  if (expired) {
    attempts.delete(ip);
    return null;
  }
  return entry;
}

// Milliseconds until this IP may try again, or 0 if it isn't locked out.
function lockedFor(ip, now = Date.now()) {
  const entry = entryFor(ip, now);
  return entry && entry.lockedUntil ? entry.lockedUntil - now : 0;
}

function recordFailure(ip, now = Date.now()) {
  const entry = entryFor(ip, now) || { failures: 0, firstFailureAt: now, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) entry.lockedUntil = now + LOCKOUT_MS;
  attempts.set(ip, entry);
  return { remaining: Math.max(0, MAX_FAILURES - entry.failures), lockedFor: lockedFor(ip, now) };
}

function recordSuccess(ip) {
  attempts.delete(ip);
}

// Drop stale entries now and then so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const ip of attempts.keys()) entryFor(ip, now);
}, WINDOW_MS).unref();

module.exports = { lockedFor, recordFailure, recordSuccess, MAX_FAILURES };
