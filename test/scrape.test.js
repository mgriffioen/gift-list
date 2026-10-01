const test = require('node:test');
const assert = require('node:assert');
const { parseProduct, formatPrice } = require('../lib/scrape');

test('reads schema.org Product JSON-LD (inside @graph)', () => {
  const html = `<html><head>
    <meta property="og:site_name" content="Cozy Goods">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"WebPage","name":"ignore me"},
      {"@type":["Product"],"name":"Wool Throw &amp; Pillow",
       "description":"  A very\\n warm   blanket. ",
       "image":[{"@type":"ImageObject","url":"/img/throw.jpg"}],
       "offers":[{"@type":"Offer","price":"1249.5","priceCurrency":"USD"}]}
    ]}</script></head><body></body></html>`;
  const p = parseProduct(html, 'https://shop.example.com/p/1');
  assert.equal(p.title, 'Wool Throw & Pillow');
  assert.equal(p.description, 'A very warm blanket.');
  assert.equal(p.price, '$1,249.50');
  assert.equal(p.image, 'https://shop.example.com/img/throw.jpg');
  assert.equal(p.buttonText, undefined); // button text is never scraped
});

test('falls back to Open Graph and product meta tags', () => {
  const html = `<html><head><title>Fallback</title>
    <script type="application/ld+json">{ not valid json</script>
    <meta property="og:title" content="Ceramic Mug">
    <meta property="og:description" content="Holds coffee.">
    <meta property="og:image" content="https://cdn.example.com/mug.png">
    <meta property="product:price:amount" content="18">
    <meta property="product:price:currency" content="EUR">
  </head></html>`;
  const p = parseProduct(html, 'https://www.mugshop.example/mug');
  assert.equal(p.title, 'Ceramic Mug');
  assert.equal(p.price, '€18.00');
  assert.equal(p.image, 'https://cdn.example.com/mug.png');
});

test('handles Amazon-style markup', () => {
  const html = `<html><head><title>Amazon.com: Thing</title>
    <meta name="description" content="Buy the thing."></head><body>
    <span id="productTitle">   Noise Cancelling Headphones   </span>
    <img id="landingImage" src="small.jpg" data-old-hires="https://m.media-amazon.com/big.jpg">
    <span class="a-price"><span class="a-offscreen">$299.99</span></span>
  </body></html>`;
  const p = parseProduct(html, 'https://www.amazon.com/dp/X');
  assert.equal(p.title, 'Noise Cancelling Headphones');
  assert.equal(p.price, '$299.99');
  assert.equal(p.image, 'https://m.media-amazon.com/big.jpg');
  assert.equal(p.description, 'Buy the thing.');
});

test('returns empty strings when nothing is found', () => {
  const p = parseProduct('<html><body>hi</body></html>', 'https://example.com/');
  assert.equal(p.title, '');
  assert.equal(p.price, '');
  assert.equal(p.image, '');
});

test('formatPrice', () => {
  assert.equal(formatPrice('24.99', 'USD'), '$24.99');
  assert.equal(formatPrice('$24.99'), '$24.99');
  assert.equal(formatPrice('', 'USD'), '');
});
