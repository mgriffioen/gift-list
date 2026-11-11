const test = require('node:test');
const assert = require('node:assert');
const { formatUsd } = require('../public/price');

test('formats plain amounts as US dollars', () => {
  assert.equal(formatUsd('10'), '$10.00');
  assert.equal(formatUsd(' 10.5 '), '$10.50');
  assert.equal(formatUsd('$10'), '$10.00');
  assert.equal(formatUsd('$ 24.999'), '$25.00');
  assert.equal(formatUsd('1234'), '$1,234.00');
  assert.equal(formatUsd('1,234.5'), '$1,234.50');
  assert.equal(formatUsd('.99'), '$0.99');
  assert.equal(formatUsd('10.'), '$10.00');
  assert.equal(formatUsd('$24.99'), '$24.99');
});

test('leaves anything else as typed', () => {
  assert.equal(formatUsd(''), '');
  assert.equal(formatUsd('€20'), '€20');
  assert.equal(formatUsd('$10–$20'), '$10–$20');
  assert.equal(formatUsd('around 15'), 'around 15');
  assert.equal(formatUsd('1,23'), '1,23');
});
