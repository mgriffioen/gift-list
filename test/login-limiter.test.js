const test = require('node:test');
const assert = require('node:assert');
const limiter = require('../lib/login-limiter');

test('locks an IP out after too many failures, and only that IP', () => {
  const now = Date.now();
  for (let i = 1; i < limiter.MAX_FAILURES; i++) {
    assert.equal(limiter.recordFailure('1.1.1.1', now).lockedFor, 0);
  }
  assert.ok(limiter.recordFailure('1.1.1.1', now).lockedFor > 0);
  assert.ok(limiter.lockedFor('1.1.1.1', now + 60_000) > 0);
  assert.equal(limiter.lockedFor('2.2.2.2', now), 0);
  // The lockout expires after 15 minutes.
  assert.equal(limiter.lockedFor('1.1.1.1', now + 15 * 60_000), 0);
});

test('a successful login clears earlier failures', () => {
  limiter.recordFailure('3.3.3.3');
  limiter.recordFailure('3.3.3.3');
  limiter.recordSuccess('3.3.3.3');
  assert.equal(limiter.recordFailure('3.3.3.3').remaining, limiter.MAX_FAILURES - 1);
});

test('old failures outside the window are forgotten', () => {
  const start = Date.now();
  for (let i = 1; i < limiter.MAX_FAILURES; i++) limiter.recordFailure('4.4.4.4', start);
  const later = start + 16 * 60_000;
  assert.equal(limiter.recordFailure('4.4.4.4', later).remaining, limiter.MAX_FAILURES - 1);
});
