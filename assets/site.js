(function () {
  const CONTENT_URL = './content.json';
  const canvas = document.getElementById('canvas');
  const loadedFonts = new Set();

  function getPageFromHash() {
    const h = (location.hash || '#home').slice(1);
    return h || 'home';
  }

  function applySettings(settings) {
    const root = document.documentElement.style;
    root.setProperty('--bg', settings.backgroundColor || '#0d0712');
    root.setProperty('--primary', settings.primaryColor || '#8b5cf6');
    root.setProperty('--secondary', settings.secondaryColor || '#c084fc');
    root.setProperty('--text', settings.textColor || '#f3e8ff');
    const font = settings.font || 'Poppins';
    document.body.style.fontFamily = `'${font}', sans-serif`;
    if (!loadedFonts.has(font)) {
      loadedFonts.add(font);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;600;700;800&display=swap`;
      document.head.appendChild(link);
    }
  }

  function iconSvg(name) {
    return (window.SITE_ICONS && window.SITE_ICONS[name]) || (window.SITE_ICONS && window.SITE_ICONS.link) || '';
  }

  function renderElement(el) {
    const wrap = document.createElement('div');
    wrap.className = 'el el-' + el.type;
    wrap.style.left = (el.x ?? 10) + '%';
    wrap.style.top = (el.y ?? 10) + '%';
    if (el.w) wrap.style.width = el.w + '%';
    wrap.dataset.id = el.id;

    if (el.type === 'text') {
      const node = document.createElement(el.heading ? 'h2' : 'p');
      node.textContent = el.content || '';
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
      wrap.appendChild(img);
    } else if (el.type === 'link' || el.type === 'icon') {
      const a = document.createElement('a');
      let href = el.url || '#';
      if (el.linkType === 'internal' && el.targetPage) {
        href = '#' + el.targetPage;
      } else {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.href = href;
      a.className = 'social-link';
      a.style.color = el.color || 'var(--secondary)';
      if (el.icon) {
        const span = document.createElement('span');
        span.className = 'icon';
        span.innerHTML = iconSvg(el.icon);
        a.appendChild(span);
      }
      if (el.type === 'link' && el.label) {
        const label = document.createElement('span');
        label.className = 'link-label';
        label.textContent = el.label;
        a.appendChild(label);
      }
      wrap.appendChild(a);
    }
    return wrap;
  }

  async function render() {
    const res = await fetch(CONTENT_URL + '?t=' + Date.now());
    const data = await res.json();
    applySettings(data.settings || {});
    const pageKey = getPageFromHash();
    const page = data.pages[pageKey] || data.pages.home;
    if (!page) return;
    document.title = page.title || 'Site';
    canvas.innerHTML = '';
    (page.elements || []).forEach((el) => canvas.appendChild(renderElement(el)));
  }

  window.addEventListener('hashchange', render);
  render();
})();
