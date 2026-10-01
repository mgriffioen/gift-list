// Tiny JSON-file data store. Fine for a personal gift list; no database needed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const DEFAULT_SETTINGS = {
  title: 'My Gift List',
  intro: 'A few ideas, in case you were wondering. Thank you!',
};

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

// Write to a temp file then rename so a crash never leaves a half-written file.
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const ITEM_FIELDS = ['url', 'title', 'description', 'price', 'image', 'buttonText'];
const DEFAULT_BUTTON_TEXT = 'View this item';

function clean(input) {
  const out = {};
  for (const key of ITEM_FIELDS) {
    if (input[key] !== undefined) out[key] = String(input[key] ?? '').trim();
  }
  // A blank button label means "use the default".
  if (out.buttonText === '') out.buttonText = DEFAULT_BUTTON_TEXT;
  return out;
}

function listItems() {
  return readJson(ITEMS_FILE, []).sort((a, b) => a.position - b.position);
}

function getItem(id) {
  return listItems().find((item) => item.id === id);
}

function createItem(input) {
  const items = listItems();
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    url: '',
    title: '',
    description: '',
    price: '',
    image: '',
    buttonText: DEFAULT_BUTTON_TEXT,
    ...clean(input),
    // New items go to the top of the list.
    position: items.length ? items[0].position - 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  items.unshift(item);
  writeJson(ITEMS_FILE, items);
  return item;
}

function updateItem(id, input) {
  const items = listItems();
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  const previousImage = items[idx].image;
  items[idx] = { ...items[idx], ...clean(input), updatedAt: new Date().toISOString() };
  writeJson(ITEMS_FILE, items);
  if (previousImage !== items[idx].image) removeUpload(previousImage);
  return items[idx];
}

function deleteItem(id) {
  const items = listItems();
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  writeJson(ITEMS_FILE, items.filter((i) => i.id !== id));
  removeUpload(item.image);
  return true;
}

// Move an item one step up (-1) or down (+1) in the list.
function moveItem(id, direction) {
  const items = listItems();
  const idx = items.findIndex((item) => item.id === id);
  const target = idx + direction;
  if (idx === -1 || target < 0 || target >= items.length) return listItems();
  [items[idx], items[target]] = [items[target], items[idx]];
  items.forEach((item, i) => { item.position = i; });
  writeJson(ITEMS_FILE, items);
  return items;
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
}

function updateSettings(input) {
  const settings = getSettings();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (input[key] !== undefined) settings[key] = String(input[key]).trim();
  }
  writeJson(SETTINGS_FILE, settings);
  return settings;
}

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

// Save an uploaded image (sent as a data: URL) and return its public path.
function saveUpload(dataUrl) {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!match || !IMAGE_TYPES[match[1].toLowerCase()]) {
    throw new Error('Unsupported image. Use a JPG, PNG, GIF, WebP or AVIF file.');
  }
  const name = `${crypto.randomUUID()}.${IMAGE_TYPES[match[1].toLowerCase()]}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(match[2], 'base64'));
  return `/uploads/${name}`;
}

function removeUpload(image) {
  if (!image || !image.startsWith('/uploads/')) return;
  fs.rm(path.join(UPLOADS_DIR, path.basename(image)), { force: true }, () => {});
}

module.exports = {
  UPLOADS_DIR,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  moveItem,
  getSettings,
  updateSettings,
  saveUpload,
  removeUpload,
};
