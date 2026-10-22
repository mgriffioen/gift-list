// Gift sections and a best guess at which one an item belongs in.
// Shared by the server (Node) and the admin page (browser).
(function (root) {
  const CATEGORIES = [
    { id: 'decks', label: 'Decks' },
    { id: 'tech', label: 'Tech' },
    { id: 'games', label: 'Games' },
    { id: 'other', label: 'Other' },
  ];
  const IDS = CATEGORIES.map((c) => c.id);

  // [pattern, points]. Phrases that settle the question score higher than
  // single words, so "Exploding Kittens card game" lands in Games, not Decks.
  const RULES = {
    decks: [
      [/\bplaying[- ]cards?\b/, 4],
      [/\b(card )?decks?\b/, 3],
      [/\bpoker[- ]size\b|\bbridge[- ]size\b|\bcardistry\b|\bmarked cards?\b|\btarot\b/, 3],
      [/\b(bicycle|theory11|theory 11|ellusionist|art of play|kings wild|fontaine|jerry'?s nugget|tally[- ]ho|aviator|uspcc|cartamundi)\b/, 2],
      [/\b(magic tricks?|card magic|card tricks?|gaff|tuck case|uncut sheet)\b/, 2],
    ],
    tech: [
      [/\b(headphones?|earbuds?|airpods|speakers?|soundbar|keyboards?|mouse|mice|monitors?|laptops?|notebook pc|tablets?|ipad|iphone|smartphones?|phones?|chargers?|charging|power bank|usb|hdmi|bluetooth|wi-?fi|router|ssd|hard drive|flash drive|memory card|sd card|webcam|cameras?|lens|drone|kindle|e-?reader|smart ?watch|apple watch|fitbit|smart home|echo dot|alexa|google home|projector|tv|television|gadget|electronic|console|playstation|xbox|nintendo switch|steam deck|gpu|graphics card|cpu|processor|raspberry pi|arduino|3d printer|vr headset|oculus|quest [23])\b/, 2],
      [/\b(wireless|rechargeable|battery|cable|adapter|dock|hub|stand for (laptop|monitor|phone))\b/, 1],
    ],
    games: [
      [/\b(board|card|video|party|tabletop|dice|strategy|word|trivia|drinking|cooperative|co-op|deck[- ]building|roll[- ]and[- ]write) games?\b/, 5],
      [/\b(games?|gaming|expansion|boardgame|rpg|role[- ]playing|dungeons|d&d|tabletop|miniatures?|meeple|jigsaw|puzzles?|chess|checkers|backgammon|mahjong|dominoes|catan|monopoly|scrabble|pok[eé]mon tcg|trading card|booster|ccg|tcg)\b/, 2],
      [/\b(players?|ages \d+\+|\d+\s*-\s*\d+ players)\b/, 1],
    ],
  };

  const HOSTS = {
    decks: /(theory11|artofplay|ellusionist|bicyclecards|playingcarddecks|kardify|murphysmagic|penguinmagic|vanda|deckstarter)\./,
    tech: /(bestbuy|newegg|bhphotovideo|apple|samsung|microcenter|adorama|logitech|anker|dell|lenovo)\./,
    games: /(boardgamegeek|miniaturemarket|coolstuffinc|gamenerdz|cardhaus|tabletopmerchant|steampowered|gog|nintendo|playstation)\./,
  };

  function score(text, rules) {
    let total = 0;
    for (const [pattern, points] of rules) {
      const matches = text.match(new RegExp(pattern.source, 'g'));
      if (matches) total += points * matches.length;
    }
    return total;
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  // Title counts most, then description; the store's address breaks ties.
  function guessCategory(item = {}) {
    const title = String(item.title || '').toLowerCase();
    const description = String(item.description || '').toLowerCase();
    const host = hostOf(item.url);
    let best = 'other';
    let bestScore = 0;
    for (const id of Object.keys(RULES)) {
      const s = score(title, RULES[id]) * 3 + score(description, RULES[id]) + (HOSTS[id].test(host) ? 2 : 0);
      if (s > bestScore) {
        best = id;
        bestScore = s;
      }
    }
    return best;
  }

  const isCategory = (value) => IDS.includes(value);
  const categoryOf = (item) => (isCategory(item.category) ? item.category : guessCategory(item));

  const api = { CATEGORIES, isCategory, guessCategory, categoryOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.giftCategories = api;
})(typeof window !== 'undefined' ? window : globalThis);
