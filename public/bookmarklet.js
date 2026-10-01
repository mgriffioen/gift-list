// Source of the "Add to gift list" bookmark. admin.js turns this function into a
// javascript: link that the admin drags to their bookmarks bar.
//
// When clicked on a product page, it runs in the admin's own browser (so stores
// that block servers can't block it), copies just the parts of the page the
// server-side parser reads, and opens the admin page with them in the URL
// fragment. The admin page sends them to /api/parse to fill in the form.
//
// It must stay self-contained: it's serialised with Function#toString and run
// on other sites, so it can't use anything outside its own body. Use block
// comments only inside it, because it ends up on a single line.
window.giftListBookmarklet = function (adminUrl) {
  /* [selector, all matches?, wrapper class needed by a descendant selector] */
  var picks = [
    ['script[type="application/ld+json"]', true],
    ['meta[property], meta[name], meta[itemprop]', true],
    ['link[rel="image_src"]', false],
    ['title', false],
    ['h1', false],
    ['[itemprop="price"], [itemprop="priceCurrency"], [itemprop="image"]', true],
    ['#productTitle, #landingImage', true],
    ['.a-price .a-offscreen', false, 'a-price'],
    ['.x-price-primary', false],
    ['.ux-image-carousel-item img', false, 'ux-image-carousel-item']
  ];
  var limit = 400000;
  var out = [];
  var size = 0;
  for (var i = 0; i < picks.length; i++) {
    var nodes = picks[i][1]
      ? document.querySelectorAll(picks[i][0])
      : [document.querySelector(picks[i][0])];
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j];
      if (!node) continue;
      /* A heading or price box can wrap lots of markup; keep only its text. */
      var html = /^(H1|SPAN|DIV)$/.test(node.tagName) && node.outerHTML.length > 2000
        ? '<' + node.tagName + (node.id ? ' id="' + node.id + '"' : '') + ' class="' + node.className + '">' +
          node.textContent.slice(0, 500).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
          '</' + node.tagName + '>'
        : node.outerHTML;
      if (picks[i][2]) html = '<span class="' + picks[i][2] + '">' + html + '</span>';
      if (size + html.length > limit) continue;
      size += html.length;
      out.push(html);
    }
  }
  var payload = JSON.stringify({ url: location.href, html: out.join('\n') });
  var target = adminUrl + '#import=' + encodeURIComponent(payload);
  var win = window.open(target, '_blank');
  if (!win) location.href = target;
};
