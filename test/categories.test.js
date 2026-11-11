const test = require('node:test');
const assert = require('node:assert');
const { guessCategory, categoryOf } = require('../public/categories');

const MARK = [
  { id: 'decks', label: 'Decks' },
  { id: 'tech', label: 'Tech' },
  { id: 'games', label: 'Games' },
  { id: 'other', label: 'Other' },
];

test('guesses among the original sections from the title, description and link', () => {
  const guess = (item) => guessCategory(item, MARK);
  assert.equal(guess({ title: 'Bicycle Rider Back Playing Cards' }), 'decks');
  assert.equal(guess({ title: 'Monarchs', url: 'https://www.theory11.com/products/monarchs' }), 'decks');
  assert.equal(guess({ title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones' }), 'tech');
  assert.equal(guess({ title: 'Anker Power Bank, 10000mAh' }), 'tech');
  assert.equal(guess({ title: 'Wingspan Board Game' }), 'games');
  assert.equal(guess({ title: 'Exploding Kittens Card Game' }), 'games');
  assert.equal(guess({ title: 'Dominion', description: 'A deck-building game for 2-4 players.' }), 'games');
  assert.equal(guess({ title: 'Wool Throw Blanket' }), '');
  assert.equal(guess({}), '');
});

test('guesses custom sections from their names', () => {
  const mine = [
    { id: 'b', label: 'Books' },
    { id: 'k', label: 'Kitchen stuff' },
    { id: 'p', label: 'Plants' },
    { id: 'w', label: 'Watercolor supplies' },
  ];
  assert.equal(guessCategory({ title: 'Project Hail Mary (Hardcover)' }, mine), 'b');
  assert.equal(guessCategory({ title: 'Lodge Cast Iron Skillet' }, mine), 'k');
  assert.equal(guessCategory({ title: 'Monstera plant in ceramic pot' }, mine), 'p');
  assert.equal(guessCategory({ title: 'Winsor & Newton watercolors, 24 half pans' }, mine), 'w');
  assert.equal(guessCategory({ title: 'Wool Throw Blanket' }, mine), '');
  assert.equal(guessCategory({ title: 'Anything' }, []), '');
});

test('an item keeps its section only while that section exists', () => {
  assert.equal(categoryOf({ category: 'games' }, MARK), 'games');
  assert.equal(categoryOf({ category: 'gone' }, MARK), '');
  assert.equal(categoryOf({}, MARK), '');
});
