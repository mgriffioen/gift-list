const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gift-list-'));
process.env.DATA_DIR = dir;
fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
fs.writeFileSync(path.join(dir, 'uploads', 'pic.png'), 'png');
fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify([
  { id: '1', title: 'Wingspan Board Game', position: 0, image: '/uploads/pic.png' },
  { id: '2', title: 'Wool Blanket', position: 1, category: 'tech' },
  { id: '3', title: 'Throw pillow', position: 2 },
]));
fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ title: "Mark's list", intro: 'Hi' }));

const { migrateLegacyList } = require('../lib/migrate');
const accounts = require('../lib/accounts');
const store = require('../lib/store');

test('moves the single-owner list into an account', () => {
  const quiet = { log() {}, warn() {} };
  assert.equal(migrateLegacyList({ username: '', password: 'old-admin-pw', log: quiet }), null);

  const account = migrateLegacyList({ username: 'mark', password: 'old-admin-pw', log: quiet });
  assert.equal(account.username, 'mark');
  assert.ok(accounts.verifyLogin('mark', 'old-admin-pw'));

  const items = store.listItems('mark');
  assert.deepEqual(items.map((i) => i.category), ['games', 'tech', 'other']);
  assert.equal(items[0].image, '/uploads/mark/pic.png');
  assert.ok(fs.existsSync(path.join(dir, 'uploads', 'mark', 'pic.png')));
  assert.equal(store.getSettings('mark').title, "Mark's list");
  assert.deepEqual(store.getCategories('mark').map((c) => c.label), ['Decks', 'Tech', 'Games', 'Other']);

  // Old files are kept as backups, and running again does nothing.
  assert.ok(fs.existsSync(path.join(dir, 'items.json.migrated')));
  assert.equal(migrateLegacyList({ username: 'mark', password: 'x', log: quiet }), null);
});
