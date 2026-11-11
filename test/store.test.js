const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gift-list-'));
const accounts = require('../lib/accounts');
const store = require('../lib/store');

test('accounts: usernames, passwords and logins', () => {
  assert.throws(() => accounts.createAccount('ab', 'password123'), /3–30/);
  assert.throws(() => accounts.createAccount('admin', 'password123'), /taken/);
  assert.throws(() => accounts.createAccount('has space', 'password123'), /3–30/);
  assert.throws(() => accounts.createAccount('sue', 'short'), /8 characters/);
  const sue = accounts.createAccount('Sue', 'password123');
  assert.equal(sue.username, 'sue');
  assert.throws(() => accounts.createAccount('SUE', 'password123'), /taken/);
  assert.ok(accounts.verifyLogin('SUE', 'password123'));
  assert.equal(accounts.verifyLogin('sue', 'wrong-password'), null);
  assert.equal(accounts.verifyLogin('nobody', 'password123'), null);
  assert.ok(!JSON.stringify(accounts.listAccounts()).includes('scrypt'));
});

test('sessions end when the password changes', () => {
  const sessions = require('../lib/sessions');
  const account = accounts.createAccount('tom', 'password123');
  const token = sessions.createToken(account);
  assert.equal(sessions.accountForToken(token).username, 'tom');
  assert.equal(sessions.accountForToken(token.replace('tom.', 'sue.')), null);
  assert.equal(sessions.accountForToken(token, Date.now() + sessions.MAX_AGE_MS + 1000), null);
  accounts.setPassword('tom', 'new-password-1');
  assert.equal(sessions.accountForToken(token), null);
});

test('each account has its own items and sections', () => {
  accounts.createAccount('ann', 'password123');
  accounts.createAccount('bob', 'password123');
  const [books] = store.setCategories('ann', [{ label: 'Books' }]);
  store.createItem('ann', { title: 'A novel', category: books.id });
  assert.equal(store.listItems('ann').length, 1);
  assert.equal(store.listItems('bob').length, 0);
  // Bob can't file a gift under Ann's section.
  assert.throws(() => store.createItem('bob', { title: 'x', category: books.id }), /no longer exists/);
});

test('sections can be renamed, reordered and deleted', () => {
  accounts.createAccount('cat', 'password123');
  const [a, b] = store.setCategories('cat', [{ label: 'Books' }, { label: 'Games' }]);
  const item = store.createItem('cat', { title: 'Catan', category: b.id });
  assert.throws(() => store.setCategories('cat', [{ label: 'Books' }, { label: 'books' }]), /two sections/);
  assert.throws(() => store.setCategories('cat', [{ label: '  ' }]), /needs a name/);

  const renamed = store.setCategories('cat', [{ id: b.id, label: 'Board games' }, { id: a.id, label: 'Books' }]);
  assert.deepEqual(renamed.map((c) => c.id), [b.id, a.id]);
  assert.equal(store.listItems('cat')[0].category, b.id);

  store.setCategories('cat', [{ id: a.id, label: 'Books' }]);
  assert.equal(store.listItems('cat').find((i) => i.id === item.id).category, '');
});

test('moving items stays within their section', () => {
  accounts.createAccount('dan', 'password123');
  const [decks, games] = store.setCategories('dan', [{ label: 'Decks' }, { label: 'Games' }]);
  const deck = store.createItem('dan', { title: 'Bicycle Playing Cards', category: decks.id });
  store.createItem('dan', { title: 'Catan Board Game', category: games.id });
  const deck2 = store.createItem('dan', { title: 'Mystery item', category: decks.id });
  // List order is deck2, game, deck; moving deck2 down skips over the game.
  const moved = store.moveItem('dan', deck2.id, 1).filter((i) => i.category === decks.id).map((i) => i.id);
  assert.deepEqual(moved, [deck.id, deck2.id]);
});

test('claims: one person per gift, undo needs the token', () => {
  accounts.createAccount('eve', 'password123');
  const item = store.createItem('eve', { title: 'Socks' });
  const token = store.claimItem('eve', item.id, '  Aunt   Sue ');
  assert.equal(store.getClaims('eve')[item.id].name, 'Aunt Sue');
  assert.throws(() => store.claimItem('eve', item.id, 'Bob'), (err) => err.status === 409);
  assert.equal(store.unclaimItem('eve', item.id, 'not-the-token'), false);
  assert.equal(store.unclaimItem('eve', item.id, token), true);
  assert.deepEqual(store.getClaims('eve'), {});

  store.claimItem('eve', item.id, '');
  store.clearClaims('eve');
  assert.deepEqual(store.getClaims('eve'), {});

  const hidden = store.createItem('eve', { title: 'Secret', hidden: true });
  assert.throws(() => store.claimItem('eve', hidden.id, ''), /no longer on the list/);

  store.claimItem('eve', item.id, '');
  store.deleteItem('eve', item.id);
  assert.deepEqual(store.getClaims('eve'), {});
});

test('uploads belong to their account', () => {
  accounts.createAccount('fay', 'password123');
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const image = store.saveUpload('fay', png);
  assert.match(image, /^\/uploads\/fay\/[\w-]+\.png$/);
  // Another account pointing at Fay's picture can't delete it.
  const item = store.createItem('ann', { title: 'Copycat', image });
  store.deleteItem('ann', item.id);
  const file = path.join(process.env.DATA_DIR, 'uploads', 'fay', path.basename(image));
  return new Promise((resolve) => setTimeout(resolve, 50)).then(() => assert.ok(fs.existsSync(file)));
});
