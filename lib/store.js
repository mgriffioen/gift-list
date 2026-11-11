// Each account's list, stored as JSON files under data/users/<username>/:
//   items.json       the gifts
//   categories.json  the list's own sections, in display order
//   settings.json    page title and intro
//   claims.json      which gifts a visitor has said they'll get (never shown to the owner)
// Uploaded images live in data/uploads/<username>/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_DIR, USERS_DIR, readJson, writeJson } = require('./files');
const { categoryOf } = require('../public/categories');

const fileFor = (username, name) => path.join(USERS_DIR, username, name);
const uploadsFor = (username) => path.join(UPLOADS_DIR, username);

const DEFAULT_INTRO = 'A few ideas, in case you were wondering. Thank you!';
const DEFAULT_BUTTON_TEXT = 'View this item';
const MAX_CATEGORIES = 30;
const MAX_ITEMS = 500;

const capitalize = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const shortId = () => crypto.randomBytes(5).toString('hex');

// ---------- Sections ----------

function getCategories(username) {
  return readJson(fileFor(username, 'categories.json'), []);
}

// Replace the list's sections with `input` ([{ id?, label }], in order).
// Sections keep their id when renamed; gifts in a removed section lose their section.
function setCategories(username, input) {
  if (!Array.isArray(input)) throw new Error('Sections must be a list.');
  if (input.length > MAX_CATEGORIES) throw new Error(`A list can have up to ${MAX_CATEGORIES} sections.`);
  const existing = new Set(getCategories(username).map((c) => c.id));
  const seen = new Set();
  const categories = input.map((entry) => {
    const label = String(entry?.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) throw new Error('Every section needs a name.');
    if (label.length > 40) throw new Error('Section names can be up to 40 characters.');
    const key = label.toLowerCase();
    if (seen.has(key)) throw new Error(`There are two sections called “${label}”.`);
    seen.add(key);
    return { id: existing.has(entry.id) ? entry.id : shortId(), label };
  });
  writeJson(fileFor(username, 'categories.json'), categories);

  const items = readItems(username);
  const ids = new Set(categories.map((c) => c.id));
  if (items.some((item) => item.category && !ids.has(item.category))) {
    items.forEach((item) => { if (!ids.has(item.category)) item.category = ''; });
    writeJson(fileFor(username, 'items.json'), items);
  }
  return categories;
}

// ---------- Items ----------

const ITEM_FIELDS = ['url', 'title', 'description', 'price', 'image', 'buttonText'];
const FIELD_LIMITS = { url: 2000, title: 300, description: 3000, price: 50, image: 2000, buttonText: 60 };

function clean(username, input) {
  const out = {};
  for (const key of ITEM_FIELDS) {
    if (input[key] !== undefined) out[key] = String(input[key] ?? '').trim().slice(0, FIELD_LIMITS[key]);
  }
  // A blank button label means "use the default".
  if (out.buttonText === '') out.buttonText = DEFAULT_BUTTON_TEXT;
  // Hidden items stay in the admin list but are left off the shared page.
  if (input.hidden !== undefined) out.hidden = input.hidden === true;
  if (input.category !== undefined) {
    const category = String(input.category ?? '');
    if (category && !getCategories(username).some((c) => c.id === category)) {
      throw new Error('That section no longer exists. Pick another one.');
    }
    out.category = category;
  }
  return out;
}

const readItems = (username) => readJson(fileFor(username, 'items.json'), []);

function listItems(username) {
  const categories = getCategories(username);
  return readItems(username)
    .map((item) => ({ ...item, category: categoryOf(item, categories) }))
    .sort((a, b) => a.position - b.position);
}

function createItem(username, input) {
  const items = listItems(username);
  if (items.length >= MAX_ITEMS) throw new Error(`A list can have up to ${MAX_ITEMS} gifts.`);
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    url: '',
    title: '',
    description: '',
    price: '',
    image: '',
    buttonText: DEFAULT_BUTTON_TEXT,
    hidden: false,
    category: '',
    ...clean(username, input),
    // New items go to the top of the list.
    position: items.length ? items[0].position - 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  items.unshift(item);
  writeJson(fileFor(username, 'items.json'), items);
  return item;
}

function updateItem(username, id, input) {
  const items = listItems(username);
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  const previousImage = items[idx].image;
  items[idx] = { ...items[idx], ...clean(username, input), updatedAt: new Date().toISOString() };
  writeJson(fileFor(username, 'items.json'), items);
  if (previousImage !== items[idx].image) removeUpload(username, previousImage);
  return items[idx];
}

