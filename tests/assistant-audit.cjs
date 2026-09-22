const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.env.BASE_URL || 'http://127.0.0.1:4173';
const evidence = 'test-results';
fs.mkdirSync(evidence, { recursive: true });
const results = { viewports: [], scenarios: [], assets: [], errors: [] };
let browser;
async function context(viewport) {
  const c = await browser.newContext({ viewport, hasTouch: viewport.width <= 768, isMobile: viewport.width < 600, deviceScaleFactor: 2 });
  await c.route(/googletagmanager\.com|google-analytics\.com/, r => r.fulfill({ body: '' }));
  return c;
}
async function ready(page) {
  await page.goto(root);
  await page.waitForFunction(() => document.querySelector('.archive-loader').hidden);
}
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const [width, height] of [[375,667],[390,844],[393,852],[412,915],[430,932],[768,1024],[1440,900],[1920,1080]]) {
    const c = await context({ width, height });
    const p = await c.newPage();
    p.on('pageerror', e => results.errors.push(e.message));
    let imports = 0;
    p.on('request', r => { if (r.url().endsWith('/archive-search.js')) imports++; });
    await ready(p);
    assert.equal(imports, 0, 'No search code on startup');
    assert.equal(await p.locator('main .archive-assistant').count(), 0);
    const mainBefore = await p.locator('main').boundingBox();
    await p.locator('.assistant-launcher').click();
    await p.waitForFunction(() => document.querySelector('.assistant-status').textContent === '');
    assert.equal(imports, 1);
    assert.equal(await p.evaluate(() => document.activeElement.className), 'assistant-close');
    if (width < 600) {
      assert.equal(await p.locator('main').evaluate(el => el.inert), true);
      await p.keyboard.press('Shift+Tab');
      assert.equal(await p.evaluate(() => document.activeElement.type), 'submit');
      await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(() => document.activeElement.className), 'assistant-close');
    } else assert.equal(await p.locator('main').evaluate(el => el.inert), false);
    assert.deepEqual(await p.locator('main').boundingBox(), mainBefore, 'Aside causes no main reflow');
    const bounds = await p.locator('.assistant-panel').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, JSON.stringify(bounds));
    if (width > 600) assert.ok(bounds.width >= 380 && bounds.width <= 430);
    const ask = async query => {
      await p.locator('#archive-question').fill(query);
      await p.locator('.assistant-form button').click();
      await p.waitForFunction(() => !document.querySelector('.assistant-form button').disabled);
    };
    await ask('Fratello');
    assert.ok(await p.locator('.assistant-messages a[href="https://menu.fratellofast.food/"]').count());
    await ask('<img src=x onerror=alert(1)>');
    assert.equal(await p.locator('.assistant-messages img').count(), 0, 'Input is text, never HTML');
    await ask('unlisted-qualification-zzzzz');
    assert.match(await p.locator('.assistant-messages').innerText(), /couldn’t find an entry/);
    for (let i = 0; i < 3; i++) await ask('privacy');
    const scroll = await p.locator('.assistant-messages').evaluate(el => {
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = 0; const top = el.scrollTop;
      el.scrollTop = max;
      return { max, top, bottom: el.scrollTop };
    });
    assert.ok(scroll.max > 0 && scroll.top === 0 && scroll.bottom > 0, 'Conversation scrolls independently');
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), width);
    const axe = await new AxeBuilder({ page: p }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('.assistant-panel').isVisible(), false);
    assert.equal(await p.locator('main').evaluate(el => el.inert), false);
    assert.equal(await p.evaluate(() => document.activeElement.className), 'assistant-launcher');
    await p.locator('.assistant-launcher').click();
    assert.equal(imports, 1, 'Reopening reuses the index');
    await p.locator('.assistant-close').click();
    // Footer content can be fully scrolled above the launcher.
    await p.locator('footer').scrollIntoViewIfNeeded();
    const launcher = await p.locator('.assistant-launcher').boundingBox();
    const footer = await p.locator('footer').boundingBox();
    assert.ok(footer.y + footer.height <= launcher.y, 'Launcher leaves footer readable');
    await p.locator('#contact').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${evidence}/directory-${width}x${height}.png` });
    await p.locator('.assistant-launcher').click();
    await p.screenshot({ path: `${evidence}/assistant-${width}x${height}.png` });
    // Emulate keyboard visual-viewport shrink and pan, not a physical OS keyboard.
    if (width < 600) {
      await p.evaluate(() => {
        Object.defineProperties(visualViewport, { height: { configurable: true, value: 360 }, offsetTop: { configurable: true, value: 40 } });
        visualViewport.dispatchEvent(new Event('resize'));
      });
      const input = await p.locator('#archive-question').boundingBox();
      assert.ok(input.y >= 40 && input.y + input.height <= 400, `Input above simulated keyboard: ${JSON.stringify(input)}`);
      await p.screenshot({ path: `${evidence}/assistant-keyboard-${width}.png` });
    }
    results.viewports.push({ width, height, lazy: true, opensCloses: true, escapeAndFocus: true, noMainReflow: true, noOverflow: true, scrolls: true, axeViolations: 0, keyboard: width < 600 ? 'simulated visual viewport shrink and pan passed' : 'not applicable' });
    console.log(`PASS assistant ${width}x${height}`);
    await c.close();
  }
  const c = await context({ width: 390, height: 844 });
  const p = await c.newPage();
  await c.route('**/archive-search.js', route => route.abort());
  await ready(p);
  await p.locator('.assistant-launcher').click();
  await p.waitForFunction(() => document.querySelector('.assistant-status').textContent.includes('could not load'));
  await p.keyboard.press('Escape');
  await p.locator('.hero-link.primary-link').click();
  assert.equal(new URL(p.url()).hash, '#projects');
  results.scenarios.push('Failed assistant module leaves close, Escape, and portfolio links usable; loader already complete');
  await c.close();

  const resizeContext = await context({ width: 390, height: 844 });
  const resizePage = await resizeContext.newPage();
  await ready(resizePage);
  await resizePage.locator('.assistant-launcher').click();
  await resizePage.setViewportSize({ width: 1440, height: 900 });
  await resizePage.waitForFunction(() => !document.querySelector('main').inert);
  assert.equal(await resizePage.locator('.assistant-panel').getAttribute('aria-modal'), null);
  await resizePage.setViewportSize({ width: 390, height: 844 });
  await resizePage.waitForFunction(() => document.querySelector('main').inert);
  await resizePage.keyboard.press('Escape');
  assert.equal(await resizePage.locator('main').evaluate(el => el.inert), false);
  results.scenarios.push('Phone sheet traps focus; desktop resize restores non-modal background; closing restores page');
  await resizeContext.close();

  const assetsContext = await context({ width: 1440, height: 900 });
  const assetPage = await assetsContext.newPage();
  await ready(assetPage);
  results.assets = await assetPage.evaluate(async () => {
    const sources = [...new Set([...document.querySelectorAll('.logo-frame img')].map(img => img.src))];
    return Promise.all(sources.map(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
      const ctx = canvas.getContext('2d');
      const scale = Math.min(600 / img.naturalWidth, 400 / img.naturalHeight);
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let transparent = 0, minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (data[(y*w+x)*4+3] === 0) transparent++;
        else { minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y); }
      }
      return { src: new URL(src).pathname, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, transparentFraction: transparent / (w*h), bounds: [minX/w,minY/h,maxX/w,maxY/h] };
    }));
  });
  assert.equal(results.assets.length, 4);
  results.assets.forEach(asset => assert.ok(asset.transparentFraction > .15, `${asset.src}: transparent background`));
  const canonical = await assetPage.locator('.logo-frame img').evaluateAll(images => images.map(img => img.getAttribute('src')));
  assert.equal(canonical.filter(src => src === 'assets/brands/tryhackme.svg').length, 2);
  assert.equal(canonical.filter(src => src === 'assets/brands/hackthebox.svg').length, 2);
  await assetsContext.close();
  assert.deepEqual(results.errors, []);
})().catch(error => { results.failure = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync(`${evidence}/assistant-results.json`, JSON.stringify(results, null, 2));
  await browser?.close();
});
