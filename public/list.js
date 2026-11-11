// The shared page for one list, at /<username>.
(function () {
  const $ = (id) => document.getElementById(id);
  const username = decodeURIComponent(location.pathname.split('/')[1] || '').toLowerCase();
  const main = $('sections');

  // Claims this browser made, as { "<username>/<itemId>": token }, so the
  // visitor can undo them. Storage can be unavailable (private windows), so
  // every read and write is guarded.
  const CLAIMS_KEY = 'giftlist-claims';
  const NAME_KEY = 'giftlist-name';
  function loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch {
      /* not remembered; the claim still counts */
    }
  }
  const myClaims = loadJson(CLAIMS_KEY, {});
  const claimKey = (item) => `${username}/${item.id}`;
  let savedName = '';
  try {
    savedName = localStorage.getItem(NAME_KEY) || '';
  } catch {
    savedName = '';
  }

  let data = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function showError(text) {
    const box = $('page-message');
    box.textContent = text;
    box.classList.toggle('hidden', !text);
  }

  async function request(path, method, body) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(result.error || `Something went wrong (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return result;
  }

  const itemPath = (item) => `/api/lists/${encodeURIComponent(username)}/items/${encodeURIComponent(item.id)}/claim`;

  async function claim(item, name) {
    showError('');
    try {
      const { token } = await request(itemPath(item), 'POST', { name });
      myClaims[claimKey(item)] = token;
      save(CLAIMS_KEY, myClaims);
      if (name) save(NAME_KEY, name);
      savedName = name || savedName;
    } catch (err) {
      showError(err.message);
    }
    await load();
  }

  async function unclaim(item) {
    showError('');
    try {
      await request(itemPath(item), 'DELETE', { token: myClaims[claimKey(item)] || '' });
      delete myClaims[claimKey(item)];
      save(CLAIMS_KEY, myClaims);
    } catch (err) {
      showError(err.message);
    }
    await load();
  }

  // The "I'll get this" area under each card.
  function claimControls(item) {
    const box = el('div', 'claim');
    if (item.claim) {
      const mine = Boolean(myClaims[claimKey(item)]);
      const who = mine ? 'You’re' : item.claim.name ? `${item.claim.name} is` : 'Someone is';
      box.append(el('span', 'claimed-note', `✓ ${who} getting this`));
      if (mine) {
        const undo = el('button', 'link-button', 'Undo');
        undo.type = 'button';
        undo.addEventListener('click', () => unclaim(item));
        box.append(undo);
      }
      return box;
    }

    const start = el('button', 'btn secondary claim-button', 'I’ll get this');
    start.type = 'button';
    start.addEventListener('click', () => {
      const form = el('form', 'claim-form');
      const label = el('label', '', 'Your name (optional)');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 60;
      input.value = savedName;
      input.placeholder = 'So others know who';
      input.id = `claim-${item.id}`;
      label.htmlFor = input.id;
      const confirmButton = el('button', 'btn small', 'Confirm');
      confirmButton.type = 'submit';
      const cancel = el('button', 'btn small secondary', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => box.replaceChildren(start));
      const row = el('div', 'row');
      row.append(confirmButton, cancel);
      form.append(label, input, row);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        confirmButton.disabled = true;
        claim(item, input.value.trim());
      });
      box.replaceChildren(form);
      input.focus();
    });
    box.append(start);
    return box;
  }

  function render() {
    const { settings, categories, items, viewerIsOwner } = data;
    $('title').textContent = settings.title;
    $('intro').textContent = settings.intro;
    document.title = settings.title;
    $('owner-banner').classList.toggle('hidden', !viewerIsOwner);
    $('how-it-works').classList.toggle('hidden', viewerIsOwner || !items.length);
    $('owner-name').textContent = username.charAt(0).toUpperCase() + username.slice(1);

    // Sections in the owner's order, then anything without a section.
    const groups = categories.map((c) => ({ label: c.label, items: items.filter((i) => i.category === c.id) }));
    groups.push({ label: categories.length ? 'Other ideas' : '', items: items.filter((i) => !i.category) });
    const shown = groups.filter((g) => g.items.length);
    const onlyOneGroup = shown.length === 1 && !shown[0].label;

    main.replaceChildren();
    for (const group of shown) {
      const section = el('section', 'gift-section');
      if (!onlyOneGroup && group.label) section.append(el('h2', '', group.label));
      const grid = el('div', 'grid');
      // Gifts nobody has claimed yet come first.
      const ordered = [...group.items.filter((i) => !i.claim), ...group.items.filter((i) => i.claim)];
      for (const item of ordered) {
        const card = renderCard(item, viewerIsOwner ? null : claimControls(item));
        if (item.claim) card.classList.add('is-claimed');
        grid.append(card);
      }
      section.append(grid);
      main.append(section);
    }
    $('empty').classList.toggle('hidden', items.length > 0);
  }

  async function load() {
    try {
      const res = await fetch(`/api/lists/${encodeURIComponent(username)}`);
      if (res.status === 404) {
        document.title = 'No list here';
        $('title').textContent = 'There’s no list here';
        $('intro').textContent = 'Check the link for typos, or ask the person who sent it.';
        return;
      }
      if (!res.ok) throw new Error();
      data = await res.json();
      render();
    } catch {
      main.textContent = 'Sorry, the list could not be loaded. Please try again later.';
    }
  }

  load();
})();
