// Where data lives on disk, and safe JSON reads/writes. No database needed.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const USERS_DIR = path.join(DATA_DIR, 'users');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(USERS_DIR, { recursive: true });

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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { DATA_DIR, UPLOADS_DIR, USERS_DIR, readJson, writeJson };
