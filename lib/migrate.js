// Moves a list from before accounts existed (data/items.json, data/settings.json,
// data/uploads/*) into an account, so an existing site keeps its gifts.
//
// It runs at startup when those old files exist. The account is named after the
// first SITE_ADMIN username, and its password is the old ADMIN_PASSWORD, so the
// owner logs in with the password they already use. The old files are renamed
// with a ".migrated" suffix rather than deleted.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, UPLOADS_DIR, USERS_DIR, readJson, writeJson } = require('./files');
const accounts = require('./accounts');
const { guessCategory } = require('../public/categories');

// The fixed sections the single-list version had.
const LEGACY_CATEGORIES = [
  { id: 'decks', label: 'Decks' },
  { id: 'tech', label: 'Tech' },
  { id: 'games', label: 'Games' },
  { id: 'other', label: 'Other' },
];

function migrateLegacyList({ username = accounts.siteAdmins()[0], password = process.env.ADMIN_PASSWORD, log = console } = {}) {
  const itemsFile = path.join(DATA_DIR, 'items.json');
  const settingsFile = path.join(DATA_DIR, 'settings.json');
  if (!fs.existsSync(itemsFile) && !fs.existsSync(settingsFile)) return null;

  if (!username || !password) {
    log.warn('⚠️  Found a gift list from before accounts existed. Set SITE_ADMIN (your username) and ADMIN_PASSWORD, then restart, to move it into your account.');
    return null;
  }
  if (accounts.getAccount(username)) {
    log.warn(`⚠️  Found a gift list from before accounts existed, but the account "${username}" already exists, so it was left alone.`);
    return null;
  }

  const account = accounts.createAccount(username, password);
  const ids = LEGACY_CATEGORIES.map((c) => c.id);
  const userUploads = path.join(UPLOADS_DIR, account.username);
  fs.mkdirSync(userUploads, { recursive: true });

  const items = readJson(itemsFile, []).map((item) => {
    const category = ids.includes(item.category) ? item.category : guessCategory(item, LEGACY_CATEGORIES) || 'other';
    let image = item.image || '';
    // Uploaded pictures move into the account's own folder.
    const match = /^\/uploads\/([^/]+)$/.exec(image);
    if (match) {
      const from = path.join(UPLOADS_DIR, match[1]);
      if (fs.existsSync(from)) fs.renameSync(from, path.join(userUploads, match[1]));
      image = `/uploads/${account.username}/${match[1]}`;
    }
    return { ...item, category, image };
  });

  const dir = path.join(USERS_DIR, account.username);
  writeJson(path.join(dir, 'items.json'), items);
  writeJson(path.join(dir, 'categories.json'), LEGACY_CATEGORIES);
  const settings = readJson(settingsFile, null);
  if (settings) writeJson(path.join(dir, 'settings.json'), settings);

  for (const file of [itemsFile, settingsFile]) {
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.migrated`);
  }
  log.log(`Moved the existing gift list (${items.length} gifts) into the account "${account.username}". Log in with your old admin password.`);
  return account;
}

module.exports = { migrateLegacyList, LEGACY_CATEGORIES };
