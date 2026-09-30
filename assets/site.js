(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.progress');
  let scheduled = false;
  function updateScroll() {
    header?.classList.toggle('scrolled', window.scrollY > 30);
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${distance > 0 ? Math.min(window.scrollY / distance, 1) : 0})`;
    scheduled = false;
  }
  window.addEventListener('scroll', () => {
    if (!scheduled) { requestAnimationFrame(updateScroll); scheduled = true; }
  }, { passive: true });
  updateScroll();

  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.mobile-menu');
  function setMenu(open) {
    if (!menu || !toggle) return;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭导航 / Close menu' : '打开导航 / Open menu');
    document.body.classList.toggle('menu-open', open);
    document.querySelector('main')?.toggleAttribute('inert', open);
    document.querySelector('.site-footer')?.toggleAttribute('inert', open);
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
  const desktop = matchMedia('(min-width: 961px)');
  desktop.addEventListener('change', () => { if (desktop.matches && menu && !menu.hidden) setMenu(false); });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
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
    let category = 'all';
    function applyFilters() {
      const term = (search?.value || '').trim().toLocaleLowerCase();
      let count = 0;
      items.forEach(item => {
        const match = (category === 'all' || item.dataset.category.split(' ').includes(category)) && item.textContent.toLocaleLowerCase().includes(term);
        item.hidden = !match;
        if (match) { count++; item.classList.add('in-view'); }
      });
      if (summary) summary.textContent = `${count} 条记录 / ${count} ${count === 1 ? 'record' : 'records'}`;
      if (empty) empty.hidden = count !== 0;
    }
    buttons.forEach(button => button.addEventListener('click', () => {
      category = button.dataset.filter;
      buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
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
        if (feedback) feedback.textContent = '已复制 / Copied';
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
    form.addEventListener('input', () => { ready.hidden = true; });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const label = select.selectedOptions[0].textContent;
      const subject = `${label} — ${data.get('name')}`;
      const body = `姓名 / Name: ${data.get('name')}\n邮箱 / Email: ${data.get('email')}\n机构 / Organisation: ${data.get('organisation') || '—'}\n联系类型 / Enquiry: ${label}\n\n${data.get('message')}`;
      ready.querySelector('a').href = `mailto:Drkervis@xingyu.global?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      ready.hidden = false;
      ready.focus({ preventScroll: true });
      ready.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'nearest' });
    });
  }
})();
