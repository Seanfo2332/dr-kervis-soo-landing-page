// Run with an existing static server: node tests/verify_site.cjs
// Playwright is used only for verification; the website has no runtime dependencies.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.SITE_URL || 'http://127.0.0.1:8000';
const root = path.resolve(__dirname, '..');

// The computed colour of a design token, so tests follow the stylesheet instead of repeating its hex values.
const tokenColour = (page, token) => page.evaluate(name => {
  const probe = document.createElement('i');
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}, token);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    // The homepage opens directly (no redirect gate); the entrance at / still leads into it.
    await page.goto(`${BASE}/landing.html`);
    assert.equal(new URL(page.url()).pathname, '/landing.html', 'landing.html must not redirect a fresh visitor');
    await page.locator('#hero-title').waitFor();
    assert.match(await page.locator('h1').innerText(), /Dr\s+Kervis/);
    await page.goto(`${BASE}/`);
    await page.locator('#enter-btn').click();
    await page.waitForURL(`${BASE}/landing.html`, { timeout: 15000 });
    await page.locator('#hero-title').waitFor();
    console.log('PASS: homepage opens directly and the entrance Enter button leads into it');

    // Hero: layered cut-out portrait, PDF wording and buttons.
    await page.goto(`${BASE}/landing.html`);
    const cutout = page.locator('.hero-cutout');
    await cutout.waitFor();
    assert.ok(await cutout.evaluate(img => img.complete && img.naturalWidth > 0), 'hero cut-out loads');
    assert.match(await page.locator('.hero').innerText(), /ENTREPRENEUR · AI & DIGITAL ECONOMY ADVOCATE · PHILANTHROPIST/i);
    assert.match(await page.locator('.hero').innerText(), /Building businesses\. Empowering people\. Creating impact\./);
    assert.match(await page.locator('.hero a[href="/story/"]').innerText(), /Discover His Journey/);
    assert.match(await page.locator('.hero a[href="/business/"]').innerText(), /Explore His Work/);
    assert.match(await page.locator('.closing h2').innerText(), /Let.s Create a\s+Better Tomorrow/);
    assert.equal(await page.locator('.reel').count(), 1, 'one showreel capsule');
    assert.equal(await page.locator('.reel-collage img').count(), 6, 'the reel collage uses six real photos');
    assert.equal(await page.locator('.hero-social a').count(), 5, 'five social icons in the hero');
    console.log('PASS: hero cut-out, PDF wording, buttons, reel capsule, social icons');

    // Navigation: floating pill with four primary links + Menu; overlay lists all eight pages.
    const pillLinks = await page.locator('.pill-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert.deepEqual(pillLinks, ['/dr-kervis-soo/', '/story/', '/business/', '/insights/']);
    assert.equal(await page.locator('.pill-nav .menu-toggle').count(), 1);
    assert.equal(await page.locator('.site-footer a[href="/speaking/"]').count(), 1, 'Speaking is linked from the footer');
    const overlayLinks = await page.locator('.mobile-menu a[href^="/"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    for (const href of ['/dr-kervis-soo/', '/story/', '/business/', '/insights/', '/social-impact/', '/media/', '/speaking/', '/contact/']) {
      assert.ok(overlayLinks.includes(href), `overlay menu links to ${href}`);
    }
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.mobile-menu').isVisible(), true, 'menu opens on desktop too');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mobile-menu').isVisible(), false);
    console.log('PASS: floating pill navigation and full-screen menu overlay');

    // Placeholders are explicit, labelled and machine-findable; the doubtful clip is gone.
    const placeholders = await page.context().request.get(`${BASE}/speaking/zocco-group-opening/`);
    const speakingHtml = await placeholders.text();
    assert.ok(!speakingHtml.includes('career.mp4'), 'career.mp4 must not be referenced');
    assert.ok(speakingHtml.includes('data-placeholder="video"'), 'speaking opening page has a video placeholder');
    await page.goto(`${BASE}/media/`);
    assert.equal(await page.locator('[data-placeholder]').count(), 0, 'media thumbnails are real photos, not placeholders');
    await page.goto(`${BASE}/awards/ai-honorary-fellow/`);
    for (const text of await page.locator('[data-placeholder]').allInnerTexts()) assert.ok(text.trim().length > 0, 'placeholder has a visible label');
    console.log('PASS: placeholders labelled, video placeholder in place of career.mp4');

    // Self-hosted type: no Google Fonts request from the entrance or the homepage.
    const fontRequests = [];
    page.on('request', request => { if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) fontRequests.push(request.url()); });
    await page.goto(`${BASE}/`);
    await page.goto(`${BASE}/landing.html`);
    assert.deepEqual(fontRequests, [], 'fonts must be self-hosted');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => [...document.fonts].some(face => face.family.replace(/"/g, '') === 'Inter Tight' && face.status === 'loaded')), true, 'Inter Tight loaded');
    console.log('PASS: self-hosted Inter Tight, no Google Fonts requests');

    // Reduced motion: the reel collage stops drifting and the card row is a plain swipeable strip.
    assert.equal(await page.locator('.reel-collage img').first().evaluate(image => getComputedStyle(image).animationName), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('js-hscroll')), false, 'no pinned row with reduced motion');
    assert.equal(await page.locator('.hscroll-track').evaluate(track => getComputedStyle(track).overflowX), 'auto');
    console.log('PASS: reduced motion disables the reel drift and the pinned card row');

    // Normal-motion path (the main context above runs with reduced motion): reveals fire and the portrait drifts.
    const motionContext = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const motionPage = await motionContext.newPage();
    await motionPage.goto(`${BASE}/landing.html`);
    assert.equal(await motionPage.evaluate(() => document.documentElement.classList.contains('js-motion')), true);
    await motionPage.locator('.insights-section .reveal').first().scrollIntoViewIfNeeded();
    await motionPage.waitForFunction(() => document.querySelector('.insights-section .reveal.in-view'));
    await motionPage.evaluate(() => scrollTo(0, 300));
    await motionPage.waitForFunction(() => document.querySelector('.hero-cutout').style.getPropertyValue('--hero-shift') === '36.0px');
    assert.match(await motionPage.locator('.site-footer').innerText(), new RegExp(String(new Date().getFullYear())), 'footer shows the current year');
    console.log('PASS: normal-motion reveals, hero parallax and current-year footer');

    // Pinned hero, the panel that slides over it, and the header colours following the surface beneath.
    await motionPage.evaluate(() => scrollTo(0, 0));
    assert.equal(await motionPage.locator('.hero').evaluate(element => getComputedStyle(element).position), 'sticky', 'the hero is pinned');
    assert.equal(await motionPage.locator('.site-header').evaluate(element => element.classList.contains('on-dark')), false, 'dark header text over the light hero');
    await motionPage.evaluate(() => scrollTo(0, innerHeight));
    await motionPage.waitForFunction(() => Number(document.querySelector('.hero-inner').style.getPropertyValue('--cover')) > 0.9);
    await motionPage.waitForFunction(() => document.querySelector('.site-header').classList.contains('on-dark'));
    assert.equal(await motionPage.locator('.hero-cta').evaluate(element => element.hasAttribute('inert')), true, 'hero buttons are out of reach once the panel covers them');
    assert.equal(await motionPage.locator('.hero h1').count(), 1, 'the hero heading stays available');
    await motionPage.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await motionPage.waitForFunction(() => !document.querySelector('.hero-cta').hasAttribute('inert'));
    console.log('PASS: pinned hero, sliding panel and header tone');

    // The header follows the panel that is actually in view, including where light and navy panels overlap.
    for (const [selector, dark] of [['.impact-section', true], ['.recognition-section', false], ['.closing', true]]) {
      await motionPage.evaluate(target => scrollTo({ top: document.querySelector(target).getBoundingClientRect().top + scrollY - 10, behavior: 'instant' }), selector);
      await motionPage.waitForFunction(expected => document.querySelector('.site-header').classList.contains('on-dark') === expected, dark);
    }
    console.log('PASS: header tone follows the visible panel across navy and light boundaries');

    // The business cards slide sideways while the section is pinned.
    assert.equal(await motionPage.evaluate(() => document.documentElement.classList.contains('js-hscroll')), true);
    const rowTop = await motionPage.evaluate(() => document.querySelector('[data-hscroll]').getBoundingClientRect().top + scrollY);
    assert.ok(await motionPage.evaluate(() => document.querySelector('[data-hscroll]').offsetHeight > innerHeight * 1.4), 'the pinned section is taller than the viewport');
    await motionPage.evaluate(top => scrollTo(0, top + 400), rowTop);
    await motionPage.waitForFunction(() => parseFloat(document.querySelector('.hscroll-track').style.getPropertyValue('--hx')) < -100);
    assert.equal(await motionPage.locator('.hscroll-track .card').count(), 5, 'company card plus four business fields');
    console.log('PASS: business cards scroll sideways');

    // A mouse press on a card must not move the page; only keyboard focus repositions the row.
    await motionPage.evaluate(() => document.addEventListener('click', event => event.preventDefault(), true));
    const cardCentre = await motionPage.evaluate(() => {
      const card = [...document.querySelectorAll('.hscroll-track .card')].find(item => { const box = item.getBoundingClientRect(); return box.left > 40 && box.right < innerWidth - 40; });
      const box = card.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    const beforePress = await motionPage.evaluate(() => scrollY);
    await motionPage.mouse.move(cardCentre.x, cardCentre.y);
    await motionPage.mouse.down();
    await motionPage.waitForTimeout(600); // a smooth scroll triggered by the press would be well under way by now
    assert.ok(Math.abs(await motionPage.evaluate(() => scrollY) - beforePress) < 2, 'mouse focus must not scroll the page');
    await motionPage.mouse.up();
    for (let step = 0; step < 6; step += 1) {
      await motionPage.keyboard.press('Tab');
      if (await motionPage.evaluate(() => document.activeElement === document.querySelector('.hscroll-track .card:last-child'))) break;
    }
    await motionPage.waitForFunction(() => {
      const box = document.querySelector('.hscroll-track .card:last-child').getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth + 1;
    });
    console.log('PASS: mouse press leaves the page alone, keyboard focus brings the last card into view');

    // Resizing while scrolled inside the pinned row keeps the visitor where they were.
    const beforeResize = await motionPage.evaluate(() => scrollY);
    await motionPage.setViewportSize({ width: 1300, height: 900 });
    await motionPage.waitForFunction(() => document.documentElement.classList.contains('js-hscroll'));
    await motionPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(Math.abs(await motionPage.evaluate(() => scrollY) - beforeResize) < 2, 'resize keeps the scroll position');
    await motionPage.setViewportSize({ width: 1440, height: 900 });
    console.log('PASS: resizing the window does not move the pinned row');

    // The reel opens the real video in a dialog and Escape closes it.
    await motionPage.locator('[data-reel]').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    assert.match(await motionPage.locator('[data-reel]').getAttribute('aria-label'), /Play reel/, 'the accessible name contains the visible words');
    assert.equal(await motionPage.locator('#reel-dialog video').getAttribute('poster'), null, 'the poster is not fetched until the dialog opens');
    await motionPage.locator('[data-reel]').click();
    assert.equal(await motionPage.locator('#reel-dialog').evaluate(element => element.open), true);
    assert.match(await motionPage.locator('#reel-dialog video').getAttribute('src'), /gala-reel\.mp4$/);
    assert.match(await motionPage.locator('#reel-dialog video').getAttribute('poster'), /gala-reel-poster\.webp$/);
    assert.equal(await motionPage.locator('#reel-dialog a[href$="#video"]').count(), 1, 'the dialog links to the written description');
    await motionPage.keyboard.press('Escape');
    assert.equal(await motionPage.locator('#reel-dialog').evaluate(element => element.open), false);
    assert.equal(await motionPage.evaluate(() => document.activeElement === document.querySelector('[data-reel]')), true, 'focus returns to the reel button');
    console.log('PASS: reel dialog plays the 916 video, closes with Escape and returns focus');

    // Dragging out of the video and releasing on the backdrop must not close it; a real backdrop click does.
    await motionPage.locator('[data-reel]').click();
    const videoBox = await motionPage.locator('#reel-dialog video').boundingBox();
    await motionPage.mouse.move(videoBox.x + videoBox.width / 2, videoBox.y + videoBox.height / 3);
    await motionPage.mouse.down();
    await motionPage.mouse.move(6, 6);
    await motionPage.mouse.up();
    assert.equal(await motionPage.locator('#reel-dialog').evaluate(element => element.open), true, 'drag-release on the backdrop keeps the dialog open');
    await motionPage.mouse.click(6, 6);
    assert.equal(await motionPage.locator('#reel-dialog').evaluate(element => element.open), false, 'a plain backdrop click closes it');
    console.log('PASS: reel dialog ignores drag-release on the backdrop');

    // On a short window the close button, the video controls and the description link all stay on screen.
    await motionPage.setViewportSize({ width: 1280, height: 560 });
    await motionPage.locator('[data-reel]').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await motionPage.locator('[data-reel]').click();
    const onScreen = await motionPage.evaluate(() => ['.dialog-close', 'video', '.dialog-note'].map(selector => {
      const box = document.querySelector(`#reel-dialog ${selector}`).getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
    }));
    assert.deepEqual(onScreen, [true, true, true], 'dialog parts fit a 560px-tall window');
    await motionPage.keyboard.press('Escape');
    await motionPage.setViewportSize({ width: 1440, height: 900 });
    console.log('PASS: reel dialog fits short windows');

    // Quick-contact drawer and the copy-email button in the closing panel.
    await motionPage.locator('.side-tab').click();
    assert.equal(await motionPage.locator('#quick-drawer').isVisible(), true);
    assert.equal(await motionPage.locator('#quick-drawer a[href="mailto:Drkervis@xingyu.global"]').count(), 1);
    await motionPage.keyboard.press('Escape');
    assert.equal(await motionPage.locator('#quick-drawer').isVisible(), false);
    await motionContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    await motionPage.locator('.copy-email').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await motionPage.locator('.copy-email').click();
    await motionPage.waitForFunction(() => document.querySelector('.closing .copy-status').textContent.includes('copied'));
    assert.equal(await motionPage.evaluate(() => navigator.clipboard.readText()), 'Drkervis@xingyu.global');
    await motionContext.close();
    console.log('PASS: quick-contact drawer and copy-email button');

    // Inner pages share the light base, with a navy closing panel.
    await page.goto(`${BASE}/story/`);
    assert.equal(await page.locator('.page-intro').evaluate(element => getComputedStyle(element).backgroundColor), await tokenColour(page, '--page'));
    assert.equal(await page.locator('.closing').evaluate(element => getComputedStyle(element).backgroundColor), await tokenColour(page, '--navy'));
    console.log('PASS: inner pages use the light base and a navy closing panel');

    // Check every generated page, local asset and link, metadata and schema.
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const routes = [...sitemap.matchAll(/<loc>https:\/\/drkervis\.com([^<]*)<\/loc>/g)].map(match => match[1]).filter(route => route !== '/');
    const internalTargets = new Set();
    for (const route of routes) {
      const response = await page.goto(BASE + route);
      assert.equal(response.status(), 200, route);
      assert.equal(await page.locator('h1').count(), 1, `${route}: one H1`);
      assert.ok(await page.locator('meta[name="description"]').getAttribute('content'), `${route}: description`);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://drkervis.com' + route);
      await page.locator('script[type="application/ld+json"]').evaluate(element => JSON.parse(element.textContent));
      const links = await page.locator('a[href], img[src], script[src], link[rel="stylesheet"], source[src]').evaluateAll(elements => elements.map(element => element.getAttribute('href') || element.getAttribute('src')));
      for (const href of links) {
        if (href.startsWith('/') || href.startsWith('#')) {
          const url = new URL(href, BASE + route);
          internalTargets.add(url.pathname + url.search + url.hash);
        }
      }
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${route}: overflow at ${width}`);
      }
    }
    for (const target of internalTargets) {
      const url = new URL(target, BASE);
      const response = await context.request.get(url.pathname + url.search);
      assert.equal(response.status(), 200, `Broken local target: ${target}`);
      if (url.hash && url.pathname !== '/') {
        const html = await response.text();
        const id = decodeURIComponent(url.hash.substring(1));
        assert.ok(html.includes(`id="${id}"`) || html.includes(`id='${id}'`), `Missing anchor: ${target}`);
      }
    }
    console.log(`PASS: ${routes.length} pages, ${internalTargets.size} local targets, metadata, schema, and mobile/desktop overflow`);

    // Media: verified coverage, labelled by type, linked to the originals; topic/type filters and search compose.
    await page.goto(`${BASE}/media/`);
    const rowCount = await page.locator('.reference-row').count();
    assert.ok(rowCount >= 14, `media page lists the verified coverage (${rowCount})`);
    assert.equal(await page.locator('blockquote').count(), 0, 'no unsourced quotes on the media page');
    for (const row of await page.locator('.reference-row').all()) {
      assert.ok((await row.locator('.ref-type').innerText()).trim().length > 0, 'every row has a type label');
      const original = row.locator('a.ref-original');
      assert.match(await original.getAttribute('href'), /^https:\/\//);
      assert.match(await original.getAttribute('rel'), /noopener/);
      assert.equal(await original.getAttribute('target'), '_blank');
    }
    await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.querySelectorAll('.ref-thumb')].every(image => image.complete && image.naturalWidth > 0));
    const aiExpected = await page.locator('.reference-row[data-category~="ai"]').count();
    assert.ok(aiExpected > 0 && aiExpected < rowCount, 'topic filter is meaningful');
    await page.locator('[data-filter="ai"]').click();
    assert.equal(await page.locator('.reference-row:visible').count(), aiExpected);
    // Topic and type filters combine: AI AND platform post.
    const bothExpected = await page.locator('.reference-row[data-category~="ai"][data-category~="platform"]').count();
    assert.ok(bothExpected > 0 && bothExpected < aiExpected, 'the combined filter narrows the list');
    await page.locator('[data-filter="platform"]').click();
    assert.equal(await page.locator('.reference-row:visible').count(), bothExpected);
    await page.locator('[data-filter="all"]').click();
    await page.locator('[data-filter="all-types"]').click();
    await page.getByRole('searchbox').fill('查看原文');
    assert.equal(await page.locator('.reference-row:visible').count(), 0, 'link boilerplate is not searchable');
    await page.getByRole('searchbox').fill('On Asia News');
    assert.equal(await page.locator('.reference-row:visible').count(), 1);
    await page.getByRole('searchbox').fill('no-matching-record-123');
    assert.equal(await page.locator('.reference-row:visible').count(), 0);
    assert.equal(await page.locator('.no-results').isVisible(), true);
    await page.getByRole('searchbox').fill('');
    await page.locator('[data-filter="all"]').click();
    assert.equal(await page.locator('.reference-row:visible').count(), rowCount);

    await page.goto(`${BASE}/insights/`);
    await page.locator('[data-filter="creators"]').click();
    assert.equal(await page.locator('.insight:visible').count(), 1);
    await page.goto(`${BASE}/archive/`);
    await page.locator('[data-filter="impact"]').click();
    assert.equal(await page.locator('.archive-item:visible').count(), 2);
    console.log('PASS: media, insights and archive filters, keyword search and empty states');

    // Event record: video, real photos, neutral degree caption, event structured data, event coverage.
    await page.goto(`${BASE}/speaking/xing-yu-grand-honours-2026/`);
    const video = page.locator('video');
    assert.equal(await video.count(), 1);
    assert.equal(await video.getAttribute('preload'), 'none');
    assert.match(await video.getAttribute('poster'), /gala-reel-poster\.webp$/);
    assert.equal(await page.locator('video source[type="video/mp4"]').count(), 1);
    await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.querySelectorAll('.event-gallery img')].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator('.event-gallery img').count(), 3);
    assert.doesNotMatch(await page.locator('.event-gallery').innerText(), /Lincoln|Malaya|林肯|马来亚/, 'degree segment is captioned without naming an institution');
    assert.equal(await page.locator('#coverage .reference-row').count(), 4);
    const schemaTypes = await page.locator('script[type="application/ld+json"]').evaluate(element => JSON.parse(element.textContent)['@graph'].map(node => node['@type']));
    assert.ok(schemaTypes.includes('Event') && schemaTypes.includes('VideoObject'), 'Event and VideoObject structured data');
    const graph = await page.locator('script[type="application/ld+json"]').evaluate(element => JSON.parse(element.textContent)['@graph']);
    const eventNode = graph.find(node => node['@type'] === 'Event');
    assert.equal(eventNode.startDate, '2026-09-16');
    assert.match(eventNode.location.name, /D Theatre/);
    assert.ok(graph.find(node => node['@type'] === 'VideoObject').uploadDate);
    assert.match(await page.locator('meta[property="og:image"]').getAttribute('content'), /gala-podium-og\.jpg$/);
    assert.doesNotMatch(await page.locator('#overview').innerText(), /Lincoln|Malaya|林肯|马来亚/, 'overview names no institution');
    for (const alt of await page.locator('.event-gallery img').evaluateAll(images => images.map(image => image.alt))) assert.doesNotMatch(alt, /Lincoln|Malaya|林肯|马来亚/);
    assert.equal(await page.locator('.video-description li').count() > 0, true, 'the video has a text description');
    // The article column is narrow at tablet widths: coverage rows must stay readable there.
    for (const width of [700, 820, 1000]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const bodyWidths = await page.locator('#coverage .ref-body').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
      assert.ok(bodyWidths.every(value => value >= 220), `coverage rows readable at ${width}px (${bodyWidths.map(Math.round)})`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `no overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Declared image dimensions keep the real aspect ratio (prevents layout shift).
    for (const route of ['/media/', '/speaking/', '/archive/', '/speaking/xing-yu-grand-honours-2026/']) {
      await page.goto(`${BASE}${route}`);
      await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; }));
      await page.waitForFunction(() => [...document.images].every(image => image.complete));
      const skewed = await page.evaluate(() => [...document.images].filter(image => image.naturalWidth && Math.abs(image.naturalWidth / image.naturalHeight - Number(image.getAttribute('width')) / Number(image.getAttribute('height'))) > 0.02).map(image => image.getAttribute('src')));
      assert.deepEqual(skewed, [], `${route}: width/height attributes match the image aspect ratio`);
    }
    await page.goto(`${BASE}/speaking/xing-yu-grand-honours-2026/`);
    const reel = await context.request.head(`${BASE}/images/events/gala-reel.mp4`);
    assert.equal(reel.status(), 200);
    const bytes = Number(reel.headers()['content-length']);
    assert.ok(bytes > 1000000 && bytes < 25000000, `reel size is sensible (${bytes} bytes)`);
    await page.goto(`${BASE}/speaking/`);
    assert.equal(await page.locator('.appearance').count(), 4);
    assert.equal(await page.locator('.appearance a[href="/speaking/xing-yu-grand-honours-2026/"]').count(), 1);
    await page.goto(`${BASE}/press/`);
    assert.equal(await page.locator('a[download][href$=".jpg"], a[download][href$=".png"]').count(), 3);
    assert.equal((await context.request.get(`${BASE}/images/events/csr-portrait-press.jpg`)).status(), 200);
    console.log('PASS: event record (video, photos, neutral caption, schema, coverage), appearances and press downloads');

    // Contact invitations preselect the correct intent, validate input, and prepare a real mailto.
    for (const type of ['speaking', 'media']) {
      await page.goto(`${BASE}/contact/?type=${type}`);
      assert.equal(await page.locator('#type').inputValue(), type);
    }
    await page.locator('button[type="submit"]').click();
    assert.equal(await page.locator('.email-ready').isVisible(), false);
    await page.locator('#name').fill('Site QA');
    await page.locator('#email').fill('qa@example.com');
    await page.locator('#organisation').fill('Preview review');
    await page.locator('#message').fill('测试中文 & English + symbols\nSecond line');
    await page.locator('button[type="submit"]').click();
    assert.equal(await page.locator('.email-ready').isVisible(), true);
    const mail = new URL(await page.locator('.email-ready a').getAttribute('href'));
    assert.equal(mail.protocol, 'mailto:');
    assert.equal(mail.pathname, 'Drkervis@xingyu.global');
    assert.match(mail.searchParams.get('subject'), /媒体采访/);
    assert.match(mail.searchParams.get('body'), /测试中文 & English \+ symbols\nSecond line/);
    await page.locator('#message').fill('Updated text');
    assert.equal(await page.locator('.email-ready').isVisible(), false);
    console.log('PASS: contact intent, required fields, email encoding and draft invalidation');

    // Mobile menu closes with Escape and traps keyboard navigation while open.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/landing.html`);
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.mobile-menu').isVisible(), true);
    assert.equal(await page.locator('main').getAttribute('inert'), '');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mobile-menu').isVisible(), false);
    assert.equal(await page.locator('main').getAttribute('inert'), null);
    await page.locator('.menu-toggle').click();
    await page.locator('.mobile-menu a').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.menu-toggle').evaluate(element => element === document.activeElement), true);
    await page.locator('.mobile-menu a[href="/business/"]').click();
    await page.waitForURL(`${BASE}/business/`);
    assert.equal(await page.locator('.mobile-menu').isVisible(), false);
    console.log('PASS: mobile navigation, Escape, focus containment and page navigation');

    await page.goto(`${BASE}/press/`);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('[data-copy="bio-short"]').click();
    await page.waitForFunction(() => document.querySelector('.copy-feedback').textContent.includes('Copied'));
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /苏才育博士/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('a[href="/assets/dr-kervis-biographies.txt"]').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'dr-kervis-biographies.txt');
    console.log('PASS: press biography clipboard and file download');

    // Direct article links and content remain readable without JavaScript.
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const simple = await noJs.newPage();
    await simple.goto(`${BASE}/story/`);
    assert.equal(await simple.locator('h1').isVisible(), true);
    assert.ok(await simple.locator('main').innerText());
    await noJs.close();
    assert.deepEqual(errors, [], 'Unexpected browser exceptions');
    console.log('PASS: no-JavaScript content and zero runtime errors');

    // A failed external animation dependency must not trap visitors at the entrance.
    const fallback = await browser.newContext({ reducedMotion: 'reduce' });
    await fallback.route('https://unpkg.com/**', route => route.abort());
    const fallbackPage = await fallback.newPage();
    await fallbackPage.goto(BASE + '/');
    await fallbackPage.locator('#enter-btn').click();
    await fallbackPage.waitForURL(BASE + '/landing.html');
    assert.equal(await fallbackPage.locator('#hero-title').isVisible(), true);
    await fallback.close();
    console.log('PASS: entrance fallback when the animation CDN is unavailable');

    // Archive review screenshots after lazy images have been loaded.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${BASE}/landing.html`, { waitUntil: 'networkidle' });
    await page.locator('img[loading="lazy"]').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    for (const section of await page.locator('main > section').all()) {
      await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const output = path.join(process.env.TEMP || '/tmp', 'drkervis-review');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'homepage-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, 'homepage-mobile.png'), fullPage: true });
    await page.goto(`${BASE}/contact/?type=speaking`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(output, 'contact-mobile.png'), fullPage: true });
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
