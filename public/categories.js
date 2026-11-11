// Guess which of a list's own sections a gift belongs in.
// Shared by the server (Node) and the admin page (browser).
//
// Each list makes its own sections, so the guess works from the section names:
// a section called "Books" picks up gifts that mention books. Some common
// section names also come with a set of related words (a "Tech" section picks up
// headphones and chargers, a "Games" section picks up board games, and so on).
(function (root) {
  // [pattern, points]. Phrases that settle the question score higher than
  // single words, so "Exploding Kittens card game" lands in Games, not Decks.
  const KEYWORDS = {
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
    books: [
      [/\b(books?|novels?|paperback|hardcover|hardback|kindle edition|audiobook|memoir|biography|cookbook|graphic novel|manga|comics?)\b/, 2],
      [/\b(author|isbn|chapters?|edition|reading)\b/, 1],
    ],
    clothing: [
      [/\b(shirts?|t-shirts?|tees?|sweaters?|hoodies?|sweatshirts?|jackets?|coats?|pants|jeans|shorts|dress(es)?|skirts?|socks|shoes|sneakers|boots|slippers|hats?|beanies?|scarf|scarves|gloves|mittens|pajamas|leggings)\b/, 2],
      [/\b(size (xs|s|m|l|xl|xxl)|cotton|wool|fleece|apparel|clothing|wear)\b/, 1],
    ],
    kitchen: [
      [/\b(cookware|bakeware|skillet|frying pan|saucepan|dutch oven|knife|knives|cutting board|blender|mixer|air fryer|instant pot|espresso|coffee (maker|grinder)|kettle|mugs?|utensils?|spatula|whisk)\b/, 2],
      [/\b(kitchen|cooking|baking|recipe|dishwasher safe)\b/, 1],
    ],
    toys: [
      [/\b(toys?|lego|plush|stuffed animal|action figures?|dolls?|play ?set|building (blocks|set)|rc car|remote control)\b/, 2],
      [/\b(kids|children|toddler|ages \d+\+)\b/, 1],
    ],
    music: [
      [/\b(vinyl|records?|lp|albums?|cds?|guitar|ukulele|keyboard piano|drums?|strings|picks|sheet music|turntable)\b/, 2],
      [/\b(music|musical|band|song)\b/, 1],
    ],
    outdoors: [
      [/\b(tent|sleeping bag|backpack|hiking|camping|trekking poles?|headlamp|hammock|kayak|paddle|fishing|binoculars|water bottle|cooler)\b/, 2],
      [/\b(outdoors?|trail|waterproof|camp)\b/, 1],
    ],
  };

  // Section names that use one of the keyword sets above.
  const ALIASES = {
    decks: ['deck', 'decks', 'cards', 'playing cards', 'card decks', 'magic'],
    tech: ['tech', 'technology', 'electronics', 'gadgets', 'gear'],
    games: ['game', 'games', 'board games', 'video games', 'tabletop'],
    books: ['book', 'books', 'reading'],
    clothing: ['clothes', 'clothing', 'apparel', 'wardrobe', 'fashion'],
    kitchen: ['kitchen', 'cooking', 'baking', 'home & kitchen'],
    toys: ['toy', 'toys', 'lego'],
    music: ['music', 'vinyl', 'records', 'instruments'],
    outdoors: ['outdoor', 'outdoors', 'camping', 'hiking'],
  };

  // Store addresses that hint at a section.
  const HOSTS = {
    decks: /(theory11|artofplay|ellusionist|bicyclecards|playingcarddecks|kardify|murphysmagic|penguinmagic|vanda|deckstarter)\./,
    tech: /(bestbuy|newegg|bhphotovideo|apple|samsung|microcenter|adorama|logitech|anker|dell|lenovo)\./,
    games: /(boardgamegeek|miniaturemarket|coolstuffinc|gamenerdz|cardhaus|tabletopmerchant|steampowered|gog|nintendo|playstation)\./,
    books: /(bookshop|barnesandnoble|powells|thriftbooks|abebooks)\./,
    outdoors: /(rei|backcountry|patagonia|moosejaw)\./,
  };

  const normalize = (label) => String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Keyword sets whose names appear in the section name, so "Kitchen stuff"
  // and "Books & games" pick them up too.
  function keywordSetsFor(label) {
    const name = normalize(label);
    return Object.keys(ALIASES).filter((key) =>
      ALIASES[key].some((alias) => new RegExp(`(^|[^a-z0-9])${escape(alias)}($|[^a-z0-9])`).test(name)));
  }

  // Words from the section name itself, e.g. "Board Games" → /board/, /games?/.
  function labelRules(label) {
    return normalize(label)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !['and', 'the', 'for', 'other', 'misc', 'stuff', 'things', 'ideas'].includes(word))
      .map((word) => {
        const stem = word.replace(/(es|s)$/, '');
        return [new RegExp(`\\b${escape(stem.length >= 3 ? stem : word)}(e?s)?\\b`), 2];
      });
  }

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

  // The id of the best-matching section, or '' if nothing matches.
  // Title counts most, then description; the store's address breaks ties.
  function guessCategory(item = {}, categories = []) {
    const title = String(item.title || '').toLowerCase();
    const description = String(item.description || '').toLowerCase();
    const host = hostOf(item.url);
    let best = '';
    let bestScore = 0;
    for (const category of categories) {
      const sets = keywordSetsFor(category.label);
      const rules = labelRules(category.label).concat(...sets.map((set) => KEYWORDS[set]));
      const fromHost = sets.some((set) => HOSTS[set] && HOSTS[set].test(host)) ? 2 : 0;
      const s = score(title, rules) * 3 + score(description, rules) + fromHost;
      if (s > bestScore) {
        best = category.id;
        bestScore = s;
      }
    }
    return best;
  }

  // The item's section if it still exists, otherwise '' (no section).
  const categoryOf = (item, categories = []) =>
    categories.some((c) => c.id === item.category) ? item.category : '';

  const api = { guessCategory, categoryOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.giftCategories = api;
})(typeof window !== 'undefined' ? window : globalThis);
