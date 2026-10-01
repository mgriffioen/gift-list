// Pull product details (title, description, price, image) out of a retailer page.
//
// Sources are tried from most to least reliable:
//   1. JSON-LD structured data (schema.org Product) — used by most big retailers
//   2. Open Graph / product meta tags (og:title, product:price:amount, ...)
//   3. Microdata (itemprop="price") and a few retailer-specific selectors
//   4. Plain <title> / meta description
const cheerio = require('cheerio');

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The store responded with HTTP ${res.status}.`);
  const type = res.headers.get('content-type') || '';
  if (type && !/html|xml/i.test(type)) throw new Error(`That link is not a web page (${type}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { html: buf.subarray(0, MAX_HTML_BYTES).toString('utf8'), finalUrl: res.url || url };
}

const first = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

function decodeEntities(text) {
  if (!text) return text;
  return cheerio.load(`<p>${text}</p>`)('p').text();
}

function tidy(text, maxLength) {
  if (!text) return '';
  let out = decodeEntities(String(text)).replace(/\s+/g, ' ').trim();
  if (maxLength && out.length > maxLength) out = `${out.slice(0, maxLength - 1).trimEnd()}…`;
  return out;
}

function absolute(url, base) {
  if (!url) return '';
  try {
    return new URL(String(url).trim(), base).href;
  } catch {
    return '';
  }
}

function typeMatches(node, name) {
  const t = node && node['@type'];
  return Array.isArray(t) ? t.includes(name) : t === name;
}

// Walk every JSON-LD block (including @graph arrays) and return the first Product.
function findJsonLdProduct($) {
  const stack = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      stack.push(JSON.parse($(el).contents().text()));
    } catch {
      // Ignore malformed blocks; many sites have them.
    }
  });
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    if (typeMatches(node, 'Product') || typeMatches(node, 'ProductGroup')) return node;
    if (node['@graph']) stack.push(node['@graph']);
    if (node.mainEntity) stack.push(node.mainEntity);
  }
  return null;
}

function jsonLdImage(image) {
  if (!image) return '';
  if (Array.isArray(image)) return jsonLdImage(image[0]);
  if (typeof image === 'object') return image.url || image.contentUrl || '';
  return image;
}

function jsonLdOffer(product) {
  let offers = product.offers;
  if (!offers && Array.isArray(product.hasVariant)) {
    offers = product.hasVariant.map((v) => v.offers).filter(Boolean).flat();
  }
  if (!offers) return {};
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    const spec = Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0] : offer.priceSpecification;
    const price = first(offer.price, offer.lowPrice, spec && spec.price);
    if (price !== undefined) {
      return { amount: price, currency: first(offer.priceCurrency, spec && spec.priceCurrency) };
    }
  }
  return {};
}

function formatPrice(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '';
  const raw = String(amount).trim();
  // Already formatted, e.g. "$24.99" or "24,99 €" — leave it alone.
  if (/[^\d.,\s]/.test(raw)) return raw;
  const number = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(number)) return raw;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(number);
  } catch {
    return `${raw}${currency ? ` ${currency}` : ''}`;
  }
}

function parseProduct(html, url) {
  const $ = cheerio.load(html);
  const meta = (key) =>
    $(`meta[property="${key}"]`).attr('content') || $(`meta[name="${key}"]`).attr('content') || '';

  const product = findJsonLdProduct($) || {};
  const offer = jsonLdOffer(product);

  const title = first(
    product.name,
    meta('og:title'),
    meta('twitter:title'),
    $('#productTitle').text(), // Amazon
    $('h1').first().text(),
    $('title').text(),
  );

  const description = first(
    product.description,
    meta('og:description'),
    meta('twitter:description'),
    meta('description'),
  );

  const image = first(
    jsonLdImage(product.image),
    meta('og:image:secure_url'),
    meta('og:image'),
    meta('twitter:image'),
    meta('twitter:image:src'),
    $('#landingImage').attr('data-old-hires'), // Amazon
    $('#landingImage').attr('src'),
    $('[itemprop="image"]').attr('content') || $('[itemprop="image"]').attr('src'),
    $('link[rel="image_src"]').attr('href'),
  );

  const amount = first(
    offer.amount,
    meta('product:price:amount'),
    meta('og:price:amount'),
    $('[itemprop="price"]').attr('content'),
    $('[itemprop="price"]').first().text(),
    $('.a-price .a-offscreen').first().text(), // Amazon
  );
  const currency = first(
    offer.currency,
    meta('product:price:currency'),
    meta('og:price:currency'),
    $('[itemprop="priceCurrency"]').attr('content'),
  );

  return {
    url,
    title: tidy(title, 200),
    description: tidy(description, 600),
    price: formatPrice(tidy(amount), currency),
    image: absolute(image, url),
  };
}

async function scrapeProduct(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new Error('Please enter a full link, starting with https://');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https links are supported.');

  const { html, finalUrl } = await fetchHtml(url.href);
  // Keep the link the admin pasted (it may carry affiliate/referral info), but
  // resolve relative image paths against wherever the page actually ended up.
  const details = parseProduct(html, finalUrl);
  details.url = url.href;
  return details;
}

module.exports = { scrapeProduct, parseProduct, formatPrice };
