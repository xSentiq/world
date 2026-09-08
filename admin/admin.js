(function () {
  'use strict';

  const CONTENT_PATH = 'content.json';
  const FONTS = ['Poppins', 'Inter', 'Montserrat', 'Playfair Display', 'Space Grotesk', 'DM Sans', 'Sora', 'Outfit'];
  const ICON_NAMES = Object.keys(window.SITE_ICONS || {});

  let state = {
    owner: '', repo: '', branch: 'main', token: '',
    content: null, sha: null,
    currentPage: 'home', selectedId: null,
    dirty: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const loginScreen = $('#login-screen');
  const editorScreen = $('#editor-screen');
  const loginForm = $('#login-form');
  const loginError = $('#login-error');
  const loginBtn = $('#login-btn');
  const canvas = $('#admin-canvas');
  const propsPanel = $('#props-panel');
  const pageSelect = $('#page-select');
  const saveStatus = $('#save-status');
  const imageFileInput = $('#image-file-input');

  // ---------- GitHub API helpers ----------

  function apiHeaders() {
    return {
      Authorization: `Bearer ${state.token}`,
      Accept: 'application/vnd.github+json',
    };
  }

  async function ghGetFile(path) {
    const url = `https://api.github.com/repos/${state.owner}/${state.repo}/contents/${path}?ref=${encodeURIComponent(state.branch)}`;
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    const json = await res.json();
    return { text: b64DecodeUnicode(json.content), sha: json.sha };
  }

  async function ghPutTextFile(path, text, sha, message) {
    const url = `https://api.github.com/repos/${state.owner}/${state.repo}/contents/${path}`;
    const body = {
      message: message || `Update ${path}`,
      content: b64EncodeUnicode(text),
      branch: state.branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, { method: 'PUT', headers: { ...apiHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Save failed: ${res.status} ${err.message || ''}`);
    }
    return res.json();
  }

  async function ghPutBinaryFile(path, base64, message) {
    const url = `https://api.github.com/repos/${state.owner}/${state.repo}/contents/${path}`;
    // Check if file already exists (to include sha on overwrite)
    let sha = null;
    try {
      const existing = await fetch(url + `?ref=${encodeURIComponent(state.branch)}`, { headers: apiHeaders() });
      if (existing.ok) sha = (await existing.json()).sha;
    } catch (e) { /* not found, ignore */ }

    const body = { message: message || `Upload ${path}`, content: base64, branch: state.branch };
    if (sha) body.sha = sha;
    const res = await fetch(url, { method: 'PUT', headers: { ...apiHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Upload failed: ${res.status} ${err.message || ''}`);
    }
    return res.json();
  }

  function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p) => String.fromCharCode('0x' + p)));
  }
  function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  }
  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // ---------- Login ----------

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';

    const owner = $('#f-owner').value.trim();
    const repo = $('#f-repo').value.trim();
    const branch = $('#f-branch').value.trim() || 'main';
    const token = $('#f-token').value.trim();

    try {
      const userRes = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      if (!userRes.ok) throw new Error('Invalid token.');

      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      if (!repoRes.ok) throw new Error('Token cannot access that repository.');

      state.owner = owner; state.repo = repo; state.branch = branch; state.token = token;
      sessionStorage.setItem('admin_token', token);
      localStorage.setItem('admin_owner', owner);
      localStorage.setItem('admin_repo', repo);
      localStorage.setItem('admin_branch', branch);

      await loadContent();
      showEditor();
    } catch (err) {
      loginError.textContent = err.message || 'Sign-in failed.';
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in';
    }
  });

  async function loadContent() {
    const { text, sha } = await ghGetFile(CONTENT_PATH);
    state.content = JSON.parse(text);
    state.sha = sha;
    state.currentPage = Object.keys(state.content.pages)[0] || 'home';
  }

  function showEditor() {
    loginScreen.classList.add('hidden');
    editorScreen.classList.remove('hidden');
    applyGlobalStyles();
    renderPageSelect();
    renderCanvas();
  }

  // Prefill remembered owner/repo/branch
  window.addEventListener('DOMContentLoaded', () => {
    $('#f-owner').value = localStorage.getItem('admin_owner') || '';
    $('#f-repo').value = localStorage.getItem('admin_repo') || '';
    $('#f-branch').value = localStorage.getItem('admin_branch') || 'main';
  });

  $('#logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('admin_token');
    location.reload();
  });

  // ---------- Rendering ----------

  function applyGlobalStyles() {
    const s = state.content.settings || {};
    const root = document.documentElement.style;
    canvas.style.setProperty('--bg', s.backgroundColor || '#0d0712');
    canvas.style.setProperty('--primary', s.primaryColor || '#8b5cf6');
    canvas.style.setProperty('--secondary', s.secondaryColor || '#c084fc');
    canvas.style.setProperty('--text', s.textColor || '#f3e8ff');
    canvas.style.fontFamily = `'${s.font || 'Poppins'}', sans-serif`;
    const linkId = 'admin-font-link';
    let link = document.getElementById(linkId);
    if (!link) { link = document.createElement('link'); link.id = linkId; link.rel = 'stylesheet'; document.head.appendChild(link); }
    link.href = `https://fonts.googleapis.com/css2?family=${(s.font || 'Poppins').replace(/ /g, '+')}:wght@400;600;700;800&display=swap`;
  }

  function renderPageSelect() {
    pageSelect.innerHTML = '';
    Object.keys(state.content.pages).forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = state.content.pages[key].title || key;
      if (key === state.currentPage) opt.selected = true;
      pageSelect.appendChild(opt);
    });
  }

  pageSelect.addEventListener('change', () => {
    state.currentPage = pageSelect.value;
    state.selectedId = null;
    renderCanvas();
    renderProps();
  });

  function currentPageData() {
    return state.content.pages[state.currentPage];
  }

  function iconSvg(name) {
    return (window.SITE_ICONS && window.SITE_ICONS[name]) || '';
  }

  function renderCanvas() {
    canvas.innerHTML = '';
    const page = currentPageData();
    (page.elements || []).forEach((el) => canvas.appendChild(buildAdminElement(el)));
  }

  function buildAdminElement(el) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-el';
    wrap.style.left = (el.x ?? 10) + '%';
    wrap.style.top = (el.y ?? 10) + '%';
    if (el.w) wrap.style.width = el.w + '%';
    wrap.dataset.id = el.id;
    if (el.id === state.selectedId) wrap.classList.add('selected');

    if (el.type === 'text') {
      const node = document.createElement(el.heading ? 'h2' : 'p');
      node.textContent = el.content || '(empty text)';
      node.style.color = el.color || 'var(--text)';
      node.style.fontSize = (el.fontSize || 18) + 'px';
      node.style.fontWeight = el.bold ? '700' : '400';
      wrap.appendChild(node);
    } else if (el.type === 'image') {
      const img = document.createElement('img');
      img.src = el.src || '';
      img.alt = el.alt || '';
      if (el.h) img.style.height = el.h + 'px';
      if (el.rounded) img.style.borderRadius = '16px';
      if (!el.src) { img.style.width = '120px'; img.style.height = '80px'; img.style.background = '#241536'; }
      wrap.appendChild(img);
    } else if (el.type === 'link' || el.type === 'icon') {
      const a = document.createElement('span');
      a.className = 'social-link';
      a.style.color = el.color || 'var(--secondary)';
      if (el.icon) { const span = document.createElement('span'); span.className = 'icon'; span.innerHTML = iconSvg(el.icon); a.appendChild(span); }
      if (el.type === 'link' && el.label) { const label = document.createElement('span'); label.textContent = el.label; a.appendChild(label); }
      wrap.appendChild(a);
    }

    wrap.addEventListener('mousedown', (e) => startDrag(e, wrap, el));
    wrap.addEventListener('click', (e) => { e.stopPropagation(); selectElement(el.id); });
    return wrap;
  }

  canvas.addEventListener('click', () => { state.selectedId = null; renderCanvas(); renderProps(); });

  // ---------- Drag ----------

  function startDrag(e, wrap, el) {
    e.preventDefault();
    e.stopPropagation();
    selectElement(el.id);
    const canvasRect = canvas.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const startLeftPct = el.x ?? 10, startTopPct = el.y ?? 10;

    function onMove(ev) {
      const dxPct = ((ev.clientX - startX) / canvasRect.width) * 100;
      const dyPct = ((ev.clientY - startY) / canvasRect.height) * 100;
      let newX = Math.max(0, Math.min(95, startLeftPct + dxPct));
      let newY = Math.max(0, Math.min(95, startTopPct + dyPct));
      el.x = Math.round(newX * 10) / 10;
      el.y = Math.round(newY * 10) / 10;
      wrap.style.left = el.x + '%';
      wrap.style.top = el.y + '%';
      markDirty();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      renderProps();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function selectElement(id) {
    state.selectedId = id;
    renderCanvas();
    renderProps();
  }

  function findSelected() {
    const page = currentPageData();
    return (page.elements || []).find((el) => el.id === state.selectedId);
  }

  // ---------- Add elements ----------

  document.querySelectorAll('.toolbar button[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.add;
      const id = 'el-' + Math.random().toString(36).slice(2, 9);
      let el;
      if (kind === 'text' || kind === 'heading') {
        el = { id, type: 'text', heading: kind === 'heading', content: kind === 'heading' ? 'New heading' : 'New text', x: 20, y: 20, fontSize: kind === 'heading' ? 40 : 18, bold: kind === 'heading', color: '#f3e8ff' };
      } else if (kind === 'image') {
        el = { id, type: 'image', src: '', alt: '', x: 20, y: 20, h: 200, rounded: true };
      } else if (kind === 'link') {
        el = { id, type: 'link', label: 'New link', icon: 'link', url: 'https://', linkType: 'external', x: 20, y: 20, color: '#c084fc' };
      } else if (kind === 'icon') {
        el = { id, type: 'icon', icon: 'github', url: 'https://', linkType: 'external', x: 20, y: 20, color: '#f3e8ff' };
      }
      currentPageData().elements.push(el);
      markDirty();
      selectElement(id);
    });
  });

  // ---------- Properties panel ----------

  function renderProps() {
    const el = findSelected();
    if (!el) { propsPanel.innerHTML = '<p class="props-empty">Click an element to edit it.</p>'; return; }

    let html = `<h3>${el.type[0].toUpperCase() + el.type.slice(1)} element</h3>`;

    if (el.type === 'text') {
      html += field('Content', `<textarea data-f="content">${escapeHtml(el.content || '')}</textarea>`);
      html += field('Font size (px)', `<input type="number" data-f="fontSize" value="${el.fontSize || 18}">`);
      html += field('Color', `<input type="color" data-f="color" value="${el.color || '#f3e8ff'}">`);
      html += `<label class="checkbox-row"><input type="checkbox" data-f="bold" ${el.bold ? 'checked' : ''}> Bold</label>`;
      html += `<label class="checkbox-row"><input type="checkbox" data-f="heading" ${el.heading ? 'checked' : ''}> Heading style</label>`;
    }

    if (el.type === 'image') {
      html += `<label>Image
        <button type="button" class="upload-btn" id="upload-btn">Upload image…</button>
      </label>`;
      html += field('Alt text', `<input type="text" data-f="alt" value="${escapeAttr(el.alt || '')}">`);
      html += field('Height (px)', `<input type="number" data-f="h" value="${el.h || 200}">`);
      html += `<label class="checkbox-row"><input type="checkbox" data-f="rounded" ${el.rounded ? 'checked' : ''}> Rounded corners</label>`;
      if (el.src) html += `<p style="font-size:.7rem;color:#7a6a93;word-break:break-all;">${escapeHtml(el.src)}</p>`;
    }

    if (el.type === 'link' || el.type === 'icon') {
      if (el.type === 'link') html += field('Label', `<input type="text" data-f="label" value="${escapeAttr(el.label || '')}">`);
      html += field('Icon', selectField('icon', ICON_NAMES, el.icon));
      html += field('Link type', selectField('linkType', ['external', 'internal'], el.linkType || 'external'));
      if (el.linkType === 'internal') {
        html += field('Target page', selectField('targetPage', Object.keys(state.content.pages), el.targetPage));
      } else {
        html += field('URL', `<input type="url" data-f="url" value="${escapeAttr(el.url || '')}">`);
      }
      html += field('Color', `<input type="color" data-f="color" value="${el.color || '#c084fc'}">`);
    }

    html += `<button class="danger" id="delete-el-btn">Delete element</button>`;
    propsPanel.innerHTML = html;

    propsPanel.querySelectorAll('[data-f]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.f;
        if (input.type === 'checkbox') el[key] = input.checked;
        else if (input.type === 'number') el[key] = Number(input.value);
        else el[key] = input.value;
        markDirty();
        renderCanvas();
        if (key === 'linkType') renderProps();
      });
    });

    const upBtn = document.getElementById('upload-btn');
    if (upBtn) upBtn.addEventListener('click', () => triggerImageUpload(el));

    const delBtn = document.getElementById('delete-el-btn');
    delBtn.addEventListener('click', () => {
      const page = currentPageData();
      page.elements = page.elements.filter((e) => e.id !== el.id);
      state.selectedId = null;
      markDirty();
      renderCanvas();
      renderProps();
    });
  }

  function field(label, inner) { return `<label>${label}${inner}</label>`; }
  function selectField(key, options, current) {
    return `<select data-f="${key}">` + options.map((o) => `<option value="${o}" ${o === current ? 'selected' : ''}>${o}</option>`).join('') + `</select>`;
  }
  function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }

  // ---------- Image upload ----------

  let uploadTargetEl = null;
  function triggerImageUpload(el) {
    uploadTargetEl = el;
    imageFileInput.value = '';
    imageFileInput.click();
  }

  imageFileInput.addEventListener('change', async () => {
    const file = imageFileInput.files[0];
    if (!file || !uploadTargetEl) return;
    saveStatus.textContent = 'Uploading image…';
    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `assets/uploads/${Date.now()}-${safeName}`;
      await ghPutBinaryFile(path, base64, `Upload image ${safeName}`);
      uploadTargetEl.src = '../' + path;
      markDirty();
      renderCanvas();
      renderProps();
      saveStatus.textContent = 'Image uploaded (not yet saved)';
    } catch (err) {
      saveStatus.textContent = '';
      alert(err.message || 'Upload failed');
    }
  });

  // ---------- Pages ----------

  $('#add-page-btn').addEventListener('click', () => {
    const name = prompt('New page name (shown in nav, e.g. "Projects"):');
    if (!name) return;
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page';
    let key = slug, n = 2;
    while (state.content.pages[key]) key = `${slug}-${n++}`;
    state.content.pages[key] = { title: name, elements: [{ id: 'el-' + Math.random().toString(36).slice(2, 9), type: 'text', heading: true, content: name, x: 8, y: 14, fontSize: 44, bold: true, color: '#f3e8ff' }] };
    state.currentPage = key;
    markDirty();
    renderPageSelect();
    renderCanvas();
    renderProps();
  });

  $('#rename-page-btn').addEventListener('click', () => {
    const page = currentPageData();
    const name = prompt('Rename page:', page.title || state.currentPage);
    if (!name) return;
    page.title = name;
    markDirty();
    renderPageSelect();
  });

  $('#delete-page-btn').addEventListener('click', () => {
    const keys = Object.keys(state.content.pages);
    if (keys.length <= 1) { alert('You need at least one page.'); return; }
    if (!confirm(`Delete page "${currentPageData().title}"? This cannot be undone.`)) return;
    delete state.content.pages[state.currentPage];
    state.currentPage = Object.keys(state.content.pages)[0];
    state.selectedId = null;
    markDirty();
    renderPageSelect();
    renderCanvas();
    renderProps();
  });

  // ---------- Site settings modal ----------

  $('#settings-btn').addEventListener('click', () => {
    const s = state.content.settings;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-card">
        <h3>Site settings</h3>
        <label>Background color<input type="color" id="s-bg" value="${s.backgroundColor}"></label>
        <label>Primary color<input type="color" id="s-primary" value="${s.primaryColor}"></label>
        <label>Secondary color<input type="color" id="s-secondary" value="${s.secondaryColor}"></label>
        <label>Text color<input type="color" id="s-text" value="${s.textColor}"></label>
        <label>Font
          <select id="s-font">${FONTS.map((f) => `<option value="${f}" ${f === s.font ? 'selected' : ''}>${f}</option>`).join('')}</select>
        </label>
        <div class="modal-actions">
          <button id="s-cancel">Cancel</button>
          <button id="s-apply" class="primary">Apply</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#s-cancel').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#s-apply').addEventListener('click', () => {
      s.backgroundColor = backdrop.querySelector('#s-bg').value;
      s.primaryColor = backdrop.querySelector('#s-primary').value;
      s.secondaryColor = backdrop.querySelector('#s-secondary').value;
      s.textColor = backdrop.querySelector('#s-text').value;
      s.font = backdrop.querySelector('#s-font').value;
      markDirty();
      applyGlobalStyles();
      renderCanvas();
      backdrop.remove();
    });
  });

  // ---------- Save ----------

  function markDirty() {
    state.dirty = true;
    saveStatus.textContent = 'Unsaved changes';
  }

  $('#save-btn').addEventListener('click', async () => {
    saveStatus.textContent = 'Saving…';
    try {
      const text = JSON.stringify(state.content, null, 2);
      const result = await ghPutTextFile(CONTENT_PATH, text, state.sha, 'Update site content via admin panel');
      state.sha = result.content.sha;
      state.dirty = false;
      saveStatus.textContent = 'Saved ✓ (site will update shortly)';
      setTimeout(() => { if (!state.dirty) saveStatus.textContent = ''; }, 4000);
    } catch (err) {
      saveStatus.textContent = '';
      alert(err.message || 'Save failed');
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
