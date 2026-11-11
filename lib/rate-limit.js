// A simple in-memory "at most N per window" counter, keyed by IP address.
// Used to slow down mass sign-ups and claim spam. A restart resets it.
function createRateLimit({ max, windowMs }) {
  const hits = new Map(); // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now >= entry.resetAt) hits.delete(key);
  }, windowMs).unref();

  // Counts one attempt. Returns 0 if allowed, otherwise ms until it's allowed again.
  return function hit(key, now = Date.now()) {
    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    if (entry.count >= max) return entry.resetAt - now;
    entry.count += 1;
    return 0;
  };
}

module.exports = { createRateLimit };
