(function () {
  const $ = (id) => document.getElementById(id);
  const FIELDS = ['url', 'title', 'description', 'price', 'image', 'buttonText', 'category'];
  const { CATEGORIES, guessCategory } = window.giftCategories;

  let items = [];
  let editingId = null;
  // Until the section is picked by hand (or the item was already saved with
  // one), it follows a guess from the title, description and link.
  let categoryChosen = false;

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login') showLogin();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function setMessage(id, text, kind = 'info') {
    const node = $(id);
    node.textContent = text || '';
    node.className = `message ${kind}`;
  }

  // ---------- Views ----------

  function showLogin() {
    $('admin-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    $('password').focus();
  }

  async function showAdmin() {
    $('login-view').classList.add('hidden');
    $('admin-view').classList.remove('hidden');
    await loadItems();
    resetForm();
    await runPendingImport();
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/login', { method: 'POST', body: { password: $('password').value } });
      $('password').value = '';
      setMessage('login-message', '', 'error');
      showAdmin();
    } catch (err) {
      setMessage('login-message', err.message, 'error');
    }
  });

  $('logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    showLogin();
  });

  // ---------- Item form ----------

  function formValues() {
    return Object.fromEntries(FIELDS.map((f) => [f, $(f).value.trim()]));
  }

  function fillForm(values) {
    FIELDS.forEach((f) => { $(f).value = values[f] ?? ''; });
    if (!$('category').value) $('category').value = 'other';
    autoCategory();
    updatePreview();
  }

  function categoryOptions(select) {
    select.replaceChildren(...CATEGORIES.map(({ id, label }) => new Option(label, id)));
    return select;
  }
  categoryOptions($('category'));

  function autoCategory() {
    if (categoryChosen) return;
    const values = formValues();
    const guess = guessCategory(values);
    $('category').value = guess;
    $('category-hint').textContent = values.title || values.description || values.url
      ? 'Guessed from the details above. Change it if that’s wrong.'
      : 'Filled in automatically once you add a title or link.';
  }

  $('category').addEventListener('change', () => {
    categoryChosen = true;
    $('category-hint').textContent = '';
  });
  ['url', 'title', 'description'].forEach((f) => $(f).addEventListener('input', autoCategory));

  function updatePreview() {
    $('preview').replaceChildren(renderCard(formValues()));
  }

  function resetForm() {
    editingId = null;
    categoryChosen = false;
    fillForm({ buttonText: 'View this item' });
    $('editor-heading').textContent = 'Add a gift';
    $('save').textContent = 'Add to list';
    $('cancel').textContent = 'Clear';
    setMessage('item-message', '');
  }

  function startEdit(item) {
    editingId = item.id;
    categoryChosen = true;
    $('category-hint').textContent = '';
    fillForm(item);
    $('editor-heading').textContent = 'Edit gift';
    $('save').textContent = 'Save changes';
    $('cancel').textContent = 'Cancel';
    setMessage('item-message', '');
    $('editor-heading').scrollIntoView({ behavior: 'smooth' });
  }

  FIELDS.forEach((f) => $(f).addEventListener('input', updatePreview));

  // Fill the form with scraped details, only overwriting fields that were found.
  function applyDetails(details) {
    const current = formValues();
    FIELDS.forEach((f) => { if (details[f] && f !== 'category') current[f] = details[f]; });
    fillForm(current);
    const missing = ['title', 'price', 'image'].filter((f) => !details[f]);
    setMessage(
      'item-message',
      missing.length
        ? `Got what we could — couldn't find the ${missing.join(', ')}. Fill ${missing.length > 1 ? 'those' : 'it'} in below.`
        : 'Details filled in. Review them and save.',
    );
  }

  async function fetchDetails() {
    const url = $('url').value.trim();
    if (!url) return setMessage('item-message', 'Paste a product link first.', 'error');
    const button = $('fetch');
    button.disabled = true;
    button.textContent = 'Fetching…';
    setMessage('item-message', 'Looking up the product page…');
    try {
      applyDetails(await api('/api/scrape', { method: 'POST', body: { url } }));
    } catch (err) {
      setMessage(
        'item-message',
        `Couldn't read that page: ${err.message} Some stores block this. Try the “Add to gift list” bookmark (below) from the product page, or fill in the details by hand.`,
        'error',
      );
    } finally {
      button.disabled = false;
      button.textContent = 'Fetch details';
    }
  }

  $('fetch').addEventListener('click', fetchDetails);
  // Pasting a link into an empty form fetches automatically.
  $('url').addEventListener('paste', () => {
    setTimeout(() => { if (!editingId && !$('title').value) fetchDetails(); }, 0);
  });

  $('image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setMessage('item-message', 'That image is over 8 MB. Please pick a smaller one.', 'error');
    setMessage('item-message', 'Uploading image…');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.readAsDataURL(file);
      });
      const { image } = await api('/api/upload', { method: 'POST', body: { dataUrl } });
      $('image').value = image;
      updatePreview();
      setMessage('item-message', 'Image uploaded. Remember to save.');
    } catch (err) {
      setMessage('item-message', err.message, 'error');
    }
  });

  $('item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = formValues();
    if (!values.title) return setMessage('item-message', 'Please add a title.', 'error');
    const save = $('save');
    save.disabled = true;
    try {
      if (editingId) {
        await api(`/api/items/${editingId}`, { method: 'PUT', body: values });
      } else {
        await api('/api/items', { method: 'POST', body: values });
      }
      const wasEditing = Boolean(editingId);
      await loadItems();
      resetForm();
      setMessage('item-message', wasEditing ? 'Changes saved.' : 'Added to your list!');
    } catch (err) {
      setMessage('item-message', err.message, 'error');
    } finally {
      save.disabled = false;
    }
  });

  $('cancel').addEventListener('click', resetForm);

  // ---------- Item list ----------

  function button(label, className, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn small ${className}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderList() {
    const container = $('items');
    container.replaceChildren();
    $('count').textContent = items.length;
    $('no-items').classList.toggle('hidden', items.length > 0);

    for (const { id, label } of CATEGORIES) {
      const inSection = items.filter((item) => item.category === id);
      if (!inSection.length) continue;
      const heading = document.createElement('h3');
      heading.className = 'list-section';
      heading.textContent = `${label} (${inSection.length})`;
      const list = document.createElement('ul');
      list.className = 'item-list';
      inSection.forEach((item, index) => list.append(renderListItem(item, index, inSection.length)));
      container.append(heading, list);
    }
  }

  function renderListItem(item, index, sectionSize) {
    const li = document.createElement('li');
    li.classList.toggle('is-hidden', Boolean(item.hidden));

    let thumb;
    if (item.image) {
      thumb = document.createElement('img');
      thumb.src = item.image;
      thumb.alt = '';
      thumb.referrerPolicy = 'no-referrer';
    } else {
      thumb = document.createElement('div');
      thumb.className = 'noimg';
    }

    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const meta = document.createElement('span');
    meta.textContent = [item.price, item.url && new URL(item.url).hostname.replace(/^www\./, '')]
      .filter(Boolean).join(' · ');
    info.append(title, meta);
    if (item.hidden) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Hidden from the shared page';
      info.append(badge);
    }

    const section = categoryOptions(document.createElement('select'));
    section.value = item.category;
    section.title = 'Section';
    section.setAttribute('aria-label', `Section for ${item.title}`);
    section.addEventListener('change', () => setCategory(item, section.value));

    const controls = document.createElement('div');
    controls.className = 'controls';
    const up = button('↑', 'secondary', () => move(item, 'up'));
    const down = button('↓', 'secondary', () => move(item, 'down'));
    up.disabled = index === 0;
    down.disabled = index === sectionSize - 1;
    up.title = 'Move up';
    down.title = 'Move down';
    controls.append(
      section,
      up,
      down,
      button('Edit', 'secondary', () => startEdit(item)),
      button(item.hidden ? 'Show' : 'Hide', 'secondary', () => setHidden(item, !item.hidden)),
      button('Delete', 'danger', () => remove(item)),
    );

    li.append(thumb, info, controls);
    return li;
  }

  async function loadItems() {
    const data = await api('/api/items?all=1');
    items = data.items;
    $('site-title').value = data.settings.title;
    $('site-intro').value = data.settings.intro;
    renderList();
  }

  async function move(item, direction) {
    items = await api(`/api/items/${item.id}/move`, { method: 'POST', body: { direction } });
    renderList();
  }

  async function setCategory(item, category) {
    await api(`/api/items/${item.id}`, { method: 'PUT', body: { category } });
    if (editingId === item.id) $('category').value = category;
    await loadItems();
  }

  async function setHidden(item, hidden) {
    await api(`/api/items/${item.id}`, { method: 'PUT', body: { hidden } });
    await loadItems();
  }

  async function remove(item) {
    if (!confirm(`Delete “${item.title}”?`)) return;
    await api(`/api/items/${item.id}`, { method: 'DELETE' });
    if (editingId === item.id) resetForm();
    await loadItems();
  }

  // ---------- Settings ----------

  $('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: { title: $('site-title').value, intro: $('site-intro').value },
      });
      setMessage('settings-message', 'Settings saved.');
    } catch (err) {
      setMessage('settings-message', err.message, 'error');
    }
  });

  // ---------- "Add to gift list" bookmark ----------

  const bookmarkCode = `javascript:${encodeURIComponent(
    `(${window.giftListBookmarklet.toString()})(${JSON.stringify(`${location.origin}/admin`)})`,
  )}`;
  $('bookmarklet').href = bookmarkCode;
  $('bookmarklet').addEventListener('click', (e) => {
    e.preventDefault();
    setMessage('bookmarklet-message', 'Drag this button to your bookmarks bar rather than clicking it here.');
  });
  $('copy-bookmarklet').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bookmarkCode);
      setMessage('bookmarklet-message', 'Copied. Create a new bookmark and paste this in as its URL/address.');
    } catch {
      setMessage('bookmarklet-message', 'Couldn\'t copy automatically. Drag the button to your bookmarks bar instead.', 'error');
    }
  });

  // The bookmark opens /admin#import=<{url, html}> — take it out of the address
  // bar right away, and hold on to it until we're logged in.
  let pendingImport = null;
  if (location.hash.startsWith('#import=')) {
    try {
      pendingImport = JSON.parse(decodeURIComponent(location.hash.slice('#import='.length)));
    } catch {
      pendingImport = null;
    }
    history.replaceState(null, '', location.pathname);
  }

  async function runPendingImport() {
    if (!pendingImport) return;
    const { url, html } = pendingImport;
    pendingImport = null;
    resetForm();
    $('url').value = url || '';
    setMessage('item-message', 'Reading the page you sent…');
    try {
      applyDetails(await api('/api/parse', { method: 'POST', body: { url, html } }));
    } catch (err) {
      setMessage('item-message', `Couldn't read that page: ${err.message} You can still fill in the details by hand.`, 'error');
    }
  }

  // ---------- Start ----------

  api('/api/session').then(({ admin }) => (admin ? showAdmin() : showLogin()));
})();
