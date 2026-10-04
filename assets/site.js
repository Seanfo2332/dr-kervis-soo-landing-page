(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.progress');
  let scheduled = false;
  // Everything the header can sit over, in document order (a later surface is painted on top of an earlier one).
  const surfaces = [...document.querySelectorAll('[data-tone], .panel, .site-footer')];
  const isDark = surface => (surface.dataset.tone ? surface.dataset.tone === 'dark' : surface.classList.contains('on-navy'));

  document.querySelectorAll('[data-year]').forEach(element => { element.textContent = String(new Date().getFullYear()); });

  // The header's colours follow the surface under it: light text over navy panels, dark text over light ones.
  function updateTone() {
    if (!header) return;
    const probe = header.offsetHeight / 2;
    // Panels overlap by their corner radius, so the last surface that reaches the probe line is the one in view.
    const visible = surfaces.filter(surface => { const box = surface.getBoundingClientRect(); return box.top <= probe && box.bottom > probe; }).pop();
    header.classList.toggle('on-dark', Boolean(visible) && isDark(visible));
  }

  function updateScroll() {
    header?.classList.toggle('scrolled', window.scrollY > 30);
    updateTone();
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${distance > 0 ? Math.min(window.scrollY / distance, 1) : 0})`;
    scheduled = false;
  }
  window.addEventListener('scroll', () => {
    if (!scheduled) { requestAnimationFrame(updateScroll); scheduled = true; }
  }, { passive: true });
  updateScroll();

  // Full-screen menu, opened from the floating pill on every screen size.
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.mobile-menu');
  const inertWhileOpen = ['main', '.site-footer', '.site-header', '.skip-link', '.side-tab'];
  function setMenu(open) {
    if (!menu || !toggle) return;
    if (open && drawer && !drawer.hidden) setDrawer(false, false);
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    inertWhileOpen.forEach(selector => document.querySelector(selector)?.toggleAttribute('inert', open));
    if (open) menu.querySelector('a')?.focus();
    else toggle.focus({ preventScroll: true });
  }
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  menu?.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (!menu || menu.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false); }
    if (event.key === 'Tab') {
      const targets = [toggle, ...menu.querySelectorAll('a, button')];
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  // Quick-contact drawer, opened from the tab on the right edge (not modal: the page stays usable).
  const tab = document.querySelector('.side-tab');
  const drawer = document.querySelector('.quick-drawer');
  function setDrawer(open, returnFocus = true) {
    if (!drawer || !tab) return;
    drawer.hidden = !open;
    tab.setAttribute('aria-expanded', String(open));
    if (open) drawer.querySelector('.drawer-close')?.focus();
    else if (returnFocus) tab.focus({ preventScroll: true });
  }
  tab?.addEventListener('click', () => setDrawer(drawer.hidden));
  drawer?.querySelector('.drawer-close')?.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && drawer && !drawer.hidden) setDrawer(false); });
  document.addEventListener('click', event => {
    if (drawer && !drawer.hidden && !drawer.contains(event.target) && !tab.contains(event.target)) setDrawer(false, false);
  });

  // Copy-email buttons (drawer and closing panel) report the result in a live region next to them.
  // The region is emptied first so a second copy is announced again, and again after a few seconds so it never goes stale.
  const STATUS_CLEAR_MS = 4000;
  const statusTimers = new WeakMap();
  function announce(status, message) {
    if (!status) return;
    clearTimeout(statusTimers.get(status));
    status.textContent = '';
    requestAnimationFrame(() => { status.textContent = message; });
    statusTimers.set(status, setTimeout(() => { status.textContent = ''; }, STATUS_CLEAR_MS));
  }
  document.querySelectorAll('[data-copy-text]').forEach(button => button.addEventListener('click', async () => {
    const status = button.closest('.quick-drawer, .closing')?.querySelector('.copy-status');
    try {
      await navigator.clipboard.writeText(button.dataset.copyText);
      announce(status, '已复制邮箱');
    } catch {
      announce(status, `请手动复制：${button.dataset.copyText}`);
    }
  }));

  if ('IntersectionObserver' in window && !reduced.matches) {
    document.documentElement.classList.add('js-motion');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.07 });
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
    reduced.addEventListener('change', () => { if (reduced.matches) document.documentElement.classList.remove('js-motion'); });
  }

  document.querySelectorAll('[data-filter-list]').forEach(list => {
    const buttons = [...list.querySelectorAll('[data-filter]')];
    const search = list.querySelector('input[type="search"]');
    const items = [...list.querySelectorAll('[data-category]')];
    const summary = list.querySelector('.filter-summary');
    const empty = list.querySelector('.no-results');
    // Search only what people read: not placeholder labels, link boilerplate or screen-reader notes.
    const ignored = '[data-placeholder], .ref-original, .sr-only';
    const searchText = new Map(items.map(item => {
      const copy = item.cloneNode(true);
      copy.querySelectorAll(ignored).forEach(node => node.remove());
      return [item, copy.textContent.toLocaleLowerCase()];
    }));
    // Each button group (or the single bar) keeps its own selection; a row must satisfy all of them.
    const groupOf = button => button.closest('[data-filter-group]') || list;
    const selection = new Map(buttons.map(button => [groupOf(button), 'all']));
    const isAll = key => key.startsWith('all');
    function applyFilters() {
      const term = (search?.value || '').trim().toLocaleLowerCase();
      let count = 0;
      items.forEach(item => {
        const tokens = item.dataset.category.split(' ');
        const inGroups = [...selection.values()].every(key => isAll(key) || tokens.includes(key));
        const match = inGroups && searchText.get(item).includes(term);
        item.hidden = !match;
        if (match) { count++; item.classList.add('in-view'); }
      });
      if (summary) summary.textContent = `${count} 条记录`;
      if (empty) empty.hidden = count !== 0;
    }
    buttons.forEach(button => button.addEventListener('click', () => {
      const group = groupOf(button);
      selection.set(group, button.dataset.filter);
      buttons.filter(other => groupOf(other) === group).forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      applyFilters();
    }));
    search?.addEventListener('input', applyFilters);
    applyFilters();
  });

  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const text = document.getElementById(button.dataset.copy)?.textContent.trim();
      const feedback = button.parentElement.querySelector('.copy-feedback');
      try {
        await navigator.clipboard.writeText(text);
        if (feedback) feedback.textContent = '已复制';
      } catch {
        if (feedback) feedback.textContent = '请选中文字复制，或下载简介。';
      }
    });
  });

  const form = document.querySelector('.contact-form');
  if (form) {
    const type = new URLSearchParams(location.search).get('type');
    const select = form.querySelector('[name="type"]');
    if ([...select.options].some(option => option.value === type)) select.value = type;
    const ready = document.querySelector('.email-ready');
    const fieldNames = { name: '姓名', email: '邮箱', type: '联系类型', message: '留言' };
    function chineseValidation(field) {
      field.setCustomValidity('');
      if (field.validity.valueMissing) field.setCustomValidity(`请填写${fieldNames[field.name] || '此项'}。`);
      else if (field.validity.typeMismatch) field.setCustomValidity('请输入有效的邮箱地址，例如：name@example.com。');
      else if (field.validity.tooLong) field.setCustomValidity(`请将内容缩短至 ${field.maxLength} 个字符以内。`);
    }
    form.addEventListener('invalid', event => chineseValidation(event.target), true);
    form.addEventListener('input', event => {
      ready.hidden = true;
      if (event.target.matches('input, select, textarea')) chineseValidation(event.target);
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const label = select.selectedOptions[0].textContent;
      const subject = `${label} — ${data.get('name')}`;
      const body = `姓名：${data.get('name')}\n邮箱：${data.get('email')}\n机构：${data.get('organisation') || '—'}\n联系类型：${label}\n\n${data.get('message')}`;
      ready.querySelector('a').href = `mailto:Drkervis@xingyu.global?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      ready.hidden = false;
      ready.focus({ preventScroll: true });
      ready.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'nearest' });
    });
  }
})();
