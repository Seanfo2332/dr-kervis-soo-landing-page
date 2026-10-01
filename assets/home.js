(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 901px)');
  const root = document.documentElement;
  const COVERED = 0.98; // once the panel covers this much of the hero, the hero's buttons are out of reach
  const PIN_SLACK = 8; // px of overflow the card row may have before it is worth pinning
  let scheduled = false;

  // The hero stays pinned; this tracks how far the navy panel has slid over it (0 = none, 1 = fully covered).
  const heroInner = document.querySelector('.hero-inner');
  const firstPanel = document.querySelector('.stage > .panel');
  const heroControls = document.querySelectorAll('.hero-cta, .scroll-btn, .hero-social');
  let heroCovered = false;
  function updateCover() {
    if (!heroInner || !firstPanel) return;
    const covered = 1 - Math.min(Math.max(firstPanel.getBoundingClientRect().top / window.innerHeight, 0), 1);
    heroInner.style.setProperty('--cover', covered.toFixed(3));
    // A covered hero must not keep focusable controls behind the panel (the heading stays readable).
    const isCovered = covered >= COVERED;
    if (isCovered === heroCovered) return;
    heroCovered = isCovered;
    heroControls.forEach(control => control.toggleAttribute('inert', isCovered));
  }

  // Business cards: while pinned, the page's vertical scroll moves the row sideways.
  const section = document.querySelector('[data-hscroll]');
  const track = section?.querySelector('.hscroll-track');
  let pinned = false;
  let range = 0;
  function unpin() {
    pinned = false;
    root.classList.remove('js-hscroll');
    track.style.removeProperty('--hx');
    section.style.removeProperty('--hscroll-height');
  }
  // Measured from the cards themselves, so the pinned/unpinned class never has to be toggled
  // (toggling it on resize moved the page under the visitor).
  function rowWidth() {
    const trackLeft = track.getBoundingClientRect().left;
    const lastRight = track.lastElementChild.getBoundingClientRect().right;
    return lastRight - trackLeft + track.scrollLeft + parseFloat(getComputedStyle(track).paddingRight);
  }
  function measure() {
    if (!section || !track?.lastElementChild) return;
    if (!wide.matches || reduced.matches) { unpin(); return; }
    range = rowWidth() - root.clientWidth;
    if (range <= PIN_SLACK) { unpin(); return; }
    section.style.setProperty('--hscroll-height', `${range + window.innerHeight}px`);
    if (!pinned) track.scrollLeft = 0;
    pinned = true;
    root.classList.add('js-hscroll');
  }
  function updateRow() {
    if (!pinned) return;
    const progress = Math.min(Math.max(-section.getBoundingClientRect().top / range, 0), 1);
    track.style.setProperty('--hx', `${(-progress * range).toFixed(1)}px`);
  }
  // Tabbing to a card that is off screen scrolls the page to the matching position instead.
  // Mouse focus is left alone, otherwise a click would make the page jump away from the pointer.
  track?.addEventListener('focusin', event => {
    if (!pinned || !event.target.matches(':focus-visible')) return;
    const card = event.target.closest('.card');
    if (!card) return;
    track.parentElement.scrollLeft = 0;
    const offset = card.getBoundingClientRect().left - track.getBoundingClientRect().left - parseFloat(getComputedStyle(track).paddingLeft);
    const top = section.getBoundingClientRect().top + window.scrollY + Math.min(Math.max(offset, 0), range);
    window.scrollTo({ top, behavior: 'instant' });
  });

  // The reel opens the 916 video in a dialog. Without scripting it is a plain link to the event page.
  const reel = document.querySelector('[data-reel]');
  const dialog = document.getElementById('reel-dialog');
  if (reel && dialog && typeof dialog.showModal === 'function') {
    const video = dialog.querySelector('video');
    let pressedBackdrop = false;
    reel.addEventListener('click', event => {
      event.preventDefault();
      if (!video.getAttribute('src')) {
        video.poster = video.dataset.poster;
        video.src = video.dataset.src;
      }
      dialog.showModal();
      video.play().catch(() => {});
    });
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    // Only a press that also started on the backdrop closes it, so dragging the seek bar out of the video does not.
    dialog.addEventListener('pointerdown', event => { pressedBackdrop = event.target === dialog; });
    dialog.addEventListener('click', event => { if (event.target === dialog && pressedBackdrop) dialog.close(); });
    dialog.addEventListener('close', () => video.pause());
  }

  function update() {
    updateCover();
    updateRow();
    scheduled = false;
  }
  const schedule = () => { if (!scheduled) { requestAnimationFrame(update); scheduled = true; } };
  const remeasure = () => { measure(); schedule(); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });
  window.addEventListener('load', remeasure);
  wide.addEventListener('change', remeasure);
  reduced.addEventListener('change', remeasure);
  measure();
  update();
})();