function deleteItem(username, id) {
  const items = listItems(username);
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  writeJson(fileFor(username, 'items.json'), items.filter((i) => i.id !== id));
  removeUpload(username, item.image);
  const claims = getClaims(username);
  if (claims[id]) {
    delete claims[id];
    writeJson(fileFor(username, 'claims.json'), claims);
  }
  return true;
}

// Move an item one step up (-1) or down (+1) within its section.
function moveItem(username, id, direction) {
  const items = listItems(username);
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return items;
  let target = idx + direction;
  while (target >= 0 && target < items.length && items[target].category !== items[idx].category) target += direction;
  if (target < 0 || target >= items.length) return items;
  [items[idx], items[target]] = [items[target], items[idx]];
  items.forEach((item, i) => { item.position = i; });
  writeJson(fileFor(username, 'items.json'), items);
  return items;
}

// ---------- Page settings ----------

function getSettings(username) {
  return {
    title: `${capitalize(username)}'s Gift List`,
    intro: DEFAULT_INTRO,
    ...readJson(fileFor(username, 'settings.json'), {}),
  };
}

function updateSettings(username, input) {
  const settings = getSettings(username);
  if (input.title !== undefined) settings.title = String(input.title).trim().slice(0, 120);
  if (input.intro !== undefined) settings.intro = String(input.intro).trim().slice(0, 2000);
  writeJson(fileFor(username, 'settings.json'), settings);
  return settings;
}

// ---------- Claims ----------
// A visitor can say "I'll get this" so nobody else buys the same gift. Other
// visitors see it's taken; the list's owner never does, so gifts stay a surprise.
// The visitor gets a secret token (kept in their browser) to undo their claim.

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const getClaims = (username) => readJson(fileFor(username, 'claims.json'), {});

function claimItem(username, itemId, name) {
  const item = listItems(username).find((i) => i.id === itemId && !i.hidden);
  if (!item) throw new Error('That gift is no longer on the list.');
  const claims = getClaims(username);
  if (claims[itemId]) {
    const err = new Error('Someone else just said they’d get this one.');
    err.status = 409;
    throw err;
  }
  const token = crypto.randomBytes(24).toString('base64url');
  claims[itemId] = {
    name: String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
    tokenHash: hashToken(token),
    claimedAt: new Date().toISOString(),
  };
  writeJson(fileFor(username, 'claims.json'), claims);
  return token;
}

// Undo a claim; only the token handed out when claiming works.
function unclaimItem(username, itemId, token) {
  const claims = getClaims(username);
  const claim = claims[itemId];
  if (!claim) return true;
  const given = Buffer.from(hashToken(token));
  const expected = Buffer.from(claim.tokenHash);
  if (!crypto.timingSafeEqual(given, expected)) return false;
  delete claims[itemId];
  writeJson(fileFor(username, 'claims.json'), claims);
  return true;
}

// The owner can wipe every claim (say, after the holidays) without seeing them.
function clearClaims(username) {
  writeJson(fileFor(username, 'claims.json'), {});
}

// ---------- Images ----------

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

// Save an uploaded image (sent as a data: URL) and return its public path.
function saveUpload(username, dataUrl) {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!match || !IMAGE_TYPES[match[1].toLowerCase()]) {
    throw new Error('Unsupported image. Use a JPG, PNG, GIF, WebP or AVIF file.');
  }
  const name = `${crypto.randomUUID()}.${IMAGE_TYPES[match[1].toLowerCase()]}`;
  fs.mkdirSync(uploadsFor(username), { recursive: true });
  fs.writeFileSync(path.join(uploadsFor(username), name), Buffer.from(match[2], 'base64'));
  return `/uploads/${username}/${name}`;
}

// Only ever removes an image from this account's own upload folder.
function removeUpload(username, image) {
  const prefix = `/uploads/${username}/`;
  if (!image || !image.startsWith(prefix)) return;
  fs.rm(path.join(uploadsFor(username), path.basename(image)), { force: true }, () => {});
}

// ---------- Accounts ----------

function deleteUserData(username) {
  fs.rmSync(path.join(USERS_DIR, username), { recursive: true, force: true });
  fs.rmSync(uploadsFor(username), { recursive: true, force: true });
}

const countItems = (username) => readItems(username).length;

module.exports = {
  DEFAULT_BUTTON_TEXT,
  getCategories,
  setCategories,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  moveItem,
  getSettings,
  updateSettings,
  getClaims,
  claimItem,
  unclaimItem,
  clearClaims,
  saveUpload,
  removeUpload,
  deleteUserData,
  countItems,
};
