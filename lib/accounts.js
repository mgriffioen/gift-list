// Accounts: a username (which is also the list's address, e.g. /mark) and a
// scrypt-hashed password. Stored in data/accounts.json.
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, readJson, writeJson } = require('./files');

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const MIN_PASSWORD = 8;

// Names that are pages or files on the site, or that would confuse visitors.
const RESERVED = new Set([
  'about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'contact', 'dashboard', 'edit',
  'gift', 'gifts', 'help', 'home', 'index', 'list', 'lists', 'login', 'logout', 'me', 'new', 'privacy',
  'public', 'register', 'root', 'settings', 'signin', 'signup', 'site', 'site-admin', 'static', 'support',
  'terms', 'uploads', 'user', 'users', 'www',
]);
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

const normalizeUsername = (value) => String(value ?? '').trim().toLowerCase();

// Throws a readable error if the name can't be used as a list address.
function checkUsername(username) {
  if (!USERNAME_RE.test(username) || username.includes('--')) {
    throw new Error('Usernames are 3–30 lowercase letters, numbers or dashes, and start and end with a letter or number.');
  }
  if (RESERVED.has(username)) throw new Error('That username is taken. Please pick another.');
}

function checkPassword(password) {
  if (String(password ?? '').length < MIN_PASSWORD) {
    throw new Error(`Passwords need at least ${MIN_PASSWORD} characters.`);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function passwordMatches(password, stored) {
  const [, salt, hash] = String(stored || '').split('$');
  // With no stored hash, still do the work so a wrong username takes as long as a wrong password.
  const actual = crypto.scryptSync(String(password ?? ''), salt || 'no-such-user', 64);
  const expected = Buffer.from(hash || '', 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

const readAll = () => readJson(ACCOUNTS_FILE, []);

function getAccount(username) {
  return readAll().find((a) => a.username === normalizeUsername(username)) || null;
}

// Usernames listed in SITE_ADMIN can manage every account (reset passwords, delete).
function siteAdmins() {
  return String(process.env.SITE_ADMIN || '')
    .split(',')
    .map(normalizeUsername)
    .filter(Boolean);
}
const isSiteAdmin = (username) => siteAdmins().includes(username);

function createAccount(rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  checkUsername(username);
  checkPassword(password);
  const accounts = readAll();
  if (accounts.some((a) => a.username === username)) throw new Error('That username is taken. Please pick another.');
  const account = {
    username,
    passwordHash: hashPassword(password),
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  writeJson(ACCOUNTS_FILE, accounts);
  return account;
}

// The account if the password is right, otherwise null.
function verifyLogin(username, password) {
  const account = getAccount(username);
  return passwordMatches(password, account?.passwordHash) && account ? account : null;
}

// Changing a password signs out every existing session for that account.
function setPassword(username, password) {
  checkPassword(password);
  const accounts = readAll();
  const account = accounts.find((a) => a.username === username);
  if (!account) throw new Error('No such account.');
  account.passwordHash = hashPassword(password);
  account.sessionVersion = (account.sessionVersion || 1) + 1;
  writeJson(ACCOUNTS_FILE, accounts);
  return account;
}

function deleteAccount(username) {
  const accounts = readAll();
  const remaining = accounts.filter((a) => a.username !== username);
  if (remaining.length === accounts.length) return false;
  writeJson(ACCOUNTS_FILE, remaining);
  return true;
}

function listAccounts() {
  return readAll().map(({ username, createdAt }) => ({ username, createdAt, siteAdmin: isSiteAdmin(username) }));
}

module.exports = {
  normalizeUsername,
  checkUsername,
  getAccount,
  createAccount,
  verifyLogin,
  setPassword,
  deleteAccount,
  listAccounts,
  isSiteAdmin,
  siteAdmins,
};
