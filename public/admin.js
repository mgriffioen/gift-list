(function () {
  const $ = (id) => document.getElementById(id);
  const FIELDS = ['url', 'title', 'description', 'price', 'image', 'buttonText', 'category'];
  const { guessCategory } = window.giftCategories;

  let me = null; // { username, siteAdmin }
  let signupCodeRequired = false;
  let items = [];
  let categories = []; // this list's own sections, in order
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
    if (res.status === 401 && !['/api/login', '/api/signup'].includes(path)) showLogin();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function setMessage(id, text, kind = 'info') {
    const node = $(id);
    node.textContent = text || '';
    node.className = `message ${kind}`;
  }

  // ---------- Views ----------

  const VIEWS = ['login-view', 'signup-view', 'admin-view'];
  function showView(id) {
    VIEWS.forEach((view) => $(view).classList.toggle('hidden', view !== id));
  }

  function showLogin() {
    me = null;
    showView('login-view');
    document.title = 'Log in · Gift List';
    if (location.pathname !== '/login' && location.pathname !== '/admin') history.replaceState(null, '', '/login');
    $('login-username').focus();
  }

  function showSignup() {
    showView('signup-view');
    document.title = 'Create your gift list';
    if (location.pathname !== '/signup') history.replaceState(null, '', '/signup');
    $('signup-code-field').classList.toggle('hidden', !signupCodeRequired);
    $('signup-code').required = signupCodeRequired;
    updateSignupAddress();
    $('signup-username').focus();
  }

  async function showAdmin(user) {
    me = user;
    showView('admin-view');
    if (location.pathname !== '/admin') history.replaceState(null, '', '/admin');
    const shareUrl = `${location.origin}/${me.username}`;
    document.title = `${me.username} · Gift List`;
    $('admin-heading').textContent = `${me.username}'s gift list`;
    $('view-list').href = `/${me.username}`;
    $('share-url').value = shareUrl;
    $('password-username').value = me.username;
    $('site-admin').classList.toggle('hidden', !me.siteAdmin);
    await loadItems();
    resetForm();
    if (me.siteAdmin) loadAccounts();
    await runPendingImport();
  }

  document.querySelectorAll('[data-view]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (link.dataset.view === 'signup') showSignup();
      else showLogin();
    });
  });

  function updateSignupAddress() {
    const name = $('signup-username').value.trim().toLowerCase() || 'yourname';
    $('signup-address').textContent = `${location.host}/${name}`;
  }
  $('signup-username').addEventListener('input', updateSignupAddress);

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/login', {
        method: 'POST',
        body: { username: $('login-username').value, password: $('login-password').value },
      });
      $('login-password').value = '';
      setMessage('login-message', '', 'error');
      start();
    } catch (err) {
      setMessage('login-message', err.message, 'error');
    }
  });

  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/signup', {
        method: 'POST',
        body: {
          username: $('signup-username').value,
          password: $('signup-password').value,
          code: $('signup-code').value,
        },
      });
      $('signup-password').value = '';
      setMessage('signup-message', '', 'error');
      start();
    } catch (err) {
      setMessage('signup-message', err.message, 'error');
    }
  });

  $('logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    showLogin();
  });

  $('copy-share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('share-url').value);
      setMessage('share-message', 'Link copied. Paste it into a text or email.');
    } catch {
      $('share-url').select();
      setMessage('share-message', 'Couldn’t copy automatically. The link is selected, so copy it from there.', 'error');
    }
  });

  // ---------- Item form ----------

  function formValues() {
    return Object.fromEntries(FIELDS.map((f) => [f, $(f).value.trim()]));
  }

  function fillForm(values) {
    FIELDS.forEach((f) => { $(f).value = values[f] ?? ''; });
    autoCategory();
    updatePreview();
  }

  function categoryOptions(select) {
    select.replaceChildren(
      new Option('No section', ''),
      ...categories.map(({ id, label }) => new Option(label, id)),
    );
    return select;
  }

  function autoCategory() {
    if (categoryChosen) return;
    if (!categories.length) {
      $('category').value = '';
      $('category-hint').textContent = 'Add sections below to group your gifts.';
      return;
    }
    const values = formValues();
    const guess = guessCategory(values, categories);
    $('category').value = guess;
    $('category-hint').textContent = !(values.title || values.description || values.url)
      ? 'Filled in automatically once you add a title or link.'
      : guess
        ? 'Guessed from the details above. Change it if that’s wrong.'
        : 'No section matched. Pick one if you like.';
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

  // Typed prices become US dollars when you leave the field: "10" → "$10.00".
  function formatPriceField() {
    const formatted = window.giftPrice.formatUsd($('price').value);
    if (formatted !== $('price').value) {
      $('price').value = formatted;
      updatePreview();
    }
  }
  $('price').addEventListener('blur', formatPriceField);

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
        `Couldn't read that page: ${err.message} Some stores block this. Try the “Add to gift list” bookmark (further down) from the product page, or fill in the details by hand.`,
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
      const { image } = await api('/api/me/upload', { method: 'POST', body: { dataUrl } });
      $('image').value = image;
      updatePreview();
      setMessage('item-message', 'Image uploaded. Remember to save.');
    } catch (err) {
      setMessage('item-message', err.message, 'error');
    }
  });

  $('item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    formatPriceField();
    const values = formValues();
    if (!values.title) return setMessage('item-message', 'Please add a title.', 'error');
    const save = $('save');
    save.disabled = true;
    try {
      if (editingId) {
        await api(`/api/me/items/${editingId}`, { method: 'PUT', body: values });
      } else {
        await api('/api/me/items', { method: 'POST', body: values });
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

    const groups = [...categories, { id: '', label: categories.length ? 'No section' : '' }];
    for (const { id, label } of groups) {
      const inSection = items.filter((item) => item.category === id);
      if (!inSection.length) continue;
      const heading = document.createElement('h3');
      heading.className = 'list-section';
      heading.textContent = `${label} (${inSection.length})`;
      const list = document.createElement('ul');
      list.className = 'item-list';
      inSection.forEach((item, index) => list.append(renderListItem(item, index, inSection.length)));
      if (label) container.append(heading);
      container.append(list);
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
    let host = '';
    try {
      host = item.url ? new URL(item.url).hostname.replace(/^www\./, '') : '';
    } catch {
      host = '';
    }
    meta.textContent = [item.price, host].filter(Boolean).join(' · ');
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
    const data = await api('/api/me/list');
    items = data.items;
    categories = data.categories;
    const chosen = $('category').value;
    categoryOptions($('category'));
    $('category').value = categories.some((c) => c.id === chosen) ? chosen : '';
    $('site-title').value = data.settings.title;
    $('site-intro').value = data.settings.intro;
    renderList();
    renderCategories();
  }

  async function move(item, direction) {
    items = await api(`/api/me/items/${item.id}/move`, { method: 'POST', body: { direction } });
    renderList();
  }

  async function setCategory(item, category) {
    await api(`/api/me/items/${item.id}`, { method: 'PUT', body: { category } });
    if (editingId === item.id) $('category').value = category;
    await loadItems();
  }

  async function setHidden(item, hidden) {
    await api(`/api/me/items/${item.id}`, { method: 'PUT', body: { hidden } });
    await loadItems();
  }

  async function remove(item) {
    if (!confirm(`Delete “${item.title}”?`)) return;
    await api(`/api/me/items/${item.id}`, { method: 'DELETE' });
    if (editingId === item.id) resetForm();
    await loadItems();
  }

  // ---------- Sections ----------

  async function saveCategories(next, message) {
    try {
      categories = await api('/api/me/categories', { method: 'PUT', body: { categories: next } });
      await loadItems();
      setMessage('categories-message', message);
    } catch (err) {
      setMessage('categories-message', err.message, 'error');
      renderCategories();
    }
  }

  function renderCategories() {
    const list = $('category-list');
    list.replaceChildren();
    categories.forEach((category, index) => {
      const li = document.createElement('li');
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 40;
      input.value = category.label;
      input.setAttribute('aria-label', 'Section name');
      input.addEventListener('change', () => {
        const next = categories.map((c) => (c.id === category.id ? { ...c, label: input.value } : c));
        saveCategories(next, 'Section renamed.');
      });
      const count = items.filter((item) => item.category === category.id).length;
      const meta = document.createElement('span');
      meta.className = 'hint';
      meta.textContent = `${count} gift${count === 1 ? '' : 's'}`;

      const swap = (offset) => {
        const next = [...categories];
        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        saveCategories(next, 'Sections reordered.');
      };
      const up = button('↑', 'secondary', () => swap(-1));
      const down = button('↓', 'secondary', () => swap(1));
      up.disabled = index === 0;
      down.disabled = index === categories.length - 1;
      up.title = 'Move up';
      down.title = 'Move down';
      const del = button('Delete', 'danger', () => {
        const warning = count
          ? `Delete the “${category.label}” section? Its ${count} gift${count === 1 ? '' : 's'} will stay on your list without a section.`
          : `Delete the “${category.label}” section?`;
        if (!confirm(warning)) return;
        saveCategories(categories.filter((c) => c.id !== category.id), 'Section deleted.');
      });

      const controls = document.createElement('div');
      controls.className = 'controls';
      controls.append(up, down, del);
      li.append(input, meta, controls);
      list.append(li);
    });
  }

  $('add-category').addEventListener('submit', (e) => {
    e.preventDefault();
    const label = $('new-category').value.trim();
    if (!label) return;
    $('new-category').value = '';
    saveCategories([...categories, { label }], `Added “${label}”.`);
  });

  // ---------- Settings ----------

  $('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/me/settings', {
        method: 'PUT',
        body: { title: $('site-title').value, intro: $('site-intro').value },
      });
      setMessage('settings-message', 'Settings saved.');
    } catch (err) {
      setMessage('settings-message', err.message, 'error');
    }
  });

  // ---------- Claims ----------

  $('clear-claims').addEventListener('click', async () => {
    if (!confirm('Clear every “I’ll get this” mark on your list? People will be able to pick gifts again.')) return;
    try {
      await api('/api/me/claims/clear', { method: 'POST' });
      setMessage('claims-message', 'Cleared. Your list is fresh.');
    } catch (err) {
      setMessage('claims-message', err.message, 'error');
    }
  });

  // ---------- Account ----------

  $('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/me/password', {
        method: 'PUT',
        body: { current: $('current-password').value, next: $('new-password').value },
      });
      $('current-password').value = '';
      $('new-password').value = '';
      setMessage('password-message', 'Password changed.');
    } catch (err) {
      setMessage('password-message', err.message, 'error');
    }
  });

  $('delete-account').addEventListener('click', async () => {
    const password = prompt(
      `This permanently deletes your account and everything on ${me.username}'s list, and ${location.host}/${me.username} stops working.\n\nType your password to confirm:`,
    );
    if (!password) return;
    try {
      await api('/api/me', { method: 'DELETE', body: { password } });
      location.href = '/';
    } catch (err) {
      setMessage('delete-message', err.message, 'error');
    }
  });

  // ---------- Site admin ----------

  async function loadAccounts() {
    const list = $('account-list');
    try {
      const accounts = await api('/api/site/accounts');
      list.replaceChildren();
      for (const account of accounts) {
        const li = document.createElement('li');
        const info = document.createElement('div');
        info.className = 'info';
        const link = document.createElement('a');
        link.href = `/${account.username}`;
        link.target = '_blank';
        link.textContent = account.username;
        const strong = document.createElement('strong');
        strong.append(link);
        const meta = document.createElement('span');
        meta.textContent = [
          `${account.items} gift${account.items === 1 ? '' : 's'}`,
          `joined ${new Date(account.createdAt).toLocaleDateString()}`,
          account.siteAdmin ? 'site admin' : '',
        ].filter(Boolean).join(' · ');
        info.append(strong, meta);

        const controls = document.createElement('div');
        controls.className = 'controls';
        controls.append(button('Reset password', 'secondary', async () => {
          if (!confirm(`Give ${account.username} a new temporary password? Their current one stops working.`)) return;
          try {
            const { password } = await api(`/api/site/accounts/${account.username}/reset-password`, { method: 'POST' });
            setMessage('site-message', `New password for ${account.username}: ${password}  (send it to them; it won't be shown again)`);
          } catch (err) {
            setMessage('site-message', err.message, 'error');
          }
        }));
        if (account.username !== me.username) {
          controls.append(button('Delete', 'danger', async () => {
            if (!confirm(`Permanently delete ${account.username} and their whole list?`)) return;
            try {
              await api(`/api/site/accounts/${account.username}`, { method: 'DELETE' });
              setMessage('site-message', `Deleted ${account.username}.`);
              loadAccounts();
            } catch (err) {
              setMessage('site-message', err.message, 'error');
            }
          }));
        }
        li.append(info, controls);
        list.append(li);
      }
    } catch (err) {
      setMessage('site-message', err.message, 'error');
    }
  }

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

  async function start() {
    const session = await api('/api/session');
    signupCodeRequired = session.signupCodeRequired;
    if (session.user) showAdmin(session.user);
    else if (location.pathname === '/signup') showSignup();
    else showLogin();
  }
  start();
})();
