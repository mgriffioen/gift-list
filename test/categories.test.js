const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { guessCategory, categoryOf } = require('../public/categories');

test('guesses a section from the title, description and link', () => {
  assert.equal(guessCategory({ title: 'Bicycle Rider Back Playing Cards' }), 'decks');
  assert.equal(guessCategory({ title: 'Monarchs', url: 'https://www.theory11.com/products/monarchs' }), 'decks');
  assert.equal(guessCategory({ title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones' }), 'tech');
  assert.equal(guessCategory({ title: 'Anker Power Bank, 10000mAh' }), 'tech');
  assert.equal(guessCategory({ title: 'Wingspan Board Game' }), 'games');
  assert.equal(guessCategory({ title: 'Exploding Kittens Card Game' }), 'games');
  assert.equal(guessCategory({ title: 'Dominion', description: 'A deck-building game for 2-4 players.' }), 'games');
  assert.equal(guessCategory({ title: 'Wool Throw Blanket' }), 'other');
  assert.equal(guessCategory({}), 'other');
});

test('a saved section wins over the guess', () => {
  assert.equal(categoryOf({ title: 'Wingspan Board Game', category: 'other' }), 'other');
  assert.equal(categoryOf({ title: 'Wingspan Board Game', category: 'nonsense' }), 'games');
});

test('store keeps sections and moves items within their section', () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gift-list-'));
  const store = require('../lib/store');
  const deck = store.createItem({ title: 'Bicycle Playing Cards' });
  const game = store.createItem({ title: 'Catan Board Game' });
  const deck2 = store.createItem({ title: 'Mystery item', category: 'decks' });
  assert.deepEqual([deck.category, game.category, deck2.category], ['decks', 'games', 'decks']);
  assert.throws(() => store.createItem({ title: 'x', category: 'toys' }), /Pick a section/);

  // List order is deck2, game, deck; moving deck2 down skips over the game.
  const moved = store.moveItem(deck2.id, 1).filter((i) => i.category === 'decks').map((i) => i.id);
  assert.deepEqual(moved, [deck.id, deck2.id]);

  assert.equal(store.updateItem(game.id, { category: 'other' }).category, 'other');
});
