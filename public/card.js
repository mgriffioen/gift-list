// Builds a gift card element. Shared by the public page and the admin preview.
// Everything goes through textContent / validated URLs, so scraped text can't inject HTML.
(function () {
  function safeUrl(value, { allowRelative = false } = {}) {
    if (!value) return '';
    if (allowRelative && value.startsWith('/uploads/')) return value;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  window.renderCard = function renderCard(item) {
    const card = el('article', 'card');

    const thumb = el('div', 'thumb');
    const src = safeUrl(item.image, { allowRelative: true });
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = item.title || '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer'; // some stores block hot-linked images with a referrer
      img.onerror = () => img.replaceWith(el('span', 'placeholder', '🎁'));
      thumb.append(img);
    } else {
      thumb.append(el('span', 'placeholder', '🎁'));
    }
    card.append(thumb);

    const body = el('div', 'body');
    body.append(el('h2', '', item.title || 'Untitled gift'));
    if (item.description) body.append(el('p', 'desc', item.description));
    if (item.price) body.append(el('div', 'price', item.price));

    const href = safeUrl(item.url);
    if (href) {
      const link = el('a', 'btn', item.buttonText || 'View this item');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      body.append(link);
    }
    card.append(body);
    return card;
  };
})();
